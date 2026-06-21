// api/sinopac.js — 放到 tradeai-pro/api/ 資料夾

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const backendUrl = process.env.SINOPAC_BACKEND_URL;
  if (!backendUrl) {
    return res.status(500).json({ error: '未設定 SINOPAC_BACKEND_URL 環境變數' });
  }

  // 從 query string 取得路徑，例如 /api/sinopac?path=portfolio
  const path = req.query.path || '';

  try {
    const response = await fetch(`${backendUrl}/${path}`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: `後端連接失敗：${error.message}` });
  }
}
