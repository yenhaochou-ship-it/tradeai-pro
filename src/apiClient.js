// apiClient.js — 集中管理「呼叫後端」要附帶的App密碼header。
// 全站只有這裡知道要送哪個header/存在哪裡，不用在每個fetch呼叫各自處理，
// 也不會漏掉某個角落忘了附帶密碼，導致那個功能莫名其妙401。
//
// 背景：原本/api/sinopac這個Vercel function完全公開、沒有任何驗證，任何人知道網址
// 就能直接呼叫(包含啟動真實下單)。現在api/sinopac.js那邊會檢查這個密碼(環境變數APP_PASSWORD)，
// 這支檔案負責讓前端「記住密碼、每次呼叫自動附帶、密碼錯的時候自動清掉讓畫面回到輸入畫面」。

const PW_KEY = "tradeai_app_pw";

export function getAppPassword() {
  try { return localStorage.getItem(PW_KEY) || ""; } catch { return ""; }
}

export function setAppPassword(pw) {
  try { localStorage.setItem(PW_KEY, pw); } catch {}
}

export function clearAppPassword() {
  try { localStorage.removeItem(PW_KEY); } catch {}
}

// 包一層fetch，自動附帶App密碼header，呼叫方式跟原生fetch完全一樣(url, options)，
// 換掉原本的fetch("/api/sinopac?path=...")不需要改其他邏輯。
export async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}), "x-app-password": getAppPassword() };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    // 密碼錯誤(或後端剛設定了新密碼但這台裝置還是舊的)：清掉本地存的密碼，
    // 讓畫面自然回到輸入密碼的狀態，不要讓使用者卡在「一直失敗但看不懂為什麼」。
    clearAppPassword();
  }
  return res;
}
