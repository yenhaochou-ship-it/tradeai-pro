// api/anthropic.js — 放到 tradeai-pro/api/ 資料夾
// 用途：問答分頁的 AI 聊天功能，安全地在後端呼叫 Claude API（金鑰不會暴露在瀏覽器）

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只接受 POST 請求', detail: '只接受 POST 請求' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: '未設定 ANTHROPIC_API_KEY 環境變數',
      detail: '未設定 ANTHROPIC_API_KEY 環境變數，請到 Vercel 專案設定 → Environment Variables 新增',
    });
  }

  try {
    const { model, max_tokens, messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '缺少 messages 參數', detail: '缺少 messages 參數' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: max_tokens || 600,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || `Claude API 錯誤 (${response.status})`;
      return res.status(response.status).json({ error: errMsg, detail: errMsg });
    }

    return res.status(200).json(data);
  } catch (error) {
    const msg = `呼叫 Claude API 失敗：${error.message}`;
    return res.status(500).json({ error: msg, detail: msg });
  }
}
