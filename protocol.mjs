// RM0 protocol v1. No network, storage, or DOM dependencies.
export const LIMITS = Object.freeze({raw:65536, encoded:24000, compressed:18000, ratio:100, qr:2331, iceMs:10000});
const te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal:true});
export function requireTrue(value, code) { if (!value) throw new Error(code); }
export function b64(bytes) { let s=''; for(const b of bytes) s+=String.fromCharCode(b); return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
export function un64(s) { requireTrue(typeof s==='string' && s.length<=LIMITS.encoded && /^[\w-]+$/.test(s), 'Encoding'); return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0)); }
export function random(n=32) { return b64(crypto.getRandomValues(new Uint8Array(n))); }
export async function digest(s) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(s)))); }
export async function mac(secret,s) { const key=await crypto.subtle.importKey('raw',un64(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']); return b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,te.encode(s)))); }
export async function verifyMac(secret,s,sig) { const key=await crypto.subtle.importKey('raw',un64(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']); return crypto.subtle.verify('HMAC',key,un64(sig),te.encode(s)); }
export function answerBody(a) { return JSON.stringify([a.v,a.type,a.meeting,a.invitation,a.generation,a.offerHash,a.nonce,a.iceComplete,a.sdp]); }
export async function checkCode(offer,answer) { return (await digest(JSON.stringify([offer.sdp,answer.sdp,offer.meeting,offer.invitation,answer.generation]))).slice(0,10).toUpperCase(); }
async function transform(bytes, compress) {
 const stream=new Blob([bytes]).stream().pipeThrough(compress?new CompressionStream('deflate'):new DecompressionStream('deflate'));
 const reader=stream.getReader(), parts=[]; let total=0;
 try { while(true){ const {value,done}=await reader.read();if(done)break;total+=value.length;requireTrue(total<=LIMITS.raw && (compress || total<=bytes.length*LIMITS.ratio),'DecompressionLimit');parts.push(value); } }
 finally { await reader.cancel().catch(()=>{}); }
 const out=new Uint8Array(total);let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length;}return out;
}
export async function pack(obj) { const raw=te.encode(JSON.stringify(obj));requireTrue(raw.length<=LIMITS.raw,'RawLimit');const zipped=await transform(raw,true);requireTrue(zipped.length<=LIMITS.compressed,'CompressedLimit');return 'RM1.'+b64(zipped); }
export async function unpack(s) { requireTrue(typeof s==='string' && s.startsWith('RM1.') && s.length<=LIMITS.encoded,'Envelope');const bytes=un64(s.slice(4));requireTrue(bytes.length<=LIMITS.compressed,'CompressedLimit');const raw=await transform(bytes,false);const obj=JSON.parse(td.decode(raw));requireTrue(obj && !Array.isArray(obj) && obj.v===1,'Version');const stack=[[obj,0]];let nodes=0;while(stack.length){const [node,depth]=stack.pop();requireTrue(depth<=8&&++nodes<=512,'JsonComplexity');if(node&&typeof node==='object')for(const value of Object.values(node))stack.push([value,depth+1]);}return obj; }
export function validateSdp(sdp,type) {
 requireTrue(typeof sdp==='string' && te.encode(sdp).length<=60000 && sdp.startsWith('v=0\r\n'),'SDP');
 const lines=sdp.split('\r\n');
 requireTrue(lines.some(l=>/^a=fingerprint:sha-256 (?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(l)),'Fingerprint');
 requireTrue(lines.filter(l=>l.startsWith('m=')).length===2 && lines.some(l=>/^m=audio /.test(l)) && lines.some(l=>/^m=application /.test(l)) && !lines.some(l=>/^m=video /.test(l)),'Media');
 requireTrue(lines.some(l=>l.startsWith('a=ice-ufrag:')) && lines.some(l=>l.startsWith('a=ice-pwd:')),'ICECredentials');
 const candidates=lines.filter(l=>l.startsWith('a=candidate:'));
 requireTrue(candidates.length>0 && candidates.length<=64,'NoCandidates');
 requireTrue(candidates.every(l=>/ typ host(?: |$)/.test(l) && !/ typ (relay|srflx|prflx)(?: |$)/.test(l)),'HostCandidatesOnly');
 // Chromium may omit end-of-candidates in localDescription even after gathering=complete.
 // Keep the exact SDP bytes; complete gathering is attested by the bound envelope.
 requireTrue(type==='offer'||type==='answer','SdpType');
 return {bytes:te.encode(sdp).length,candidates:candidates.length,mdns:candidates.filter(c=>c.includes('.local')).length};
}
export function validInvitation(i,now=Date.now()) {
 requireTrue(i.v===1&&i.type==='offer' && i.iceComplete===true && /^[\w-]{20,64}$/.test(i.meeting) && /^[\w-]{20,64}$/.test(i.invitation) && un64(i.secret).length===32 && i.generation===1 && Number.isSafeInteger(i.expires) && i.expires>now && i.expires<=now+125000,'Invitation');
 validateSdp(i.sdp,'offer');
}
export async function validateAnswer(i,a,used=false,now=Date.now()) {
 requireTrue(!used,'Used');validInvitation(i,now);
 requireTrue(a.v===1&&a.type==='answer' && a.iceComplete===true && a.meeting===i.meeting && a.invitation===i.invitation && a.generation===i.generation && /^[\w-]{20,64}$/.test(a.nonce),'Binding');
 requireTrue(a.offerHash===await digest(i.sdp),'OfferHash');validateSdp(a.sdp,'answer');
 requireTrue(await verifyMac(i.secret,answerBody(a),a.mac),'MAC');
 return checkCode(i,a);
}
export async function gather(pc) {
 if(pc.iceGatheringState==='complete')return;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clean();reject(new Error('ICETimeout'));},LIMITS.iceMs);function clean(){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',change);}function change(){if(pc.iceGatheringState==='complete'){clean();resolve();}}pc.addEventListener('icegatheringstatechange',change);change();});
}
export function staticUrl(value) { const u=new URL(value);requireTrue(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&& !/ngrok|localhost|127\.0\.0\.1/i.test(u.hostname),'HTTPSStaticURL');return u; }
export function qr(canvas,text) { requireTrue(te.encode(text).length<=LIMITS.qr,'QRCapacity');const code=globalThis.qrcode(0,'M');code.addData(text,'Byte');code.make();const n=code.getModuleCount(),scale=Math.max(3,Math.floor(600/(n+8)));canvas.width=canvas.height=(n+8)*scale;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(code.isDark(y,x))ctx.fillRect((x+4)*scale,(y+4)*scale,scale,scale);return {bytes:te.encode(text).length,version:(n-17)/4,modules:n}; }
export function controlValid(m,binding,last) { return m && m.v===1 && m.meeting===binding.meeting && m.invitation===binding.invitation && m.generation===binding.generation && Number.isSafeInteger(m.seq) && m.seq>last && m.seq<=last+1000 && ['approved','floor','release','renew','mute','unmute','stop','ready','revoke','ping','pong'].includes(m.type); }
export async function candidateStats(pc) { const stats=await pc.getStats(); const transport=[...stats.values()].find(s=>s.type==='transport'&&s.selectedCandidatePairId);const pair=transport&&stats.get(transport.selectedCandidatePairId)||[...stats.values()].find(s=>s.type==='candidate-pair'&&s.nominated&&s.state==='succeeded');const local=pair&&stats.get(pair.localCandidateId),remote=pair&&stats.get(pair.remoteCandidateId);const audio=[...stats.values()].find(s=>s.type==='inbound-rtp'&&s.kind==='audio');return {connection:pc.connectionState,ice:pc.iceConnectionState,localType:local?.candidateType??null,remoteType:remote?.candidateType??null,protocol:local?.protocol??null,rttMs:pair?.currentRoundTripTime*1000||null,bytesReceived:pair?.bytesReceived||0,bytesSent:pair?.bytesSent||0,codec:audio&&stats.get(audio.codecId)?.mimeType||null,audioEnergy:audio?.totalAudioEnergy??null,decodedSamples:audio?.totalSamplesReceived??null,jitterMs:audio?.jitter*1000||null}; }
