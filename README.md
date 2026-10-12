# MeetingTranslator Remote Mic RM0

這是隔離 PoC 的手機靜態頁，尚未完成 Android／iPhone 與真實字幕驗收。

由 Windows PoC 產生邀請 QR，手機掃描後產生回覆 QR；Windows 讀取回覆並核准後，手機需自行按「啟用麥克風」及發話按鈕。單獨開啟本網站沒有配對邀請，會安全停止。

手機與 Windows 必須在可互通的區域網路。WebRTC 使用 `iceServers=[]`，不使用外部信令、STUN、TURN 或音訊中繼。背景、失焦、停止或撤銷時停止發話。Windows 的 Google 辨識及原翻譯服務仍會出網。

網站只提供靜態資產；不保存或接收會議配對資料及音訊。邀請只存在 URL fragment，讀取後立即清除，不送入 HTTP 查詢。GitHub 仍可記錄一般靜態網站存取。

程式內沒有固定帳號、密碼、服務 Token 或 API Key。配對密鑰由每次邀請在執行時隨機產生，用於本機驗證；請勿公開任何實際邀請 QR 或回覆字串。

第三方 QR 元件為 qrcode-generator 1.4.4；其 MIT 授權與著作權聲明保留於 `vendor/qrcode-LICENSE`。所有執行資產隨站提供，沒有 CDN、分析 SDK 或服務端程式。

GitHub Pages 發布設定：`main` 分支、根目錄。`.nojekyll` 關閉 Jekyll。安全政策與 no-referrer 由 HTML meta 設定；本網站沒有自訂域名或額外伺服器。
