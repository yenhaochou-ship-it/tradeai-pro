// api/sinopac.js — 放到 tradeai-pro/api/ 資料夾
//
// 這支是公開在網路上、任何人都打得到的proxy(不管你前端的React UI長什麼樣子，這個網址本身就是公開的)。
// 加兩層保護：
//   1) 瀏覽器 -> 這支function：檢查 x-app-password header 是否等於環境變數 APP_PASSWORD
//      (沒設定APP_PASSWORD的話跳過這層檢查，方便本機開發/還沒設定密碼的人照常能用)。
//   2) 這支function -> Railway後端：附帶 X-API-Key header(環境變數BACKEND_API_KEY)，
//      這個值完全是伺服器端的環境變數，永遠不會出現在瀏覽器/前端打包出來的程式碼裡。

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-password');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const appPassword = process.env.APP_PASSWORD;
  if (appPassword) {
    const provided = req.headers['x-app-password'] || '';
    if (provided !== appPassword) {
      return res.status(401).json({ error: '密碼錯誤', detail: '密碼錯誤或未提供（x-app-password）' });
    }
  }

  const backendUrl = process.env.SINOPAC_BACKEND_URL;
  if (!backendUrl) {
    return res.status(500).json({ error: '未設定 SINOPAC_BACKEND_URL 環境變數', detail: '未設定 SINOPAC_BACKEND_URL 環境變數' });
  }

  // 從 query string 取得路徑，例如 /api/sinopac?path=portfolio
  const path = req.query.path || '';

  try {
    const backendHeaders = { 'Content-Type': 'application/json' };
    if (process.env.BACKEND_API_KEY) {
      backendHeaders['X-API-Key'] = process.env.BACKEND_API_KEY;
    }
    const response = await fetch(`${backendUrl}/${path}`, {
      method: req.method,
      headers: backendHeaders,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: `後端連接失敗：${error.message}`, detail: `後端連接失敗：${error.message}` });
  }
}
