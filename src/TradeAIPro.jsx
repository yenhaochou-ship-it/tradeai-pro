import { useState, useEffect, useRef, useCallback } from "react";
import { ComposedChart, Area, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { RefreshCw, X, Activity, Zap, TrendingUp, TrendingDown, Search, Plus, RotateCcw, Link2, ShieldCheck, AlertTriangle, FileText, Flame, AlertCircle, Lightbulb, Clock } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS — Obsidian / Cyber Terminal
// bg-[#030b14]  card-[#070f1c]  border-[#0d2137]
// cyan: #22d3ee  violet: #a78bfa  green: #4ade80  red: #f87171
// ═══════════════════════════════════════════════════════════════

const STOCKS = {
  "NVDA":    { name:"輝達",   base:875.43, sector:"AI晶片" },
  "AAPL":    { name:"蘋果",   base:189.23, sector:"科技硬體" },
  "TSLA":    { name:"特斯拉", base:245.67, sector:"電動車" },
  "MSFT":    { name:"微軟",   base:415.23, sector:"雲端" },
  "META":    { name:"Meta",   base:512.34, sector:"社群媒體" },
  "GOOGL":   { name:"谷歌",   base:178.90, sector:"廣告科技" },
  "AMZN":    { name:"亞馬遜", base:198.45, sector:"電商雲端" },
  "AMD":     { name:"超微",   base:142.30, sector:"AI晶片" },   // 與NVDA同板塊
  "2330.TW": { name:"台積電", base:865.00, sector:"半導體" },
  "NFLX":    { name:"Netflix",base:634.20, sector:"串流媒體" },
};

// 台灣股票名稱對照（常用股票代號 → 中文名稱）
const TW_NAMES = {
  "0050":"元大台灣50","0056":"元大高股息","006208":"富邦台50","00878":"國泰永續高股息",
  "00881":"國泰台灣5G+","00891":"中信關鍵半導體","00919":"群益台灣精選高息","00929":"復華台灣科技優息",
  "00631L":"元大台灣50正2","00632R":"元大台灣50反1","00633L":"富邦上証正2","00634R":"富邦上証反1",
  "00637L":"國泰中國A50正2","00638R":"國泰中國A50反1","00650L":"福邦上証正2","00665L":"富邦印度正2",
  "00670L":"富邦NASDAQ正2","00675L":"富邦臺灣加權正2","00685L":"群益臺灣加權正2",
  "2330":"台積電","2317":"鴻海","2454":"聯發科","2412":"中華電","2308":"台達電",
  "2881":"富邦金","2882":"國泰金","2886":"兆豐金","2891":"中信金","2884":"玉山金",
  "2303":"聯電","3711":"日月光","2382":"廣達","3008":"大立光","2357":"華碩",
  "2379":"瑞昱","4938":"和碩","2345":"智邦","1301":"台塑","1303":"南亞","2002":"中鋼",
  "2330.TW":"台積電","0050.TW":"元大台灣50","0056.TW":"元大高股息",
};
// 取股票顯示名稱（優先 STOCKS 內建，其次 TW_NAMES，最後用代號本身）
let realNamesCache = {}; // 模組層級快取：避免每個呼叫getStockName的地方都要額外傳props，降低漏傳風險
function getStockName(sym){ return realNamesCache[sym] || STOCKS[sym]?.name || TW_NAMES[sym.replace(".TW","")] || TW_NAMES[sym] || sym; }
// 台股當沖真實交易成本（手續費0.1425%x2 + 當沖證交稅0.15%，2026現行費率，估6折券商優惠）
const FEE_RATE=0.001425, FEE_DISCOUNT=0.6, DAYTRADE_TAX=0.0015;
const MIN_PROFITABLE_MOVE_PCT=(FEE_RATE*FEE_DISCOUNT*2+DAYTRADE_TAX)*100; // 約0.32%，當沖至少要漲跌這麼多才打平成本
// 真實下單前的最低模擬驗證門檻（需與後端 main.py 的 PAPER_VALIDATION_MIN_* 保持一致，純粹是顯示用）
// 修正：這兩個常數現在只當「後端還沒回應前」的暫時預設值，真正生效的數字一律從
// backendAuto.status?.paper_validation_min_trades/min_days讀取(後端main.py才是唯一真相來源)，
// 避免之前那種「前後端各自寫一份常數、手動保持一致」的脆弱做法——只要有人改了一邊忘記改另一邊，
// 畫面顯示的門檻就會悄悄跟後端真正使用的門檻不一樣，沒有任何錯誤訊息會提示這個落差。
const PAPER_VALIDATION_MIN_TRADES=20, PAPER_VALIDATION_MIN_DAYS=5;
// 對應後端 advanced_score 的 Market Regime 分類，純顯示用的中文標籤
const REGIME_LABEL={trending_bull:"多頭趨勢",trending_bear:"空頭趨勢",range:"區間盤整",volatile:"高波動",panic:"恐慌",unknown:"資料不足"};
const FUNNEL_LABELS={
  bad_time:"不在交易時段(09:30前/13:00後)",
  no_trade_zone:"禁止交易區(假日/量過低/波動過低)",
  not_eligible:"當沖資格不符(處置股/不符資格)",
  limit_down_risk:"接近跌停風險",
  vwap_reject:"VWAP方向不符(價格在VWAP下方)",
  wide_spread:"買賣價差過寬(超過2個跳動單位)，進出場成本太高",
  extreme_recent_move:"近5分鐘漲跌幅過大(可能觸及集合競價鎖死風險)",
  no_model:"LightGBM模型未載入或預測失敗",
  low_confidence:"信心度未達風險等級門檻",
  sector_dup:"同板塊已有持倉",
  unaffordable:"資金不足，買不起1張",
  daily_cap_reached:"已達當日3筆交易上限",
  per_tick_cap_reached:"已達單次週期2檔新倉上限",
  order_failed:"委託被永豐拒絕或送出失敗(資金不足/股票被暫停交易等)",
};
const GRADE_STYLE={
  S:"bg-amber-500/15 text-amber-400 border-amber-500/25",
  A:"bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  B:"bg-blue-500/15 text-blue-400 border-blue-500/25",
  C:"bg-gray-500/15 text-gray-400 border-gray-500/25",
};

// 風險等級對應的完整class字串（不要用動態組字串，例如`text-${risk}-400`，Tailwind在build時是
// 用文字掃描source code找出實際出現過的class名稱才會產生對應CSS，動態拼出來的字串如果沒有完整字串
// 形式出現在程式碼裡，Tailwind根本不知道要生成那條CSS規則，畫面上就會悄悄少了那個樣式——
// 例如border-red-500/30、bg-amber-400這幾個之前就是這樣不見的，剛好沒人發現)。
const RISK_BADGE_CLS = {
  low:  "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  mid:  "bg-amber-500/10 border-amber-500/30 text-amber-400",
  high: "bg-red-500/10 border-red-500/30 text-red-400",
};
const RISK_DOT_CLS = { low:"bg-emerald-400", mid:"bg-amber-400", high:"bg-red-400" };

const RISK_CFG = {
  // maxHoldMin：單筆持倉最長持有分鐘數，超時且未虧損就先了結，避免AI把當沖抱成波段單
  // ↓↓↓ 已與後端 main.py 的 RISK_CFG 同步一致（minConf/alloc/sl/tp/maxPos/maxHoldMin），
  //      避免面板顯示的設定跟後端實際執行的交易參數不一樣，造成誤判。
  low:  { label:"低風險", c:"text-emerald-400", bg:"bg-emerald-500/10 border-emerald-500/25", minConf:72, alloc:0.05, sl:2.0, tp:4.0, maxPos:3, maxHoldMin:25, sigW:{rsi:0.35,macd:0.30,ma:0.25,vol:0.10} },
  mid:  { label:"中風險", c:"text-amber-400",   bg:"bg-amber-500/10 border-amber-500/25",   minConf:68, alloc:0.10, sl:3.0, tp:6.0, maxPos:5, maxHoldMin:40, sigW:{rsi:0.25,macd:0.35,ma:0.25,vol:0.15} },
  high: { label:"高風險", c:"text-red-400",     bg:"bg-red-500/10 border-red-500/25",       minConf:65, alloc:0.20, sl:5.0, tp:10.0,maxPos:8, maxHoldMin:60, sigW:{rsi:0.20,macd:0.25,ma:0.30,vol:0.25} },
};

const TABS = [
  {id:"overview", sym:"⬡", label:"總覽"},
  {id:"auto",     sym:"◑", label:"自動交易"},
  {id:"market",   sym:"◎", label:"市場"},
  {id:"records",  sym:"▤", label:"紀錄"},
  {id:"strategy", sym:"◈", label:"策略"},
  {id:"system",   sym:"◐", label:"系統"},
];

// ── Data helpers ───────────────────────────────────────────────
function calcRSI(p, period=14) {
  const r = new Array(p.length).fill(null);
  if (p.length < period+1) return r;
  let g=0,l=0;
  for (let i=1;i<=period;i++){const d=p[i]-p[i-1];if(d>0)g+=d;else l-=d;}
  let ag=g/period, al=l/period;
  r[period] = al===0?100:+(100-100/(1+ag/al)).toFixed(2);
  for (let i=period+1;i<p.length;i++){
    const d=p[i]-p[i-1];
    ag=(ag*(period-1)+Math.max(0,d))/period; al=(al*(period-1)+Math.max(0,-d))/period;
    r[i]=al===0?100:+(100-100/(1+ag/al)).toFixed(2);
  }
  return r;
}

function ema(prices,p){
  const k=2/(p+1),e=[prices[0]];
  for(let i=1;i<prices.length;i++) e.push(+(prices[i]*k+e[i-1]*(1-k)).toFixed(4));
  return e;
}

function genHistory(base, n=90) {
  const d=[]; let price=base; const now=Date.now();
  for(let i=n;i>=0;i--){
    price=Math.max(price+(Math.random()-0.478)*base*0.014, base*0.6);
    const close=+(price+(Math.random()-0.49)*base*0.007).toFixed(2);
    const vol=Math.floor(Math.random()*12e6+2e6);
    const t=new Date(now-i*5*60000);
    d.push({
      time:`${t.getHours().toString().padStart(2,"0")}:${t.getMinutes().toString().padStart(2,"0")}`,
      price:+price.toFixed(2), close, volume:vol
    });
  }
  const prices=d.map(x=>x.price);
  const rsiArr=calcRSI(prices);
  const e12=ema(prices,12), e26=ema(prices,26);
  const macdLine=prices.map((_,i)=>i>=25?+(e12[i]-e26[i]).toFixed(4):null);
  let sig=null;
  const sigArr=macdLine.map(v=>{
    if(v===null)return null;
    sig=sig===null?v:+(v*(2/10)+sig*(1-2/10)).toFixed(4); return sig;
  });
  return d.map((x,i)=>({
    ...x,
    ma5: i>=4?+(prices.slice(i-4,i+1).reduce((s,v)=>s+v,0)/5).toFixed(2):null,
    ma20:i>=19?+(prices.slice(i-19,i+1).reduce((s,v)=>s+v,0)/20).toFixed(2):null,
    rsi:rsiArr[i], macd:macdLine[i], signal:sigArr[i],
    hist:(macdLine[i]!=null&&sigArr[i]!=null)?+(macdLine[i]-sigArr[i]).toFixed(4):null,
  }));
}

function genSpark(base,n=24){
  let p=base;
  return Array.from({length:n},()=>{p=+(p+(Math.random()-0.47)*p*0.012).toFixed(2);return{v:p};});
}

// ── 專業信號引擎 v3 — ATR動態停損 + Williams%R + CCI + 支撐壓力 + 趨勢過濾 ──────
function calcATR(prices, period=14){
  const tr=prices.slice(1).map((p,i)=>Math.abs(p-prices[i]));
  if(tr.length<period) return Math.abs(prices[prices.length-1]-prices[0])||1;
  return tr.slice(-period).reduce((s,v)=>s+v,0)/period;
}
function calcWilliamsR(prices, period=14){
  const slice=prices.slice(-period);
  const high=Math.max(...slice), low=Math.min(...slice), close=prices[prices.length-1];
  return high===low?-50:+((-(high-close)/(high-low)*100)).toFixed(1);
}
function calcCCI(prices, period=20){
  const slice=prices.slice(-period);
  const mean=slice.reduce((s,v)=>s+v,0)/period;
  const meanDev=slice.reduce((s,v)=>s+Math.abs(v-mean),0)/period||1;
  return +((prices[prices.length-1]-mean)/(0.015*meanDev)).toFixed(1);
}
function findSupportResistance(prices){
  // 找近30根K棒的支撐(近期低點)與壓力(近期高點)
  const slice=prices.slice(-30);
  let support=slice[0], resist=slice[0];
  for(let i=2;i<slice.length-2;i++){
    if(slice[i]<slice[i-1]&&slice[i]<slice[i+1]&&slice[i]<slice[i-2]&&slice[i]<slice[i+2]) support=Math.max(support,slice[i]);
    if(slice[i]>slice[i-1]&&slice[i]>slice[i+1]&&slice[i]>slice[i-2]&&slice[i]>slice[i+2]) resist=Math.min(resist===slice[0]?Infinity:resist,slice[i]);
  }
  return {support,resist:resist===Infinity?Math.max(...slice):resist};
}
function calcSignal(sym, chartData, liveP, weights={rsi:0.20,macd:0.25,ma:0.20,vol:0.15,vwap:0.12,bb:0.08}, bonus=0) {
  const cd=chartData[sym]||[], lp=liveP[sym];
  if(!lp||cd.length<30) return {action:"hold",conf:50,rsi:50,vwap:0,bbPct:0.5,stochRsi:50,trendStr:0,details:{}};
  const prices=cd.map(d=>d.price);

  // ① RSI
  const rsiArr=calcRSI(prices);
  const rsi=rsiArr[rsiArr.length-1]||50;

  // ② Stochastic RSI (RSI的動量)
  const rsiWindow=rsiArr.slice(-14).filter(v=>v!=null);
  const rsiMin=rsiWindow.length?Math.min(...rsiWindow):0;
  const rsiMax=rsiWindow.length?Math.max(...rsiWindow):100;
  const stochRsi=rsiMax>rsiMin?+(((rsi-rsiMin)/(rsiMax-rsiMin))*100).toFixed(1):50;

  // ③ MA 5/20
  const ma5=+(prices.slice(-5).reduce((s,x)=>s+x,0)/5).toFixed(2);
  const ma20=+(prices.slice(-20).reduce((s,x)=>s+x,0)/20).toFixed(2);

  // ④ VWAP (20根均量加權均價) — 日內交易最重要指標
  const vwapSlice=cd.slice(-20);
  const totalVol=vwapSlice.reduce((s,d)=>s+(d.volume||1e6),0)||1;
  const vwap=+(vwapSlice.reduce((s,d)=>s+d.price*(d.volume||1e6),0)/totalVol).toFixed(2);

  // ⑤ Bollinger Bands (20,2)
  const mean20=ma20;
  const variance=prices.slice(-20).reduce((s,x)=>s+Math.pow(x-mean20,2),0)/20;
  const std=Math.sqrt(variance);
  const bbUpper=+(mean20+2*std).toFixed(2);
  const bbLower=+(mean20-2*std).toFixed(2);
  const bbRange=bbUpper-bbLower||1;
  const bbPct=+((lp.price-bbLower)/bbRange).toFixed(3); // 0=下軌 1=上軌

  // ⑥ 趨勢強度 (ADX 近似)
  const recent14=prices.slice(-14);
  const maxP=Math.max(...recent14), minP=Math.min(...recent14);
  const avgMove=recent14.slice(1).reduce((s,p,i)=>s+Math.abs(p-recent14[i]),0)/13||1;
  const trendStr=+Math.min(1,(maxP-minP)/(avgMove*14)).toFixed(2);

  // ⑦ 成交量比
  const recentVol=cd.slice(-3).reduce((s,d)=>s+(d.volume||1e6),0)/3;
  const avgVol=cd.slice(-20).reduce((s,d)=>s+(d.volume||1e6),0)/20||1;
  const volRatio=+(recentVol/avgVol).toFixed(2);

  // ⑧ MACD
  const lb=cd[cd.length-1]||{}, pb=cd[cd.length-2]||{};
  const freshGolden=lb.macd!=null&&lb.signal!=null&&lb.macd>lb.signal&&(pb.macd||0)<=(pb.signal||0);
  const freshDeath=lb.macd!=null&&lb.signal!=null&&lb.macd<lb.signal&&(pb.macd||0)>=(pb.signal||0);

  // ⑨ 時段品質 (開盤前15分 & 午休 信號較差)
  const now=new Date(); const tm=now.getHours()*60+now.getMinutes();
  // 與後端時段一致：09:00-09:30開盤亂流（不進場）、12:00-13:00午盤(降權)、13:00後不開新倉
  const badTime=(tm<9*60+30)||(tm>=13*60);  // 開盤30分鐘 + 13:00後完全不進場
  const lowQuality=(tm>=12*60&&tm<13*60);    // 午盤時段降權但不完全禁止

  // ⑩ ATR 動態波動率（用於後續動態停損）
  const atr=calcATR(prices);
  const atrPct=+(atr/lp.price*100).toFixed(2); // ATR佔股價%

  // ⑪ Williams %R (−80以下超賣買進，−20以上超買賣出)
  const williamsR=calcWilliamsR(prices);

  // ⑫ CCI 商品通道指數 (+100以上超買，−100以下超賣)
  const cci=calcCCI(prices);

  // ⑬ 支撐壓力位（價格接近支撐買，接近壓力賣）
  const {support,resist}=findSupportResistance(prices);
  const nearSupport=lp.price<support*1.015 && lp.price>support*0.985;
  const nearResist=lp.price>resist*0.985 && lp.price<resist*1.015;

  // ⑭ 趨勢方向過濾（只在趨勢方向下單，大幅減少逆勢虧損）
  const ma50=prices.length>=50?+(prices.slice(-50).reduce((s,x)=>s+x,0)/50).toFixed(2):ma20;
  const upTrend=ma5>ma20&&ma20>ma50;
  const downTrend=ma5<ma20&&ma20<ma50;

  // ══ 多因子評分 ══════════════════════════════════════
  let bull=0, bear=0;

  // RSI (20%)
  if(rsi<25){bull+=20;}else if(rsi<33){bull+=13;}else if(rsi<42){bull+=6;}
  else if(rsi>75){bear+=20;}else if(rsi>67){bear+=13;}else if(rsi>58){bear+=6;}

  // StochRSI (8%) — 判斷RSI自身動量
  if(stochRsi<15){bull+=8;}else if(stochRsi<30){bull+=4;}
  else if(stochRsi>85){bear+=8;}else if(stochRsi>70){bear+=4;}

  // MACD (25%)
  if(freshGolden){bull+=25;}else if(freshDeath){bear+=25;}
  else if(lb.macd!=null&&lb.signal!=null){
    lb.macd>lb.signal?bull+=11:bear+=11;
  }

  // MA排列 (20%)
  if(ma5>ma20){bull+=20;}else{bear+=20;}

  // VWAP (12%) — 價格在VWAP上方偏多
  if(lp.price>vwap*1.002){bull+=12;}else if(lp.price<vwap*0.998){bear+=12;}
  else{bull+=5;bear+=5;} // 在VWAP附近，中性

  // Bollinger Band位置 (8%) — 靠近下軌反彈，靠近上軌回落
  if(bbPct<0.12){bull+=8;}else if(bbPct<0.25){bull+=4;}
  else if(bbPct>0.88){bear+=8;}else if(bbPct>0.75){bear+=4;}

  // 成交量確認 (放量代表方向信號更可靠)
  if(volRatio>1.8&&bull>bear){bull+=8;}
  else if(volRatio>1.8&&bear>bull){bear+=8;}
  else if(volRatio<0.6){bull*=0.85;bear*=0.85;} // 縮量不確定

  // 趨勢強度加乘 (強趨勢時跟方向)
  if(trendStr>0.65){
    if(ma5>ma20){bull+=7;}else{bear+=7;}
  }

  // Williams %R (新增 6%)
  if(williamsR<-80){bull+=6;}else if(williamsR<-60){bull+=3;}
  else if(williamsR>-20){bear+=6;}else if(williamsR>-40){bear+=3;}

  // CCI (新增 5%)
  if(cci<-100){bull+=5;}else if(cci<-50){bull+=2;}
  else if(cci>100){bear+=5;}else if(cci>50){bear+=2;}

  // 支撐壓力位確認 (新增 6%)
  if(nearSupport){bull+=6;}
  if(nearResist){bear+=6;}

  // 趨勢方向過濾（最重要的加乘：逆勢信號打折，順勢信號加成）
  if(upTrend&&bull>bear){bull*=1.15;}   // 上升趨勢中做多，加成15%
  else if(downTrend&&bear>bull){bear*=1.15;} // 下降趨勢中做空，加成15%
  else if(upTrend&&bear>bull){bear*=0.7;}    // 上升趨勢中逆勢做空，大幅打折
  else if(downTrend&&bull>bear){bull*=0.7;}  // 下降趨勢中逆勢做多，大幅打折

  // 時段品質衰減
  if(badTime){bull*=0.72;bear*=0.72;}
  if(lowQuality){bull*=0.85;bear*=0.85;}  // 午盤流動性較低，小幅降權

  // ══ 決策 ══════════════════════════════════════════
  const total=bull+bear||1;
  const bullPct=bull/total*100;
  // 嚴格門檻：需要67%以上才進場（大幅減少假信號）
  const action=bullPct>=67?"buy":bullPct<=33?"sell":"hold";
  const rawConf=action==="buy"?bullPct:action==="sell"?100-bullPct:50;
  const conf=Math.min(95,+(rawConf+bonus).toFixed(1));

  return {
    action, conf, rsi:+rsi.toFixed(1), stochRsi, ma5, ma20,
    vwap, bbPct, bbUpper, bbLower, volRatio, trendStr,
    freshGolden, freshDeath, badTime,
    williamsR, cci:+cci.toFixed(0), atrPct, nearSupport, nearResist,
    upTrend, downTrend, support:+support.toFixed(2), resist:+resist.toFixed(2),
    bull:+bull.toFixed(1), bear:+bear.toFixed(1),
    details:{rsi,stochRsi,vwap,bbPct,trendStr,volRatio,freshGolden,freshDeath}
  };
}

const N=(n,fb=0)=>(typeof n==="number"&&isFinite(n))?n:fb;
const F=(n,d=2)=>N(n).toFixed(d);
const CC=n=>N(n)>=0?"text-emerald-400":"text-red-400";

// ═══════════════════════════════════════════════════════════════
// 穩定的頂層元件（不會隨父層重新渲染而被重建，避免輸入框失焦/狀態重置）
// ═══════════════════════════════════════════════════════════════
function Card({children,onClick,cls=""}) {
  return (
    <div onClick={onClick} className={`bg-[#070f1c] border border-[#0d2137] rounded-xl ${onClick?"cursor-pointer hover:border-cyan-500/30 active:scale-[0.99]":""} transition-all ${cls}`}>
      {children}
    </div>
  );
}
function Row({l,v,c="text-white"}) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[#0d2137] last:border-0 text-xs">
      <span className="text-gray-500">{l}</span><span className={`font-mono font-bold ${c}`}>{v}</span>
    </div>
  );
}
function Chip({children,c="border-cyan-500/30 text-cyan-400 bg-cyan-500/10"}) {
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${c}`}>{children}</span>;
}

// ── ◎ 市場頁（含搜尋輸入框）— 提升至頂層保持元件身分穩定 ──────
function MarketTab({live,sigs,sparks,search,setSearch,wl,setWl,setModal,broker,onRealPrice,realBases,wlSyncError,realSyms}) {
  const [realQuote,setRealQuote]=useState(null); // {sym, price, loading, error}
  // ── 手機向左滑刪除自選股 ──────────────────────────────────────
  const [swipeX,setSwipeX]=useState({});      // {sym: 目前位移px}
  const swipeStartRef=useRef({});             // {sym: 觸控起始X}
  const onSwipeStart=(sym,e)=>{ swipeStartRef.current[sym]=e.touches[0].clientX; };
  const onSwipeMove=(sym,e)=>{
    const startX=swipeStartRef.current[sym]; if(startX==null) return;
    const dx=e.touches[0].clientX-startX;
    if(dx<0) setSwipeX(s=>({...s,[sym]:Math.max(dx,-88)})); // 只能往左滑，最多滑88px
  };
  const onSwipeEnd=(sym)=>{
    const x=swipeX[sym]||0;
    setSwipeX(s=>({...s,[sym]:x<-44?-88:0})); // 滑超過一半就吸附展開，否則彈回
    swipeStartRef.current[sym]=null;
  };
  const deleteSym=(sym)=>{ setWl(w=>w.filter(s=>s!==sym)); setSwipeX(s=>{const n={...s};delete n[sym];return n;}); };
  const lookupRealPrice=async(sym)=>{
    if(!sym||broker?.status!=="connected") return;
    setRealQuote({sym,price:null,loading:true,error:null});
    try{
      const r=await fetch(`/api/sinopac?path=price/${sym}`);
      const d=await r.json();
      if(r.ok){
        setRealQuote({sym,price:d.price||d.close||d.last||null,loading:false,error:null});
        if(d.name) realNamesCache={...realNamesCache,[sym]:d.name}; // 立即可用，完整持久化交由15秒輪詢週期處理
      }
      else setRealQuote({sym,price:null,loading:false,error:d.detail||"查無資料"});
    }catch(e){setRealQuote({sym,price:null,loading:false,error:"查詢失敗"});}
  };
  return(
    <div className="space-y-3">
      {/* Search add */}
      <div className="flex gap-2">
        <input value={search} onChange={e=>{setSearch(e.target.value.toUpperCase());setRealQuote(null);}} placeholder="輸入股票代號（如 0050、AAPL）"
          onKeyDown={e=>{
            if(e.key!=="Enter"||!search.trim()) return;
            if(!wl.includes(search)){setWl(w=>[...w,search]);}
            setSearch("");setRealQuote(null);
          }}
          className="flex-1 bg-[#070f1c] border border-[#0d2137] rounded-xl px-3 py-2 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-cyan-500/40"/>
        <button onClick={()=>{
          if(!search.trim()) return;
          if(!wl.includes(search)){setWl(w=>[...w,search]);}
          setSearch("");setRealQuote(null);
        }} className="w-9 h-9 bg-cyan-500/10 border border-cyan-500/25 rounded-xl flex items-center justify-center">
          <Plus className="w-3.5 h-3.5 text-cyan-400"/>
        </button>
        {broker?.status==="connected"&&search.trim()&&(
          <button onClick={()=>lookupRealPrice(search.trim())}
            className="w-9 h-9 bg-violet-500/10 border border-violet-500/25 rounded-xl flex items-center justify-center" title="查詢真實報價">
            <Search className="w-3.5 h-3.5 text-violet-400"/>
          </button>
        )}
      </div>
      {/* 真實報價查詢結果 */}
      {realQuote&&(
        <Card cls="p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono font-bold text-white">{realQuote.sym}</span>
              {realQuote.loading&&<span className="text-[9px] text-gray-500 ml-2">查詢中...</span>}
              {realQuote.error&&<span className="text-[9px] text-red-400 ml-2">{realQuote.error}</span>}
              {realQuote.price!=null&&<span className="text-sm font-mono font-bold text-cyan-400 ml-3">NT${realQuote.price}</span>}
            </div>
            {realQuote.price!=null&&!wl.includes(realQuote.sym)&&(
              <button onClick={()=>{
                onRealPrice?.(realQuote.sym,realQuote.price);
                setWl(w=>[...w,realQuote.sym]);
                setRealQuote(null);
              }} className="text-[9px] px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 rounded-lg font-bold">+ 新增</button>
            )}
            {wl.includes(realQuote.sym)&&<span className="text-[9px] text-gray-600">已在自選股</span>}
          </div>
        </Card>
      )}

      {/* Watchlist */}
      {wlSyncError&&broker.status==="connected"&&(
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-2.5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0"/>
          <div className="flex-1 text-[10px] text-red-400">自選股清單同步到後端失敗，AI現在看到的可能還是舊清單，請檢查網路後重新整理頁面</div>
        </div>
      )}
      <Card cls="overflow-hidden">
        {wl.map((sym,i)=>{
          const info=STOCKS[sym]||{name:getStockName(sym),base:realBases[sym]||0};
          const l=live[sym]||{}, sp=sparks[sym]||[], s=sigs[sym]||{action:"hold",conf:50};
          const offset=swipeX[sym]||0;
          return(
            <div key={sym} className={`relative overflow-hidden ${i<wl.length-1?"border-b border-[#0d2137]":""}`}>
              {/* 滑開後顯示的刪除按鈕（在底層） */}
              <button onClick={()=>deleteSym(sym)}
                className="absolute right-0 top-0 h-full w-[88px] bg-red-500/90 text-white text-xs font-bold flex items-center justify-center">
                刪除
              </button>
              {/* 可滑動的內容（在上層，用 transform 位移） */}
              <div
                className="flex items-center px-3 py-2.5 cursor-pointer hover:bg-[#0a1422] bg-[#070f1c] transition-transform"
                style={{transform:`translateX(${offset}px)`,touchAction:"pan-y"}}
                onTouchStart={e=>onSwipeStart(sym,e)}
                onTouchMove={e=>onSwipeMove(sym,e)}
                onTouchEnd={()=>onSwipeEnd(sym)}
                onClick={()=>{ if(offset!==0){setSwipeX(s=>({...s,[sym]:0}));return;} setModal({type:"stockModal",data:{sym,lp:l,sig:s}});}}
                onContextMenu={e=>{e.preventDefault();setWl(w=>w.filter(s=>s!==sym));}}>
                <div className="w-7 h-7 rounded-lg bg-[#0d2137] flex items-center justify-center text-[9px] font-bold text-cyan-400 mr-3 flex-shrink-0">
                  {sym.replace(".TW","").slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                    {sym}
                    {realSyms?.has(sym)&&<span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">真實</span>}
                    {broker?.status==="connected"&&!realSyms?.has(sym)&&<span className="text-[7px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">模擬</span>}
                  </div>
                  <div className="text-[9px] text-gray-600">{info.name}{info.sector?` · ${info.sector}`:""}</div>
                </div>
                <div className="w-12 h-6 mx-2 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sp} margin={{top:1,right:0,bottom:1,left:0}}>
                      <Line type="monotone" dataKey="v" stroke={N(l.pct)>=0?"#4ade80":"#f87171"} strokeWidth={1.5} dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-right mr-2 flex-shrink-0">
                  <div className="text-xs font-mono font-bold text-white">{N(l.price,info.base).toFixed(2)}</div>
                  <div className={`text-[9px] ${CC(l.pct)}`}>{N(l.pct)>=0?"▲":"▼"}{Math.abs(N(l.pct)).toFixed(2)}%</div>
                </div>
                <div className={`text-[9px] w-7 text-center font-bold flex-shrink-0 ${s.action==="buy"?"text-emerald-400":s.action==="sell"?"text-red-400":"text-gray-700"}`}>
                  {s.action==="buy"?"▲":s.action==="sell"?"▼":"─"}
                </div>
              </div>
            </div>
          );
        })}
        <div className="px-3 py-1.5 text-[9px] text-gray-700 text-center">左滑刪除（手機）· 右鍵移除（電腦）· 點擊查看詳情</div>
      </Card>
    </div>
  );
}

// ── ◉ 問答頁（含聊天輸入框）— 提升至頂層保持元件身分穩定 ──────
// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
export default function TradeAIPro() {
  const [tab,      setTab]      = useState("overview");
  const [modal,    setModal]    = useState(null);
  const [wl, setWl] = useState(()=>{
    try{ const s=JSON.parse(localStorage.getItem("wl")||"null"); if(Array.isArray(s)&&s.length) return s; }catch{}
    return ["2849","2836","2834","0050","2882"]; // 預設改為資金規模買得起的台股低價股（搭配高風險設定才買得動，詳見auto面板提示）
  });
  const [charts,   setCharts]   = useState({});
  const [sparks,   setSparks]   = useState({});
  const [live,     setLive]     = useState({});
  const [sigs,     setSigs]     = useState({});
  const [search,   setSearch]   = useState("");
  const [risk,     setRisk]     = useState("low");
  const [instFlows, setInstFlows] = useState({date:null,topBuy:[],topSell:[],loading:false}); // 三大法人真實買賣超（來源：台灣證交所公開資料）
  const [scanResults, setScanResults] = useState({results:[],updated:null,scanning:false,loading:false}); // 全市場飆股雷達掃描結果（後端真實技術指標排序）
  const [broker,   setBroker]   = useState({status:"disconnected",apiKey:"",secretKey:"",account:null,balance:null,error:null}); // 永豐真實帳戶連接
  const [wlSyncError, setWlSyncError] = useState(false); // 自選股同步到後端失敗時設true，不要讓使用者以為改了清單AI就看得到
  const [nowTick, setNowTick] = useState(Date.now()); // 純粹給「資料更新於X秒前」這類倒數計時用的活時鐘——
  // 不能只靠backendAuto變化觸發重渲染，因為萬一輪詢真的開始失敗，backendAuto根本不會再變，
  // 畫面上的秒數就會凍結在最後一次成功的瞬間，使用者反而看不出「現在已經多久沒更新了」。
  useEffect(()=>{ const iv=setInterval(()=>setNowTick(Date.now()),5000); return()=>clearInterval(iv); },[]);
  const [autoCapPct, setAutoCapPct] = useState(()=>{ try{ return Number(localStorage.getItem("autoCapPct")||100); }catch{ return 100; } }); // AI自動交易可用資金%
  const [paperCapInput, setPaperCapInput] = useState("10000000"); // 模擬資金輸入框，預設1000萬
  const [feeDiscountInput, setFeeDiscountInput] = useState("6"); // 手續費折扣輸入框，單位「折」(6=6折)，預設值之後會被後端真實設定值蓋過
  const [backendAuto, setBackendAuto] = useState({enabled:false,status:null,log:[],loading:false}); // 後端24h自動交易 // 風控護盾
  const [tradeChartCache, setTradeChartCache] = useState({}); // {symbol: {bars, loading, error}} — 點交易紀錄查看當時K線用，跟自選股charts分開避免被wl清理邏輯誤刪
  const [backendPaperMode, setBackendPaperMode] = useState(()=>{
    try{ const s=localStorage.getItem("backend_paper_mode"); return s===null?true:s==="true"; }catch{ return true; }
  }); // 後端24h自動交易模式：true=模擬下單(用真實股價算損益,不花真錢)，false=真實下單
  useEffect(()=>{ try{ localStorage.setItem("backend_paper_mode",String(backendPaperMode)); }catch{} },[backendPaperMode]);
  const [realPos,   setRealPos]   = useState([]); // 永豐真實持倉（連線後從後端取得）
  const [realBases, setRealBases] = useState({}); // {sym: price} 使用者新增股票的真實起始報價
  const [realNames, setRealNames] = useState(()=>{ try{ return JSON.parse(localStorage.getItem("real_names")||"{}"); }catch{ return {}; } }); // {sym: 真實中文名稱}，來自永豐合約資料，補足內建清單沒有的股票
  useEffect(()=>{ try{ localStorage.setItem("real_names",JSON.stringify(realNames)); }catch{}; realNamesCache=realNames; },[realNames]);
  const liveR = useRef({}), chartR = useRef({});
  const wlR = useRef([]); // 自選股清單的即時參照，讓信號計算迴圈能拿到最新清單（不再侷限於內建模擬股票）
  const autoCapPctR = useRef(100); // ref 讓後端啟動函式能即時讀到最新的資金百分比設定
  const brokerR    = useRef({status:"disconnected"}); // ref 讓各非同步流程能即時讀到 broker 連線狀態
  const realSymR   = useRef(new Set()); // 已確認為「真實報價來源」的股票代號集合，這些不再用亂數模擬跳動
  const [realSyms, setRealSyms] = useState(new Set()); // 跟realSymR同步的可reactive版本，給畫面上的「真實」標籤用(ref本身不會觸發重新渲染)
  const markReal = useCallback((sym)=>{
    if(realSymR.current.has(sym)) return;
    realSymR.current.add(sym);
    setRealSyms(prev=>new Set(prev).add(sym));
  },[]);
  // 修正：報價(現價)跟歷史K棒(圖表)是兩個獨立的API呼叫，會各自獨立成功或失敗——
  // 原本只有一個markReal，只要報價抓到就標記「真實」，但圖表那邊如果剛好失敗，會退回genHistory()
  // 產生的假K棒(用真實現價當起點，但時間軸是用現在時鐘往回推，跟實際交易時段無關)，
  // 畫面上卻還是顯示「真實報價」，讓人以為整張圖都是真的。改成圖表的真實性獨立追蹤。
  const [realChartSyms, setRealChartSyms] = useState(new Set());
  const markRealChart = useCallback((sym)=>{
    setRealChartSyms(prev=>prev.has(sym)?prev:new Set(prev).add(sym));
  },[]);
  useEffect(()=>{liveR.current=live;},[live]);
  useEffect(()=>{autoCapPctR.current=autoCapPct;},[autoCapPct]);
  useEffect(()=>{brokerR.current=broker;},[broker]);
  useEffect(()=>{chartR.current=charts;},[charts]);
  useEffect(()=>{wlR.current=wl;},[wl]);
  useEffect(()=>{ try{ localStorage.setItem("wl",JSON.stringify(wl)); }catch{} },[wl]);
  useEffect(()=>{ try{ localStorage.setItem("autoCapPct",String(autoCapPct)); }catch{} },[autoCapPct]);
  // 後端自動交易狀態輪詢（連線後每30秒同步）
  useEffect(()=>{
    if(broker.status!=="connected") return;
    const poll=async()=>{
      try{
        const r=await fetch("/api/sinopac?path=auto/status");
        const d=await r.json();
        // 記錄「最後一次成功拿到資料」的時間——如果後端整個process掛了(不只是排程卡住)，
        // 這個輪詢本身會開始失敗/timeout，下面的持倉清單要能誠實顯示「這是幾秒前的舊資料」，
        // 不能讓使用者誤以為畫面上看到的就是當下這一刻的真實持倉。
        if(r.ok) setBackendAuto(b=>({...b,enabled:d.enabled,status:d,log:d.log||[],lastFetchedAt:Date.now()}));
      }catch{}
    };
    poll();
    const iv=setInterval(poll,30000);
    return()=>clearInterval(iv);
  },[broker.status]);
  // 自選股同步到後端（連線中且自選股有變動時）
  useEffect(()=>{
    if(broker.status!=="connected") return;
    fetch("/api/sinopac?path=auto/watchlist",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(wl)})
      .then(r=>setWlSyncError(!r.ok))
      .catch(()=>setWlSyncError(true));
  },[wl,broker.status]);
  // 載入記住的帳密（頁面首次載入時還原，但不自動連接）
  useEffect(()=>{
    try{
      const s=JSON.parse(localStorage.getItem("sinopac_creds")||"{}");
      if(s.apiKey||s.secretKey) setBroker(b=>({...b,apiKey:s.apiKey||"",secretKey:s.secretKey||""}));
    }catch{}
  },[]);

  // ── Init ─────────────────────────────────────────────────────
  useEffect(()=>{
    const ch={},lv={},sp={};
    Object.entries(STOCKS).forEach(([sym,info])=>{
      ch[sym]=genHistory(info.base);
      sp[sym]=genSpark(info.base);
      const c=(Math.random()-0.45)*info.base*0.022;
      lv[sym]={price:+info.base.toFixed(2),chg:+c.toFixed(2),pct:+(c/info.base*100).toFixed(2)};
    });
    setCharts(ch); setSparks(sp); setLive(lv);
  },[]);

  // ── Live tick every 4s（原本2秒，但真實報價15秒才更新一次，等於85%的訊號重算都在算同樣的舊資料，
  //    調寬一點降低無謂運算，對「多久能反映真實資料變化」幾乎沒有影響）──────
  useEffect(()=>{
    const iv=setInterval(()=>{
      setLive(prev=>{
        const next={};
        Object.entries(prev).forEach(([sym,d])=>{
          // 已確認為真實報價來源的股票，不做亂數模擬跳動，價格只由真實輪詢更新
          if(realSymR.current.has(sym)){ next[sym]=d; return; }
          const base=STOCKS[sym]?.base??d.price;
          const t=(Math.random()-0.499)*base*0.0015;
          const price=+(d.price+t).toFixed(2);
          next[sym]={price,chg:+(price-base).toFixed(2),pct:+((price-base)/base*100).toFixed(2)};
        });
        return next;
      });
      // Recalc signals
      const ns={};
      const lr=liveR.current;
      const cr=chartR.current;
      // 優化：只計算使用者實際自選股清單，不再連帶計算未顯示的內建模擬股票，減少無謂運算
      wlR.current.forEach(sym=>{ns[sym]=calcSignal(sym,cr,lr);});
      setSigs(ns);
    },4000);
    return()=>clearInterval(iv);
  },[]);

  // ── 三大法人買賣超（連線後抓一次，真實資料每天約15:30後由證交所公布，不需要高頻輪詢）──
  const fetchInstFlows = useCallback(async()=>{
    setInstFlows(s=>({...s,loading:true}));
    try{
      const r=await fetch("/api/sinopac?path=institutional/flows?top=8");
      const d=await r.json();
      if(r.ok) setInstFlows({date:d.date,topBuy:d.top_buy||[],topSell:d.top_sell||[],loading:false});
      else setInstFlows(s=>({...s,loading:false}));
    }catch{ setInstFlows(s=>({...s,loading:false})); }
  },[]);
  useEffect(()=>{ if(broker.status==="connected") fetchInstFlows(); },[broker.status,fetchInstFlows]);

  // ── AI飆股雷達：抓後端全市場掃描結果（真實技術指標排序，非自選股限定）──
  const fetchScanResults = useCallback(async()=>{
    setScanResults(s=>({...s,loading:true}));
    try{
      const r=await fetch("/api/sinopac?path=scan/topstocks?top=5");
      const d=await r.json();
      if(r.ok) setScanResults({results:d.results||[],updated:d.updated,scanning:d.scanning,loading:false});
      else setScanResults(s=>({...s,loading:false}));
    }catch{ setScanResults(s=>({...s,loading:false})); }
  },[]);
  useEffect(()=>{
    if(broker.status!=="connected") return;
    fetchScanResults();
    const iv=setInterval(fetchScanResults,90000); // 每90秒抓一次最新掃描結果（後端排程每5分鐘才重新掃描一次，不用更頻繁）
    return()=>clearInterval(iv);
  },[broker.status,fetchScanResults]);

  // ── 真實歷史K棒定期刷新（避免抓一次後RSI/MACD用越來越舊的歷史資料）──
  useEffect(()=>{
    if(broker.status!=="connected") return;
    let cancelled=false;
    const refresh=async()=>{
      const realSymsToRefresh=wl.filter(sym=>realSymR.current.has(sym)&&!STOCKS[sym]);
      if(realSymsToRefresh.length===0) return;
      const results=await Promise.allSettled(realSymsToRefresh.map(async sym=>{
        const r=await fetch(`/api/sinopac?path=history/${encodeURIComponent(sym)}?bars=90`);
        const d=await r.json();
        if(!r.ok||!d.bars||d.bars.length<20) throw new Error("no data");
        return{sym,bars:d.bars};
      }));
      if(cancelled) return;
      const updates={};
      results.forEach(r=>{ if(r.status==="fulfilled"){ updates[r.value.sym]=r.value.bars; markRealChart(r.value.sym); } });
      if(Object.keys(updates).length>0){
        setCharts(prev=>({...prev,...updates}));
      }
    };
    const iv=setInterval(refresh,60000); // 每60秒刷新一次真實歷史K棒
    return()=>{cancelled=true;clearInterval(iv);};
  },[broker.status,wl,markRealChart]);

  // ── 真實報價輪詢（broker 連線後持續向後端抓真實即時股價，取代模擬數據）──
  useEffect(()=>{
    if(broker.status!=="connected") return;
    let cancelled=false;
    const fetchAll=async()=>{
      const results=await Promise.allSettled(
        wl.map(async sym=>{
          const r=await fetch(`/api/sinopac?path=price/${encodeURIComponent(sym)}`);
          const d=await r.json();
          if(!r.ok) throw new Error(d.detail||"查詢失敗");
          return{sym,...d};
        })
      );
      if(cancelled) return;
      const updates={};
      const nameUpdates={};
      results.forEach((r,i)=>{
        const sym=wl[i];
        if(r.status==="fulfilled"&&r.value.price){
          const{price,change=0,change_percent=0,name}=r.value;
          updates[sym]={price:Number(price),chg:Number(change),pct:Number(change_percent)};
          if(name) nameUpdates[sym]=name; // 永豐回傳的真實中文名稱
          markReal(sym); // 標記為真實報價來源，停用該股的亂數模擬跳動
        }
      });
      if(Object.keys(nameUpdates).length>0){
        setRealNames(prev=>({...prev,...nameUpdates}));
      }
      if(Object.keys(updates).length>0){
        setLive(prev=>({...prev,...updates}));
        setRealBases(prev=>{
          const next={...prev};
          Object.entries(updates).forEach(([sym,d])=>{next[sym]=d.price;});
          return next;
        });
      }
    };
    fetchAll();
    const iv=setInterval(fetchAll,15000); // 每15秒更新一次真實報價
    return()=>{cancelled=true;clearInterval(iv);};
  },[broker.status,wl,markReal]);

  // ── 清理已移除自選股的殘留資料（避免記憶體累積、避免移除後重新加入出現舊資料）──
  const prevWlR = useRef(wl);
  useEffect(()=>{
    const removed = prevWlR.current.filter(s=>!wl.includes(s));
    prevWlR.current = wl;
    if(removed.length===0) return;
    removed.forEach(sym=>realSymR.current.delete(sym));
    setRealSyms(prev=>{ const n=new Set(prev); removed.forEach(s=>n.delete(s)); return n; });
    setRealChartSyms(prev=>{ const n=new Set(prev); removed.forEach(s=>n.delete(s)); return n; });
    setCharts(p=>{ const n={...p}; removed.forEach(s=>delete n[s]); return n; });
    setSparks(p=>{ const n={...p}; removed.forEach(s=>delete n[s]); return n; });
    setLive(p=>{ const n={...p}; removed.forEach(s=>delete n[s]); return n; });
    setSigs(p=>{ const n={...p}; removed.forEach(s=>delete n[s]); return n; });
    setRealBases(p=>{ const n={...p}; removed.forEach(s=>delete n[s]); return n; });
  },[wl]);

  // ── 自動補充新增自選股的圖表資料（已連線時抓真實歷史K棒，取代亂數模擬，讓RSI/MACD/ML訓練基於真實價格）──
  useEffect(()=>{
    const missing=wl.filter(sym=>!charts[sym]);
    if(missing.length===0) return;
    (async()=>{
      const bases={};
      const newNames={};
      const realCharts={}; // {sym: 真實K棒陣列} 成功取得真實歷史資料的股票
      // 已連線：嘗試抓真實歷史K棒（取代亂數模擬），失敗才退回模擬
      if(brokerR.current?.status==="connected"){
        await Promise.all(missing.map(async sym=>{
          if(STOCKS[sym]?.base){ bases[sym]=STOCKS[sym].base; return; } // 美股/內建股票本來就有模擬基準，永豐無真實資料
          try{
            const hr=await fetch(`/api/sinopac?path=history/${encodeURIComponent(sym)}?bars=90`);
            const hd=await hr.json();
            if(hr.ok&&hd.bars&&hd.bars.length>=20){
              realCharts[sym]=hd.bars;
              bases[sym]=hd.bars[hd.bars.length-1].close;
              markReal(sym);
              markRealChart(sym);
            }
          }catch{}
          // 沒有真實歷史K棒時，至少嘗試抓目前報價當基準（用於模擬圖表的起點，比預設100準確）
          if(bases[sym]==null){
            try{
              const r=await fetch(`/api/sinopac?path=price/${encodeURIComponent(sym)}`);
              const d=await r.json();
              if(r.ok&&d.price){ bases[sym]=Number(d.price); markReal(sym); if(d.name) newNames[sym]=d.name; }
            }catch{}
          }
        }));
      }
      if(Object.keys(newNames).length>0) setRealNames(prev=>({...prev,...newNames}));
      // 補上還沒查到真實價格的（未連線 or 查詢失敗）：用既有 realBases 或預設 100，並標記非真實
      missing.forEach(sym=>{
        if(bases[sym]==null){
          bases[sym]=STOCKS[sym]?.base||realBases[sym]||100;
        }
      });
      setCharts(prev=>{
        const next={...prev};
        missing.forEach(sym=>{ next[sym]=realCharts[sym]||genHistory(bases[sym]); });
        return next;
      });
      setSparks(prev=>{
        const next={...prev};
        missing.forEach(sym=>{
          next[sym]=realCharts[sym]
            ? realCharts[sym].slice(-24).map(b=>({v:b.close}))
            : genSpark(bases[sym]);
        });
        return next;
      });
      setLive(prev=>{
        const next={...prev};
        missing.forEach(sym=>{
          if(next[sym]) return;
          const base=bases[sym];
          if(realSymR.current.has(sym)){
            next[sym]={price:base,chg:0,pct:0}; // 真實報價：起點即真實價，不疊加亂數
          } else {
            const c=(Math.random()-0.45)*base*0.022;
            next[sym]={price:+base.toFixed(2),chg:+c.toFixed(2),pct:+(c/base*100).toFixed(2)};
          }
        });
        return next;
      });
      setRealBases(prev=>{
        const next={...prev};
        missing.forEach(sym=>{ if(realSymR.current.has(sym)) next[sym]=bases[sym]; });
        return next;
      });
    })();
  },[wl,realBases,markReal,markRealChart]);

  // ── Close position ───────────────────────────────────────────
  // ── Auto trading engine (30s) ────────────────────────────────
  const connectingR=useRef(false); // 同步防止connectBroker被重複呼叫——broker.status的更新不是同步的，
  // 光靠disabled={broker.status==="connecting"}這個畫面上的防呆，在自動連線生效跟手動點擊之間還是有
  // 一個小空窗可能讓兩邊都呼叫到，造成同一個/connect請求送兩次(後端OFI訂閱因此短時間內被呼叫兩次，
  // 第二次因為股票都已經訂閱過，迴圈裡直接continue跳過，回傳0/49成功，被log訊息誤判成「訂閱失敗」)。
  const connectBroker = useCallback(async()=>{
    if(!broker.apiKey.trim()||!broker.secretKey.trim()){
      setBroker(b=>({...b,error:"請輸入 API Key 與 Secret Key"})); return;
    }
    if(connectingR.current) return;  // 已經有一次連線在進行中，直接忽略這次重複呼叫
    connectingR.current=true;
    setBroker(b=>({...b,status:"connecting",error:null}));
    try{
      const r=await fetch("/api/sinopac?path=connect",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({api_key:broker.apiKey,secret_key:broker.secretKey})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"連接失敗");
      setBroker(b=>({...b,status:"connected",account:d,error:null}));
      // 記住帳密到 localStorage（不自動連接，只記住讓下次方便輸入）
      try{ localStorage.setItem("sinopac_creds",JSON.stringify({apiKey:broker.apiKey,secretKey:broker.secretKey})); }catch{}
      // 取得帳戶餘額
      try{
        const br=await fetch("/api/sinopac?path=account");
        const bd=await br.json();
        if(br.ok) setBroker(b=>({...b,balance:bd}));
      }catch{}
      // 取得真實持倉
      try{
        const pr=await fetch("/api/sinopac?path=positions");
        const pd=await pr.json();
        if(pr.ok&&Array.isArray(pd)) setRealPos(pd);
      }catch{}
    }catch(e){
      setBroker(b=>({...b,status:"disconnected",error:e.message||"連接失敗，請確認金鑰正確"}));
    }finally{
      connectingR.current=false;
    }
  },[broker.apiKey,broker.secretKey]);

  // ── 自動連接：開啟網站時若已有記住的金鑰，直接自動連接永豐，不需手動再按一次 ──
  const autoConnectedR = useRef(false); // 確保整次瀏覽只自動嘗試一次，不會在使用者手動中斷連接後又被打擾
  useEffect(()=>{
    if(autoConnectedR.current) return;
    if(broker.apiKey&&broker.secretKey&&broker.status==="disconnected"){
      autoConnectedR.current=true;
      connectBroker();
    }
  },[broker.apiKey,broker.secretKey,broker.status,connectBroker]);

  // ── 修正手機背景切換問題：手機切到背景一段時間後，後端可能已重啟/重新部署，
  // 導致畫面顯示「已連接」但其實後端早已斷線（真實股價停止更新，要手動重連才會恢復）。
  // 回到前景時主動驗證連接是否真的還有效，無效就自動重新連接。
  useEffect(()=>{
    const onVisible=async()=>{
      if(document.visibilityState!=="visible") return;
      if(brokerR.current?.status!=="connected") return;
      try{
        const r=await fetch("/api/sinopac?path=health");
        const d=await r.json();
        if(!r.ok||d.connected===false){
          // 後端已斷線（重啟導致），自動重新連接
          setBroker(b=>({...b,status:"disconnected"}));
          autoConnectedR.current=false; // 允許再次自動連接
        }
      }catch{}
    };
    document.addEventListener("visibilitychange",onVisible);
    return()=>document.removeEventListener("visibilitychange",onVisible);
  },[]);

  const disconnectBroker = useCallback(async()=>{
    try{ await fetch("/api/sinopac?path=disconnect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})}); }catch{}
    setBroker(b=>({...b,status:"disconnected",account:null,balance:null,error:null}));
  },[]);

  // ── 後端24h自動交易控制 ────────────────────────────────────────
  // 點交易紀錄查看當時K線：抓真實歷史K棒(後端/history端點)，跟自選股的charts分開存，
  // 因為股票池選到的標的(如2801)通常不在使用者自選股清單wl裡，charts的清理邏輯只認wl，混在一起容易被誤刪
  const viewTradeChart = useCallback(async(t)=>{
    setModal({type:"tradeChart",data:t});
    if(tradeChartCache[t.sym]?.bars) return;  // 已經抓過，不重複打API
    setTradeChartCache(prev=>({...prev,[t.sym]:{loading:true}}));
    try{
      const r=await fetch(`/api/sinopac?path=history/${encodeURIComponent(t.sym)}?bars=90`);
      const d=await r.json();
      if(!r.ok||!d.bars?.length) throw new Error(d.note||"無歷史資料");
      setTradeChartCache(prev=>({...prev,[t.sym]:{bars:d.bars,loading:false}}));
    }catch(e){
      setTradeChartCache(prev=>({...prev,[t.sym]:{loading:false,error:e.message}}));
    }
  },[tradeChartCache]);

  const startBackendAuto = useCallback(async(forceReal=false)=>{
    if(broker.status!=="connected"){alert("請先連接永豐帳戶");return;}
    setBackendAuto(b=>({...b,loading:true}));
    try{
      const r=await fetch("/api/sinopac?path=auto/start",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({risk,cap_pct:autoCapPct,watchlist:wl,paper_mode:backendPaperMode,force_real:forceReal})});
      const d=await r.json();
      if(r.ok){
        setBackendAuto(b=>({...b,enabled:true,loading:false,status:d.state}));
        try{ localStorage.setItem("backend_auto_should_run","true"); }catch{} // 記住意圖：後端重啟/重新部署後可自動恢復
      }else{
        setBackendAuto(b=>({...b,loading:false}));
        // 修正⑥：真實下單驗證門檻被擋下時，detail是結構化物件({message,progress,hint})，
        // 用專屬modal顯示進度+提供「我了解風險、強制啟動」選項，而不是丟一個語焉不詳的字串alert
        if(d.detail&&typeof d.detail==="object"&&d.detail.progress){
          setModal({type:"realGateBlocked",data:d.detail});
        }else{
          throw new Error((typeof d.detail==="string"&&d.detail)||"啟動失敗");
        }
      }
    }catch(e){
      alert("後端自動交易啟動失敗："+e.message);
      setBackendAuto(b=>({...b,loading:false}));
    }
  },[broker.status,risk,autoCapPct,wl,backendPaperMode]);

  const stopBackendAuto = useCallback(async()=>{
    try{
      await fetch("/api/sinopac?path=auto/stop",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})});
      setBackendAuto(b=>({...b,enabled:false}));
      try{ localStorage.setItem("backend_auto_should_run","false"); }catch{}
    }catch{}
  },[]);

  const resetBackendDailyStats = useCallback(async()=>{
    try{
      const r=await fetch("/api/sinopac?path=auto/reset-daily",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})});
      const d=await r.json();
      if(r.ok) setBackendAuto(b=>({...b,status:d.state}));
      setModal(null);
    }catch{ setModal(null); }
  },[]);

  // 自動恢復後端自動交易：若使用者之前啟動過、但輪詢發現後端目前是停止狀態（可能因Railway重啟/重新部署而遺失記憶體狀態），
  // 自動重新呼叫一次啟動，避免每次都要手動重新按
  const backendAutoResumedR = useRef(false);
  useEffect(()=>{
    if(backendAutoResumedR.current) return;
    if(broker.status!=="connected") return;
    let shouldRun=false;
    try{ shouldRun=localStorage.getItem("backend_auto_should_run")==="true"; }catch{}
    if(shouldRun&&!backendAuto.enabled&&!backendAuto.loading&&backendAuto.status!==null){
      backendAutoResumedR.current=true;
      startBackendAuto();
    }
  },[broker.status,backendAuto.enabled,backendAuto.loading,backendAuto.status,startBackendAuto]);

  // ═══════════════════════════════════════════════════════════════
  // COMPUTED
  // ═══════════════════════════════════════════════════════════════
  // 共用元件 Card/Row/Chip 已提升至檔案頂層（穩定身分，避免重複渲染時被重建）

  // ═══════════════════════════════════════════════════════════════
  // ⬡ OVERVIEW
  // ═══════════════════════════════════════════════════════════════
  const OverviewTab = () => {
    const beConnected=broker.status==="connected"&&backendAuto.status;
    const beStat=backendAuto.status||{};
    const pv=beStat.paper_validation;
    const isPaper=beStat.paper_mode!==false;  // 預設模擬模式，跟後端_auto_state_defaults一致
    const beAssets=beConnected?(isPaper?N(beStat.paper_capital):N(beStat.capital))+N(beStat.daily_pnl):null;
    const beDayPnL=beConnected?N(beStat.daily_pnl):null;
    const beWinRate=beConnected?(beStat.daily_trades>0?+(beStat.daily_win/beStat.daily_trades*100).toFixed(1):0):null;
    const wins=pv?.wins||0, losses=pv?.losses||0;
    const totalWin=pv?.total_win_pnl||0, totalLoss=pv?.total_loss_pnl||0;
    const pf2=totalLoss!==0?(totalWin/Math.abs(totalLoss)):(totalWin>0?Infinity:0);

    if(!beConnected){
      return(
        <div className="space-y-3">
          <Card cls="p-6 text-center">
            <Link2 className="w-8 h-8 text-gray-700 mx-auto mb-3"/>
            <div className="text-sm font-bold text-white mb-1">尚未連接永豐帳戶</div>
            <div className="text-[10px] text-gray-600 mb-4">連接後這裡會顯示後端AI自動交易的即時狀態</div>
            <button onClick={()=>setTab("system")} className="px-5 py-2.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold">前往系統頁連接</button>
          </Card>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {/* 看門狗警示放最上面，連線狀態異常時第一眼就看到 */}
        {beStat.watchdog?.alerted&&(
          <div className="bg-red-500/15 border border-red-500/40 rounded-xl p-3 flex items-start gap-2 animate-pulse">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"/>
            <div>
              <div className="text-sm font-bold text-red-400">⚠️ 主交易迴圈心跳異常</div>
              <div className="text-[10px] text-red-300/80 mt-0.5">已經{beStat.watchdog.seconds_since_tick}秒沒有正常跳動，請到「自動交易」分頁查看詳情。</div>
            </div>
          </div>
        )}
        {beStat.lgbm_model&&!beStat.lgbm_model.loaded&&(
          <div onClick={()=>setTab("strategy")} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2 cursor-pointer">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5"/>
            <div>
              <div className="text-sm font-bold text-amber-400">LightGBM模型尚未載入，目前不會進場</div>
              <div className="text-[10px] text-amber-300/80 mt-0.5">這是預期內的設計（沒模型就不交易），請先在自己電腦上跑train_lgbm_model.py訓練並部署 · 點此查看詳情</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Card onClick={()=>setTab("auto")} cls="p-4">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">資產(後端)</div>
            <div className="text-3xl font-mono font-bold text-white">{(beAssets/1e3).toFixed(1)}<span className="text-base">K</span></div>
            <div className="text-[9px] text-gray-600 mt-1">{beStat.paper_mode?"模擬下單":"真實下單"}</div>
          </Card>
          <Card onClick={()=>setTab("records")} cls="p-4">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">今日損益</div>
            <div className={`text-3xl font-mono font-bold ${CC(beDayPnL)}`}>{beDayPnL>=0?"+":""}{(beDayPnL/1e3).toFixed(1)}<span className="text-base">K</span></div>
            <div className="text-[9px] text-gray-600 mt-1">{beStat.daily_trades||0}筆交易</div>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card onClick={()=>setTab("records")} cls="p-4">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">累積勝率</div>
            <div className={`text-2xl font-mono font-bold ${beWinRate>=60?"text-emerald-400":beWinRate>=45?"text-amber-400":"text-red-400"}`}>{beWinRate}%</div>
            <div className="text-[9px] text-gray-600 mt-1">{wins}勝{losses}敗（驗證期累積）</div>
          </Card>
          <Card onClick={()=>setTab("records")} cls="p-4">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">獲利因子</div>
            <div className={`text-2xl font-mono font-bold ${pf2>=1.5?"text-emerald-400":pf2>0?"text-amber-400":"text-gray-600"}`}>{pf2===Infinity?"∞":pf2.toFixed(2)}</div>
            <div className="text-[9px] text-gray-600 mt-1">{">"}1.5算及格</div>
          </Card>
        </div>

        {/* 最大回撤/年化報酬率：從每日收盤權益曲線算出來，不是即時數字(每天14:30盤後記錄一筆) */}
        {(()=>{
          const pm=beStat.performance_metrics;
          if(!pm?.available) return(
            <Card onClick={()=>setTab("records")} cls="p-3">
              <div className="text-[9px] text-gray-600 text-center py-1">最大回撤／年化報酬率：{pm?.reason||"還沒有足夠的權益曲線資料（每天收盤後14:30才會記錄一筆，至少要跑滿2個交易日）"}</div>
            </Card>
          );
          return(
            <div className="grid grid-cols-2 gap-3">
              <Card onClick={()=>setModal({type:"perfMetricsDetail"})} cls="p-4">
                <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">最大回撤</div>
                <div className={`text-2xl font-mono font-bold ${pm.max_drawdown_pct<=5?"text-emerald-400":pm.max_drawdown_pct<=15?"text-amber-400":"text-red-400"}`}>-{pm.max_drawdown_pct.toFixed(2)}%</div>
                <div className="text-[9px] text-gray-600 mt-1">歷史高點到低點的最大跌幅</div>
              </Card>
              <Card onClick={()=>setModal({type:"perfMetricsDetail"})} cls="p-4">
                <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                  年化報酬率{!pm.is_annualized_reliable&&<AlertTriangle className="w-3 h-3 text-amber-400"/>}
                </div>
                <div className={`text-2xl font-mono font-bold ${!pm.is_annualized_reliable?"text-gray-600":pm.annualized_return_pct>=0?"text-emerald-400":"text-red-400"}`}>
                  {pm.annualized_return_pct>=0?"+":""}{pm.annualized_return_pct?.toFixed(1)}%
                </div>
                <div className="text-[9px] text-gray-600 mt-1">{pm.is_annualized_reliable?`累積${pm.trading_days}個交易日，外推估計`:"樣本太少，先別當真"}</div>
              </Card>
            </div>
          );
        })()}

        {/* Auto status */}
        <Card onClick={()=>setTab("auto")} cls="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${backendAuto.enabled?"bg-emerald-400 animate-pulse":"bg-gray-700"}`}/>
              <span className="text-xs font-bold text-white">後端AI自動交易</span>
              <Chip c={RISK_BADGE_CLS[risk]}>{RISK_CFG[risk].label}</Chip>
            </div>
            <span className={`text-[10px] font-bold ${backendAuto.enabled?"text-emerald-400":"text-gray-600"}`}>{backendAuto.enabled?"運行中":"已停止"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="text-[9px] text-gray-600">持倉中</div><div className="text-xs font-mono font-bold text-white">{(beStat.positions||[]).length}筆</div></div>
            <div><div className="text-[9px] text-gray-600">模擬驗證</div><div className="text-xs font-mono font-bold text-violet-400">{pv?.trade_count||0}/{(backendAuto.status?.paper_validation_min_trades??PAPER_VALIDATION_MIN_TRADES)}筆</div></div>
            <div onClick={e=>{e.stopPropagation();setModal({type:"funnelDetail"});}} className="cursor-pointer"><div className="text-[9px] text-gray-600">今日掃描</div><div className="text-xs font-mono font-bold text-cyan-400 underline decoration-dotted">{beStat.funnel?.scanned||0}次</div></div>
          </div>
        </Card>

        {/* AI飆股雷達 TOP5：後端真實掃描全市場主要股票，技術面動能排序 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-amber-400"/>AI飆股雷達 TOP5
            </div>
            {scanResults.updated&&(
              <span className="text-[8px] text-gray-700">更新於 {scanResults.updated}</span>
            )}
          </div>
          <div className="text-[9px] text-amber-400/70 px-1 leading-relaxed">
            依RSI、量能、趨勢等技術指標排序，反映目前動能強度，<span className="font-bold">不是漲跌預測保證</span>，請自行判斷風險。
          </div>
          {scanResults.loading&&scanResults.results.length===0?(
            <div className="text-[10px] text-gray-600 text-center py-6 flex items-center justify-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin"/>掃描中（約需30秒~1分鐘）...
            </div>
          ):scanResults.results.length===0?(
            <div className="text-[10px] text-gray-600 text-center py-6">目前沒有明確動能信號的股票，請稍後再試</div>
          ):(
            scanResults.results.map((r,idx)=>{
              const isLong=r.action==="buy";
              const inWl=wl.includes(r.symbol);
              return(
                <Card key={r.symbol} cls="p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isLong?"bg-emerald-500/15 text-emerald-400":"bg-red-500/15 text-red-400"}`}>
                      {idx+1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-white">{r.symbol}</span>
                        <span className="text-[9px] text-gray-600">{getStockName(r.symbol)}</span>
                      </div>
                      <div className="text-[9px] text-gray-600">RSI {r.rsi} · 信心 {r.conf}%</div>
                    </div>
                    <Chip c={isLong?"bg-emerald-500/10 border-emerald-500/25 text-emerald-400":"bg-red-500/10 border-red-500/25 text-red-400"}>
                      {isLong?"建議偏多▲":"建議偏空▼"}
                    </Chip>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-[#0a1422] rounded-lg p-2 mb-2">
                    <div className="text-center">
                      <div className="text-[8px] text-gray-600">現價/建議進場</div>
                      <div className="text-[11px] font-mono font-bold text-white">NT${r.price}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[8px] text-gray-600">停損價</div>
                      <div className="text-[11px] font-mono font-bold text-red-400">NT${r.stop_loss}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[8px] text-gray-600">停利價</div>
                      <div className="text-[11px] font-mono font-bold text-emerald-400">NT${r.take_profit}</div>
                    </div>
                  </div>
                  <button onClick={()=>{
                    if(!inWl) setWl(w=>[...w,r.symbol]);
                    setTab("market");
                  }} className="w-full py-1.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 rounded-lg text-[10px] font-bold">
                    {inWl?"前往市場頁查看":"加入自選股並查看"}
                  </button>
                </Card>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // ▶ AUTO TRADING
  // ═══════════════════════════════════════════════════════════════
  const AutoTab = () => {
    const cfg=RISK_CFG[risk];
    return(
      <div className="space-y-3">
        {/* Params */}
        <Card onClick={()=>setTab("strategy")} cls="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider">目前風險等級：{cfg.label}（點擊前往策略分頁調整）</div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[{l:"單筆上限",v:`${cfg.alloc*100}%`},{l:"停損",v:`${cfg.sl}%`},{l:"止盈",v:`${cfg.tp}%`},{l:"最多持倉",v:`${cfg.maxPos}筆`}].map(x=>(
              <div key={x.l}><div className="text-[9px] text-gray-600">{x.l}</div><div className="text-xs font-mono font-bold text-white">{x.v}</div></div>
            ))}
          </div>
        </Card>

        {/* 後端24h自動交易卡片（連接永豐後才顯示，可關閉瀏覽器持續運行） */}
        {broker.status==="connected"&&(
          <Card cls="p-4 border border-violet-500/20">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[9px] text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${backendAuto.enabled?"bg-violet-400 animate-pulse":"bg-gray-700"}`}/>
                後端24小時自動交易
              </div>
              <Chip c={backendAuto.enabled?"border-violet-500/30 text-violet-400 bg-violet-500/10":"border-gray-700 text-gray-600"}>
                {backendAuto.enabled?"後端運行中":"後端待機"}
              </Chip>
            </div>
            {backendAuto.status&&(
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  {l:"今日損益",v:`${(backendAuto.status.daily_pnl||0)>=0?"+":""}NT$${Math.round(backendAuto.status.daily_pnl||0)}`,c:CC(backendAuto.status.daily_pnl)},
                  {l:"勝率",v:`${backendAuto.status.daily_trades>0?Math.round(backendAuto.status.daily_win/(backendAuto.status.daily_trades||1)*100):0}%`,c:"text-cyan-400"},
                  {l:"持倉",v:`${backendAuto.status.positions_count||0}筆`,c:"text-white"},
                ].map(x=>(
                  <div key={x.l} className="bg-[#0a1622] rounded-xl p-2 text-center">
                    <div className="text-[8px] text-gray-600">{x.l}</div>
                    <div className={`text-[11px] font-mono font-bold mt-0.5 ${x.c}`}>{x.v}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[9px] text-gray-600 mb-3 leading-relaxed">
              關閉瀏覽器後仍持續交易 · 台股時段 09:00-13:25 · 風險等級（{RISK_CFG[risk].label}）
              {backendPaperMode?" · 模擬模式會從40檔主要股票池找AI預估利潤最高的機會（不限自選股）":" · 真實下單僅限你的自選股清單，較保守"}
              · 自動板塊分散（同板塊不重複持倉）· 獲利1.5%後自動移動停利鎖定部分獲利
            </div>
            {backendAuto.status?.paper_mode!=null&&backendAuto.enabled&&(
              <div className={`mb-3 text-[10px] px-3 py-2 rounded-lg border flex items-center gap-2 ${backendAuto.status.paper_mode?"bg-cyan-500/10 border-cyan-500/25 text-cyan-400":"bg-red-500/10 border-red-500/25 text-red-400"}`}>
                {backendAuto.status.paper_mode?<FileText className="w-3.5 h-3.5 flex-shrink-0"/>:<Flame className="w-3.5 h-3.5 flex-shrink-0"/>}
                {backendAuto.status.paper_mode?"目前為模擬下單：用真實股價波動計算損益，不會花真錢":"目前為真實下單：會送出真實委託，花真實的錢"}
              </div>
            )}
            {!backendAuto.enabled&&(
              <div className="flex gap-2 mb-3">
                <button onClick={()=>setBackendPaperMode(true)}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold border flex items-center justify-center gap-1.5 ${backendPaperMode?"bg-cyan-500/15 border-cyan-500/40 text-cyan-400":"border-[#0d2137] text-gray-600"}`}>
                  <FileText className="w-3 h-3"/>模擬下單（真實股價，不花真錢）
                </button>
                <button onClick={()=>setBackendPaperMode(false)}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold border flex items-center justify-center gap-1.5 ${!backendPaperMode?"bg-red-500/15 border-red-500/40 text-red-400":"border-[#0d2137] text-gray-600"}`}>
                  <Flame className="w-3 h-3"/>真實下單
                </button>
              </div>
            )}
            {!backendAuto.enabled&&!backendPaperMode&&backendAuto.status?.paper_validation&&(()=>{
              const pv=backendAuto.status.paper_validation;
              const trades=pv.trade_count||0, days=(pv.trading_days||[]).length;
              const wins=pv.wins||0, losses=pv.losses||0;
              const totalWin=pv.total_win_pnl||0, totalLoss=pv.total_loss_pnl||0;
              const pf = totalLoss!==0 ? (totalWin/Math.abs(totalLoss)) : (totalWin>0?Infinity:0);
              const winRate = (wins+losses)>0 ? (wins/(wins+losses)*100) : 0;
              const ready=trades>=(backendAuto.status?.paper_validation_min_trades??PAPER_VALIDATION_MIN_TRADES)&&days>=(backendAuto.status?.paper_validation_min_days??PAPER_VALIDATION_MIN_DAYS);
              return(
                <div className={`mb-3 text-[10px] px-3 py-2 rounded-lg border ${ready?"bg-emerald-500/10 border-emerald-500/25 text-emerald-400":"bg-amber-500/10 border-amber-500/25 text-amber-400"}`}>
                  <div>模擬驗證進度：{trades}/{(backendAuto.status?.paper_validation_min_trades??PAPER_VALIDATION_MIN_TRADES)}筆 · {days}/{(backendAuto.status?.paper_validation_min_days??PAPER_VALIDATION_MIN_DAYS)}天
                  {ready?" ✓ 已達門檻，可切換真實下單":" — 未達門檻前啟動會被擋下（可強制跳過，但不建議）"}</div>
                  {(wins+losses)>0&&(
                    <div className="mt-1 text-[9px] opacity-80">
                      累積勝率{winRate.toFixed(0)}% · 獲利因子{pf===Infinity?"∞":pf.toFixed(2)}(&gt;1.5算及格) · 平均贏{(pv.win_pct_sum&&wins?pv.win_pct_sum/wins:0).toFixed(2)}% 平均輸{(pv.loss_pct_sum&&losses?pv.loss_pct_sum/losses:0).toFixed(2)}%
                    </div>
                  )}
                </div>
              );
            })()}
            {!backendAuto.enabled?(
              <button onClick={()=>startBackendAuto(false)} disabled={backendAuto.loading}
                className="w-full py-2.5 bg-violet-500/10 border border-violet-500/30 text-violet-400 rounded-xl text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
                {backendAuto.loading?<><RefreshCw className="w-3 h-3 animate-spin"/>啟動中...</>:`啟動後端24h自動交易（${backendPaperMode?"模擬":"真實"}）`}
              </button>
            ):(
              <button onClick={stopBackendAuto}
                className="w-full py-2.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs font-bold">
                停止後端自動交易
              </button>
            )}
            <button onClick={()=>setModal({type:"resetDailyConfirm"})}
              className="w-full mt-2 py-2 bg-[#070f1c] border border-[#0d2137] text-gray-500 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5">
              <RotateCcw className="w-3 h-3"/>今日損益清零（重新開始記錄）
            </button>
            {backendAuto.status?.funnel&&(()=>{
              const fn=backendAuto.status.funnel;
              const rows=Object.entries(FUNNEL_LABELS).filter(([k])=>k!=="opened"&&k!=="scanned").map(([k,label])=>({k,label,n:fn[k]||0})).filter(r=>r.n>0).sort((a,b)=>b.n-a.n);
              return(
                <div onClick={()=>setModal({type:"funnelDetail"})} className="mt-3 bg-[#0a1422] border border-[#0d2137] rounded-lg p-2.5 cursor-pointer hover:bg-[#0d1a2e]">
                  <div className="flex items-center justify-between text-[9px] mb-1.5">
                    <span className="text-gray-600">今日交易漏斗（掃描{fn.scanned||0}次 · 成功進場{fn.opened||0}筆）</span>
                    <span className="text-cyan-400 underline decoration-dotted">點看詳情</span>
                  </div>
                  {rows.length===0&&fn.opened===0?(
                    <div className="text-[9px] text-gray-700">今天還沒有掃描紀錄</div>
                  ):rows.length>0?(
                    <div className="text-[9px] text-amber-400/80">最主要原因：{rows[0].label} × {rows[0].n}次</div>
                  ):(
                    <div className="text-[9px] text-emerald-400/80">候選都順利通過篩選</div>
                  )}
                </div>
              );
            })()}
            {backendAuto.log.length>0&&(
              <div className="mt-3 max-h-24 overflow-y-auto overflow-x-hidden space-y-1">
                {backendAuto.log.slice(0,5).map((l,i)=>(
                  <div key={i} onClick={()=>setModal({type:"logDetail",data:l})}
                    className="flex gap-2 text-[9px] cursor-pointer hover:bg-[#0a1422] rounded px-1 -mx-1 py-0.5">
                    <span className="text-gray-700 flex-shrink-0">{l.ts}</span>
                    <span className="text-gray-500 flex-shrink-0">{l.sym}</span>
                    <span className="text-gray-400 underline decoration-dotted decoration-gray-700 min-w-0 break-words">{l.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* 後端目前持倉明細（之前只有數字「N筆」沒有清單，現在補上） */}
        {/* 看門狗警示：主交易迴圈心跳異常時顯示，這是真正能解決的風險(監控程式卡住)，
            不是文件提的「沒有券商端OCO」——Shioaji官方文件證實股票沒有真正的券商端觸價單，
            停損停利本來就是客戶端監控，這個banner就是在處理客戶端監控失效的情況 */}
        {backendAuto.status?.watchdog?.alerted&&(
          <div className="bg-red-500/15 border border-red-500/40 rounded-xl p-3 flex items-start gap-2 animate-pulse">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"/>
            <div>
              <div className="text-sm font-bold text-red-400">⚠️ 主交易迴圈心跳異常</div>
              <div className="text-[10px] text-red-300/80 mt-0.5">
                已經{backendAuto.status.watchdog.seconds_since_tick}秒沒有正常跳動，停損停利可能沒有在監控中。
                {backendAuto.status?.positions?.length>0?"目前有持倉，請立刻檢查伺服器狀態，必要時手動到永豐app/網頁平倉。":"目前沒有持倉，但請檢查伺服器是否正常。"}
              </div>
            </div>
          </div>
        )}
        {broker.status==="connected"&&backendAuto.status&&(()=>{
          const secAgo=backendAuto.lastFetchedAt?Math.round((Date.now()-backendAuto.lastFetchedAt)/1000):null;
          const stale=secAgo===null||secAgo>90;
          const positions=backendAuto.status.positions||[];
          return(
          <Card cls="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[9px] text-gray-600 uppercase tracking-wider">
                後端目前持倉（{positions.length}筆）
              </div>
              <div className={`text-[8px] ${stale?"text-red-400":"text-gray-600"}`}>
                {secAgo===null?"尚未取得資料":stale?`⚠️ 資料已${secAgo}秒未更新，可能無法連線`:`資料更新於${secAgo}秒前`}
              </div>
            </div>
            {positions.length===0?(
              <div className="text-[10px] text-gray-600 py-2">目前無持倉</div>
            ):(
            <div className="space-y-1.5">
              {positions.map((p,i)=>(
                <div key={i} className="bg-[#0a1422] rounded-lg p-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-bold text-white">{p.sym}</span>
                      <span className="text-[9px] text-gray-600">{getStockName(p.sym)}</span>
                      {p.grade&&p.grade!=="-"&&<span className={`text-[7px] px-1 py-0.5 rounded font-bold border ${GRADE_STYLE[p.grade]||GRADE_STYLE.C}`}>{p.grade}級</span>}
                      <span className={`text-[9px] font-bold ${p.dir==="L"?"text-emerald-400":"text-red-400"}`}>{p.dir==="L"?"做多":"做空"}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono text-white">{p.qty}張@NT${N(p.entry).toFixed(2)}</div>
                      <div className="text-[8px] text-gray-600">{p.regime&&p.regime!=="-"?REGIME_LABEL[p.regime]||p.regime:""} · {p.open_time}進場</div>
                    </div>
                  </div>
                  {p.entry_reason&&p.entry_reason!=="-"&&(
                    <div className="text-[8px] text-cyan-400/70 mt-1.5 pt-1.5 border-t border-[#0d2137]">買進原因：{p.entry_reason}</div>
                  )}
                </div>
              ))}
            </div>
            )}
            <div className="text-[8px] text-gray-700 mt-2">即時損益請看上方「持倉」統計數字；這裡只顯示進場明細跟AI評分等級</div>
          </Card>
          );
        })()}

      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // ▤ RECORDS — 交易紀錄＋累積驗證統計，獨立分頁給更多空間
  // ═══════════════════════════════════════════════════════════════
  const RecordsTab = () => {
    const pv=backendAuto.status?.paper_validation;
    const trades=pv?.trade_count||0, days=(pv?.trading_days||[]).length;
    const wins=pv?.wins||0, losses=pv?.losses||0;
    const totalWin=pv?.total_win_pnl||0, totalLoss=pv?.total_loss_pnl||0;
    const pf2=totalLoss!==0?(totalWin/Math.abs(totalLoss)):(totalWin>0?Infinity:0);
    const winRate=(wins+losses)>0?(wins/(wins+losses)*100):0;
    const avgWin=wins>0?(pv.win_pct_sum||0)/wins:0, avgLoss=losses>0?(pv.loss_pct_sum||0)/losses:0;
    const ready=trades>=(backendAuto.status?.paper_validation_min_trades??PAPER_VALIDATION_MIN_TRADES)&&days>=(backendAuto.status?.paper_validation_min_days??PAPER_VALIDATION_MIN_DAYS);
    return(
      <div className="space-y-3">
        {/* 累積驗證統計：跨天不清空，這才是判斷「這套系統20筆跑完後到底行不行」的數據 */}
        <Card cls="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider">累積驗證統計（跨天，不會每日清空）</div>
            <Chip c={ready?"border-emerald-500/30 text-emerald-400 bg-emerald-500/10":"border-amber-500/30 text-amber-400 bg-amber-500/10"}>
              {trades}/{(backendAuto.status?.paper_validation_min_trades??PAPER_VALIDATION_MIN_TRADES)}筆 · {days}/{(backendAuto.status?.paper_validation_min_days??PAPER_VALIDATION_MIN_DAYS)}天
            </Chip>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0a1422] rounded-lg p-3 text-center">
              <div className="text-[9px] text-gray-600 mb-1">累積勝率</div>
              <div className={`text-xl font-mono font-bold ${winRate>=60?"text-emerald-400":winRate>=45?"text-amber-400":"text-red-400"}`}>{winRate.toFixed(0)}%</div>
              <div className="text-[8px] text-gray-700 mt-0.5">{wins}勝{losses}敗</div>
            </div>
            <div className="bg-[#0a1422] rounded-lg p-3 text-center">
              <div className="text-[9px] text-gray-600 mb-1">獲利因子</div>
              <div className={`text-xl font-mono font-bold ${pf2>=1.5?"text-emerald-400":pf2>0?"text-amber-400":"text-gray-600"}`}>{pf2===Infinity?"∞":pf2.toFixed(2)}</div>
              <div className="text-[8px] text-gray-700 mt-0.5">{">"}1.5算及格</div>
            </div>
          </div>
          <div className="flex justify-between text-[10px] mt-2 px-1">
            <span className="text-gray-600">平均贏 <span className="text-emerald-400 font-mono">{avgWin>=0?"+":""}{avgWin.toFixed(2)}%</span></span>
            <span className="text-gray-600">平均輸 <span className="text-red-400 font-mono">{avgLoss.toFixed(2)}%</span></span>
          </div>
          {!ready&&(
            <div className="text-[9px] text-amber-400/70 mt-2 leading-relaxed">未達20筆+5天門檻前，真實下單會被擋下，這是刻意設計——先用模擬模式累積到足夠統計意義的樣本。</div>
          )}
        </Card>
        {/* 交易紀錄(含進出場原因+評分等級，點擊可看當時K線) */}
        {backendAuto.status?.trade_history!==undefined&&(
          <Card cls="p-4">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">
              後端交易紀錄（今日{backendAuto.status?.trade_history?.length>0?`，共${backendAuto.status.trade_history.length}筆`:""}）
            </div>
            {!backendAuto.status?.trade_history?.length?(
              <div className="text-[10px] text-gray-600 text-center py-6">
                {backendAuto.enabled?"尚無已完成交易，AI找到機會進出場後會顯示在這裡":"後端自動交易尚未啟動"}
              </div>
            ):(
            <div className="space-y-1.5 max-h-[32rem] overflow-y-auto">
              {backendAuto.status.trade_history.map((t,i)=>{
                const shares=t.shares??(t.qty*1000); // 舊紀錄沒有shares欄位時，用張數推算（1張=1000股）
                const costBasis=t.total_cost_basis??(t.entry*shares);
                const hasBreakdown=t.gross_pnl!=null&&t.fees!=null;
                return(
                <div key={i} onClick={()=>viewTradeChart(t)} className="bg-[#0a1422] rounded-lg p-3 cursor-pointer hover:bg-[#0d1a2e] transition-colors active:scale-[0.99]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-bold text-white">{t.sym}</span>
                      <span className="text-[9px] text-gray-600">{getStockName(t.sym)}</span>
                      {t.from_pool&&<span className="text-[7px] px-1 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/25">股票池</span>}
                      {t.grade&&t.grade!=="-"&&<span className={`text-[7px] px-1 py-0.5 rounded font-bold border ${GRADE_STYLE[t.grade]||GRADE_STYLE.C}`}>{t.grade}級</span>}
                      <span className={`text-[9px] font-bold ${t.dir==="L"?"text-emerald-400":"text-red-400"}`}>{t.dir==="L"?"做多":"做空"}</span>
                    </div>
                    <span className={`text-sm font-mono font-bold ${N(t.pnl)>=0?"text-emerald-400":"text-red-400"}`}>{N(t.pnl)>=0?"+":""}NT${N(t.pnl).toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 mb-2 text-center bg-[#070f1c] rounded-lg p-2">
                    <div>
                      <div className="text-[8px] text-gray-600">買進股數</div>
                      <div className="text-[10px] font-mono font-bold text-white">{shares.toLocaleString()}股</div>
                      <div className="text-[8px] text-gray-700">（{t.qty}張）</div>
                    </div>
                    <div>
                      <div className="text-[8px] text-gray-600">進場/出場（每股）</div>
                      <div className="text-[10px] font-mono font-bold text-white">NT${t.entry}→NT${t.exit}</div>
                    </div>
                    <div>
                      <div className="text-[8px] text-gray-600">總進場成本</div>
                      <div className="text-[10px] font-mono font-bold text-cyan-400">NT${Math.round(costBasis).toLocaleString()}</div>
                    </div>
                  </div>
                  {hasBreakdown&&(
                    <div className="flex items-center justify-between text-[9px] text-gray-600 mb-1.5 px-1">
                      <span>毛利 <span className={N(t.gross_pnl)>=0?"text-emerald-400":"text-red-400"}>{N(t.gross_pnl)>=0?"+":""}NT${N(t.gross_pnl).toLocaleString()}</span></span>
                      <span>－ 手續費/證交稅 <span className="text-amber-400">NT${N(t.fees).toLocaleString()}</span></span>
                      <span>＝ 淨損益 <span className={N(t.pnl)>=0?"text-emerald-400":"text-red-400"}>{N(t.pnl)>=0?"+":""}NT${N(t.pnl).toLocaleString()}</span></span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[9px] text-gray-600">
                    <span>報酬率</span>
                    <span className={N(t.pct)>=0?"text-emerald-400":"text-red-400"}>{N(t.pct)>=0?"+":""}{t.pct}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[8px] text-gray-700 mt-1">
                    <span>{t.open_time} → {t.close_time}</span>
                    <span className="flex items-center gap-1">{t.regime&&t.regime!=="-"?`${REGIME_LABEL[t.regime]||t.regime} · `:""}{t.tag}<Activity className="w-2.5 h-2.5 text-gray-700"/></span>
                  </div>
                  {(t.entry_reason&&t.entry_reason!=="-")||(t.exit_reason&&t.exit_reason!=="-")?(
                    <div className="mt-1.5 pt-1.5 border-t border-[#0d2137] space-y-0.5">
                      {t.entry_reason&&t.entry_reason!=="-"&&<div className="text-[8px] text-cyan-400/70">買進原因：{t.entry_reason}</div>}
                      {t.exit_reason&&t.exit_reason!=="-"&&<div className="text-[8px] text-amber-400/70">賣出原因：{t.exit_reason}</div>}
                    </div>
                  ):null}
                </div>
              );})}
            </div>
            )}
          </Card>
        )}
        {/* SHAP特徵分析原始資料匯出 */}
        {broker.status==="connected"&&(
          <Card cls="p-4">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">特徵歸因分析(SHAP)原始資料</div>
            <div className="text-[9px] text-gray-600 leading-relaxed mb-3">每筆交易進場時餵給LightGBM的完整特徵向量+結果，跨天累積。驗證期跑完後可下載這份CSV，用analyze_shap.py分析哪些特徵真的有用。</div>
            <a href="/api/sinopac?path=auto/feature_log.csv" target="_blank" rel="noreferrer"
              className="w-full py-2.5 bg-violet-500/10 border border-violet-500/25 text-violet-400 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5">
              <FileText className="w-3.5 h-3.5"/>下載 paper_test_data.csv
            </a>
          </Card>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // ◈ STRATEGY — 風險等級/資金配置/成本，都是實際影響後端下單行為的設定
  // ═══════════════════════════════════════════════════════════════
  const StrategyTab = () => {
    return(
    <div className="space-y-3">
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">進場判斷模型</div>
        <Row l="決策引擎" v="LightGBM 做多勝率模型" c="text-violet-400"/>
        <Row l="特徵來源" v="技術指標+市場環境+OFI大單流+價差+大盤同步+時段 共18項"/>
        <Row l="模型狀態" v={backendAuto.status?.lgbm_model?.loaded?"✅ 已載入":"❌ 尚未載入"} c={backendAuto.status?.lgbm_model?.loaded?"text-emerald-400":"text-red-400"}/>
        {backendAuto.status?.lgbm_model&&!backendAuto.status.lgbm_model.loaded&&(
          <div className="text-[9px] text-red-400/80 mt-1.5 leading-relaxed">{backendAuto.status.lgbm_model.error}</div>
        )}
        <Row l="驗證狀態" v={backendAuto.status?.paper_validation?.trade_count>=(backendAuto.status?.paper_validation_min_trades??PAPER_VALIDATION_MIN_TRADES)?"已達20筆門檻":"模擬驗證中"} c="text-amber-400"/>
        <div className="text-[9px] text-gray-700 mt-2 leading-relaxed">沒有訓練好的模型檔案時，後端會誠實地不進場，不會悄悄退回舊規則——這是刻意設計，避免在不知情的情況下用未驗證的邏輯下單。</div>
      </Card>
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">風險等級</div>
        {backendAuto.enabled&&(
          <div className="text-[9px] text-amber-400/90 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5 mb-3 leading-relaxed">
            後端運行中無法切換——切換風險等級不會即時套用到正在跑的AI，也會讓現有持倉的停損停利標準變得不清楚。請先到「自動交易」分頁停止後再切換。
          </div>
        )}
        <div className="space-y-3">
          {Object.entries(RISK_CFG).map(([k,c])=>(
            <button key={k} disabled={backendAuto.enabled} onClick={()=>setRisk(k)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${risk===k?c.bg:"border-[#0d2137] opacity-60"} ${backendAuto.enabled?"cursor-not-allowed":""}`}>
              <div className="flex items-center justify-between">
                <div className={`text-[10px] font-bold ${c.c} mb-1`}>{c.label}</div>
              </div>
              <div className="text-[9px] text-gray-500">
                信心門檻 {c.minConf}%↑ · 單筆上限 {c.alloc*100}% · 停損 {c.sl}% · 止盈 {c.tp}% · 最多 {c.maxPos} 筆
              </div>
            </button>
          ))}
        </div>
        <div className="text-[9px] text-gray-700 mt-3 leading-relaxed">實際部位大小由LightGBM信心度連續線性縮放，這裡的「單筆上限」是縮放公式的上限值，不是固定值；信心剛好等於門檻時只會用上限的30%。</div>
      </Card>
      <Card cls="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider">AI自動交易可用資金比例</div>
          <span className="text-[10px] font-mono font-bold text-cyan-400">{autoCapPct}%</span>
        </div>
        <input type="range" min={10} max={100} step={5} value={autoCapPct}
          onChange={e=>setAutoCapPct(Number(e.target.value))}
          className="w-full accent-cyan-400 mb-2"/>
        <div className="flex justify-between text-[9px] text-gray-600">
          <span>10%</span><span>50%</span><span>100%</span>
        </div>
        <div className="text-[9px] text-amber-400/70 mt-2 leading-relaxed">
          真實盤：以「扣除T+2待交割款後的可用資金」× 此比例計算可動用金額（不是帳戶總餘額）。台灣股票一律以整張（1張=1000股）下單，零股不可當沖、依法不開放。
        </div>
        <div className="text-[9px] text-gray-700 mt-2 leading-relaxed">
          已串接永豐真實合約資料：自動檢查個股當沖資格（處置股/不符資格股票會被AI自動跳過）與漲跌停鎖死風險，避免送出必定失敗或無法沖銷的委託。總曝險固定不超過資金30%，單次週期最多開2檔新倉。
        </div>
      </Card>
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">模擬資金設定（虛擬盤專用）</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-[9px] text-gray-600 mb-1">目前總額</div>
            <div className="text-sm font-mono font-bold text-white">NT${Number(backendAuto.status?.paper_capital||0).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-600 mb-1">可用（已扣交割中金額）</div>
            <div className="text-sm font-mono font-bold text-cyan-400">NT${Number(backendAuto.status?.paper_available_capital||0).toLocaleString()}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <input type="number" min={1} step={100000} value={paperCapInput}
            onChange={e=>setPaperCapInput(e.target.value)} placeholder="例如 10000000"
            className="flex-1 bg-[#0a1622] border border-[#0d2137] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"/>
          <button onClick={async()=>{
            const v=Number(paperCapInput);
            if(!v||v<=0){alert("請輸入大於0的金額");return;}
            try{
              const r=await fetch("/api/sinopac?path=auto/paper-capital",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:v})});
              if(r.ok) alert(`模擬資金已設定為NT$${v.toLocaleString()}`);
              else { const d=await r.json(); alert(d.detail||"設定失敗"); }
            }catch{ alert("設定失敗，請檢查網路連線"); }
          }} className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold">套用</button>
        </div>
        <div className="text-[9px] text-gray-700 mt-2 leading-relaxed">
          這筆資金完全獨立於你的真實永豐帳戶，不會被真實帳戶的待交割款卡住——模擬模式的部位大小用這個算，目的是讓你能在不受真實資金限制的情況下，跑出足夠多筆模擬交易做驗證。
          平倉獲利會像真實交易一樣計入這個總額（已扣手續費+證交稅），且一樣遵守T+2交割規則：剛平倉的錢要等2個交易日後才會變成「可用」，不會立刻又能拿來開新倉。
        </div>
      </Card>
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">手續費折扣設定</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-[9px] text-gray-600 mb-1">目前設定</div>
            <div className="text-sm font-mono font-bold text-white">{(Number(backendAuto.status?.fee_discount??0.6)*10).toFixed(1)}折</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-600 mb-1">至少要漲跌多少%才划算</div>
            <div className="text-sm font-mono font-bold text-cyan-400">{Number(backendAuto.status?.min_profitable_move_pct??0.321).toFixed(3)}%</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" min={0.1} max={10} step={0.1} value={feeDiscountInput}
            onChange={e=>setFeeDiscountInput(e.target.value)} placeholder="例如 6（代表6折）"
            className="flex-1 bg-[#0a1622] border border-[#0d2137] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"/>
          <span className="text-[10px] text-gray-600">折</span>
          <button onClick={async()=>{
            const v=Number(feeDiscountInput);
            if(!v||v<=0||v>10){alert("請輸入0~10之間的折數，例如6折就填6");return;}
            try{
              const r=await fetch("/api/sinopac?path=auto/fee-discount",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({discount:v/10})});
              if(r.ok) alert(`手續費折扣已設定為${v}折`);
              else { const d=await r.json(); alert(d.detail||"設定失敗"); }
            }catch{ alert("設定失敗，請檢查網路連線"); }
          }} className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold">套用</button>
        </div>
        <div className="text-[9px] text-gray-700 mt-2 leading-relaxed">
          每個人跟永豐談到的實際折扣不一樣（從1折到完全沒折扣都有），這個數字會直接影響所有損益試算的準確度——設得跟你實際拿到的折扣不一樣，模擬驗證的數字就會系統性偏離真實情況。可以在永豐的對帳單或營業員那邊確認自己實際的折扣是多少。
        </div>
      </Card>
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">當沖真實交易成本</div>
        <Row l="手續費（買進）" v="0.1425%×6折" c="text-gray-400"/>
        <Row l="手續費（賣出）" v="0.1425%×6折" c="text-gray-400"/>
        <Row l="當沖證交稅" v="0.15%（優惠至2027）" c="text-gray-400"/>
        <Row l="損益兩平最小漲跌" v={`${MIN_PROFITABLE_MOVE_PCT.toFixed(2)}%`} c="text-amber-400"/>
        <div className="text-[9px] text-gray-700 mt-2 leading-relaxed">
          每筆當沖交易必須漲跌超過 {MIN_PROFITABLE_MOVE_PCT.toFixed(2)}% 才能在扣除手續費與證交稅後真正獲利。所有交易損益顯示均已扣除此成本。
        </div>
      </Card>
    </div>
  );};

  // ═══════════════════════════════════════════════════════════════
  // ◐ SYSTEM — 連接/帳戶/輔助市場資訊
  // ═══════════════════════════════════════════════════════════════
  const SystemTab = () => (
    <div className="space-y-3">
      <Card cls="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider flex items-center gap-1.5"><Link2 className="w-3 h-3"/>永豐證券連接</div>
          <Chip c={
            broker.status==="connected" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" :
            broker.status==="connecting" ? "border-amber-500/30 text-amber-400 bg-amber-500/10" :
            "border-gray-600/30 text-gray-500 bg-gray-500/10"
          }>
            {broker.status==="connected"?"● 已連接":broker.status==="connecting"?"連接中":"未連接"}
          </Chip>
        </div>
        {broker.status!=="connected" ? (
          <div className="space-y-2.5">
            <input type="password" placeholder="API Key" value={broker.apiKey}
              onChange={e=>setBroker(b=>({...b,apiKey:e.target.value,error:null}))}
              className="w-full bg-[#0a1622] border border-[#0d2137] rounded-lg px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"/>
            <input type="password" placeholder="Secret Key" value={broker.secretKey}
              onChange={e=>setBroker(b=>({...b,secretKey:e.target.value,error:null}))}
              className="w-full bg-[#0a1622] border border-[#0d2137] rounded-lg px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"/>
            {broker.error && <div className="flex items-start gap-1.5 text-[10px] text-red-400"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0"/>{broker.error}</div>}
            <button onClick={connectBroker} disabled={broker.status==="connecting"}
              className="w-full py-2.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
              {broker.status==="connecting" ? <><RefreshCw className="w-3 h-3 animate-spin"/>連接中...</> : "連接真實帳戶"}
            </button>
            <div className="text-[9px] text-gray-600 leading-relaxed">連接後將自動讀取真實帳戶餘額與持倉。下單行為由「自動交易」分頁的「模擬/真實」切換決定——模擬僅試算，真實會送出真實委託。</div>
            <div className="text-[9px] text-amber-400/70 mt-1.5 leading-relaxed">當沖需符合法規資格（開戶滿3個月＋近1年成交達10筆＋已簽署當沖風險預告書），請先確認已在永豐開通，否則委託會被拒絕。零股不可當沖，僅整張可當沖（本系統已固定使用張為單位）。</div>
            <div className="text-[9px] text-gray-700 mt-1.5 flex items-center gap-1"><Lightbulb className="w-3 h-3 flex-shrink-0"/>已記住的金鑰下次開啟網站會自動連接，不需要再手動按一次。</div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 mb-2"><ShieldCheck className="w-3.5 h-3.5"/>身分驗證成功</div>
            {broker.account?.ca_activated===true&&<div className="flex items-center gap-1 text-[9px] text-cyan-400 mb-2"><ShieldCheck className="w-3 h-3"/>CA 憑證已啟用（可查詢庫存）</div>}
            {broker.account?.ca_activated===false&&<div className="text-[9px] text-amber-400 mb-2">CA 憑證未啟用 — 持倉查詢可能為空，請確認 Railway 環境變數</div>}
            {broker.account?.stock_account && (()=>{
              const a=broker.account.stock_account;
              const pid=(a.match(/person_id='([^']+)'/)||[])[1]||"";
              const aid=(a.match(/account_id='([^']+)'/)||[])[1]||"";
              const nm=(a.match(/username='([^']+)'/)||[])[1]||"";
              return(<>
                <Row l="姓名" v={nm.length<=1?nm:nm.slice(0,1)+"*".repeat(Math.max(nm.length-2,1))+nm.slice(-1)} c="text-emerald-400"/>
                <Row l="身分證字號" v={pid.slice(0,2)+"****"+pid.slice(-3)}/>
                <Row l="帳號" v={"****"+aid.slice(-4)} c="text-cyan-400"/>
              </>);
            })()}
            {broker.balance && <>
              <Row l="帳戶餘額" v={`NT$${Number(broker.balance.balance||0).toLocaleString()}`}/>
              <Row l="可用資金" v={`NT$${Number(broker.balance.available||0).toLocaleString()}`} c="text-cyan-400"/>
              {broker.balance.pending_settlement>0&&(
                <Row l="待交割金額(T+2)" v={`-NT$${Number(broker.balance.pending_settlement).toLocaleString()}`} c="text-amber-400"/>
              )}
              {broker.balance.available_after_settlement!=null&&(
                <Row l="當沖可用資金" v={`NT$${Number(broker.balance.available_after_settlement).toLocaleString()}`} c="text-emerald-400"/>
              )}
              {Array.isArray(broker.balance.settlement_schedule)&&broker.balance.settlement_schedule.length>0&&(
                <div className="mt-2 pt-2 border-t border-[#0d2137]">
                  <div className="text-[9px] text-gray-600 mb-1.5">交割明細（哪天會交割多少錢）</div>
                  {broker.balance.settlement_schedule.map((s,i)=>(
                    <div key={i} className="flex justify-between text-[10px] py-1">
                      <span className="text-gray-500">{s.date}</span>
                      <span className="text-amber-400 font-mono">NT${Number(s.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </>}
            <button onClick={disconnectBroker} className="w-full py-2 bg-red-500/10 border border-red-500/25 text-red-400 rounded-lg text-xs font-bold mt-3">中斷連接</button>
          </div>
        )}
      </Card>
      {/* 真實持倉卡片 */}
      {broker.status==="connected"&&(
        <Card cls="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider">真實持倉</div>
            <button onClick={async()=>{
              try{const r=await fetch("/api/sinopac?path=positions");const d=await r.json();if(r.ok&&Array.isArray(d))setRealPos(d);}catch{}
            }} className="text-[9px] text-gray-600 hover:text-cyan-400 flex items-center gap-1"><RefreshCw className="w-3 h-3"/>重新整理</button>
          </div>
          {realPos.length===0?(
            <div className="text-[10px] text-gray-600 text-center py-4">無持倉 / 點擊重新整理</div>
          ):(
            <div className="space-y-2">
              {realPos.map(p=>(
                <div key={p.symbol} onClick={()=>setModal({type:"realPosDetail",data:p})}
                  className="bg-[#0a1622] rounded-xl p-3 border border-[#0d2137] cursor-pointer hover:border-cyan-500/30">
                  <div className="flex justify-between items-center mb-1">
                    <div><span className="text-xs font-mono font-bold text-white">{p.symbol}</span><span className="text-[9px] text-gray-500 ml-2">{getStockName(p.symbol)}</span></div>
                    <span className={`text-xs font-mono font-bold ${(p.pnl||0)>=0?"text-emerald-400":"text-red-400"}`}>{(p.pnl||0)>=0?"+":""}{Number(p.pnl||0).toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-500">
                    <span>{p.quantity}股 · 均價 ${Number(p.avg_price||0).toFixed(2)}</span>
                    <span>市值 ${Number(p.value||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                  </div>
                  <div className="flex justify-between text-[9px] mt-0.5">
                    <span className="text-gray-600">現價 ${Number(p.current_price||0).toFixed(2)}</span>
                    <span className={`font-mono ${(p.pnl_percent||0)>=0?"text-emerald-400":"text-red-400"}`}>{(p.pnl_percent||0)>=0?"+":""}{Number(p.pnl_percent||0).toFixed(2)}%</span>
                  </div>
                </div>
              ))}
              <div className="pt-1 border-t border-[#0d2137] flex justify-between text-[10px]">
                <span className="text-gray-600">持倉市值合計</span>
                <span className="text-white font-mono">${realPos.reduce((s,p)=>s+Number(p.value||0),0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
              </div>
            </div>
          )}
        </Card>
      )}
      <Card cls="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider">三大法人買賣超排行</div>
          <button onClick={fetchInstFlows} className="text-[9px] text-gray-600 hover:text-cyan-400 flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${instFlows.loading?"animate-spin":""}`}/>{instFlows.date||"更新"}
          </button>
        </div>
        {broker.status!=="connected" ? (
          <div className="text-[10px] text-gray-600 text-center py-3">連接永豐帳戶後可查看真實三大法人買賣超排行</div>
        ) : instFlows.topBuy.length===0&&instFlows.topSell.length===0 ? (
          <div className="text-[10px] text-gray-600 text-center py-3">{instFlows.loading?"查詢中...":"今日資料尚未公布（證交所約15:30後公布）"}</div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[9px] text-emerald-400 mb-1.5">買超前{Math.min(5,instFlows.topBuy.length)}名</div>
              {instFlows.topBuy.slice(0,5).map(s=>(
                <div key={s.symbol} className="flex items-center justify-between py-1 text-[10px]">
                  <span className="text-gray-400">{s.symbol} <span className="text-gray-600">{s.name}</span></span>
                  <span className="text-emerald-400 font-mono">+{Math.round(s.total/1000)}張</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[9px] text-red-400 mb-1.5">賣超前{Math.min(5,instFlows.topSell.length)}名</div>
              {instFlows.topSell.slice(0,5).map(s=>(
                <div key={s.symbol} className="flex items-center justify-between py-1 text-[10px]">
                  <span className="text-gray-400">{s.symbol} <span className="text-gray-600">{s.name}</span></span>
                  <span className="text-red-400 font-mono">{Math.round(s.total/1000)}張</span>
                </div>
              ))}
            </div>
            <div className="text-[8px] text-gray-700">資料來源：臺灣證交所公開資料（外資+投信+自營商合計，僅供參考，不代表未來走勢）</div>
          </div>
        )}
      </Card>
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">系統資訊</div>
        <Row l="決策引擎" v="LightGBM做多勝率模型" c="text-violet-400"/>
        <Row l="數據來源" v={broker.status==="connected"?"永豐真實報價（台股）":"未連接永豐"} c={broker.status==="connected"?"text-emerald-400":"text-amber-400"}/>
        <Row l="決策週期" v="每30秒"/>
        <Row l="OFI/大單流" v="Tick+BidAsk雙資料流"/>
        <Row l="後端架構" v="Railway Python + FastAPI"/>
      </Card>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // MODALS
  // ═══════════════════════════════════════════════════════════════
  // 用 useCallback 固定 MW 的函式參照，避免每次畫面更新（如15秒報價輪詢）都被React當成全新元件重新掛載，
  // 導致彈窗內的捲動位置被重置（這正是「往下滑幾秒後跳回最上面」的根本原因）
  const MW = useCallback(({title,children}) => (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={()=>setModal(null)}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md"/>
      <div className="relative w-full max-w-lg bg-[#050c18] border-t border-x border-[#0d2137] rounded-t-3xl max-h-[88vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="sticky top-0 bg-[#050c18] border-b border-[#0d2137] px-5 py-3 flex items-center justify-between z-10">
          <span className="text-sm font-bold text-white">{title}</span>
          <button onClick={()=>setModal(null)} className="w-7 h-7 bg-[#0a1422] border border-[#0d2137] rounded-full flex items-center justify-center">
            <X className="w-3.5 h-3.5 text-gray-500"/>
          </button>
        </div>
        <div className="p-5 pb-10">{children}</div>
      </div>
    </div>
  ),[]);

  const MC = () => {
    if(!modal) return null;
    const{type,data}=modal;
    switch(type){
      case "stockModal": {
        const{sym,lp,sig}=data; const cd=charts[sym]||[];
        const bareSym=sym.replace(".TW","").replace(".TWO","");
        const instMatch=[...instFlows.topBuy,...instFlows.topSell].find(s=>s.symbol===bareSym);
        return(
          <MW title={`${sym} · ${getStockName(sym)}`}>
            {realSyms?.has(sym)&&realChartSyms?.has(sym)?(
              <div className="flex items-center gap-1.5 mb-3 text-[9px] text-emerald-400"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>真實報價＋真實圖表（永豐即時資料）</div>
            ):realSyms?.has(sym)?(
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border border-amber-500/25 bg-amber-500/10 text-[10px] text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0"/>
                <span>現價是永豐真實報價，但下面的圖表抓不到真實歷史資料，目前是亂數模擬畫出來的（時間軸對不上實際交易時段也是這個原因）——現價可以參考，圖表/RSI不能當真。</span>
              </div>
            ):(
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border border-amber-500/25 bg-amber-500/10 text-[10px] text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0"/>
                <span>目前是模擬數據（亂數產生），不是這檔股票的真實報價——可能還沒連線，或這檔股票剛好抓不到真實資料。下面圖表跟指標都不能當真。</span>
              </div>
            )}
            {instMatch&&(
              <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border text-[10px] ${instMatch.total>=0?"bg-emerald-500/10 border-emerald-500/25 text-emerald-400":"bg-red-500/10 border-red-500/25 text-red-400"}`}>
                <span className="font-bold flex items-center gap-1">{instMatch.total>=0?<TrendingUp className="w-3 h-3"/>:<TrendingDown className="w-3 h-3"/>}{instMatch.total>=0?"三大法人買超":"三大法人賣超"}</span>
                <span className="ml-auto font-mono">{instMatch.total>=0?"+":""}{Math.round(instMatch.total/1000)}張（{instFlows.date}）</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[{l:"現價",v:`NT$${N(lp.price).toFixed(2)}`,c:"text-white"},{l:"漲跌",v:`${N(lp.pct)>=0?"+":""}${N(lp.pct).toFixed(2)}%`,c:CC(lp.pct)},{l:"信號",v:sig.action==="buy"?"買▲":sig.action==="sell"?"賣▼":"觀",c:sig.action==="buy"?"text-emerald-400":sig.action==="sell"?"text-red-400":"text-gray-500"}].map(x=>(
                <div key={x.l} className="bg-[#070f1c] border border-[#0d2137] rounded-xl p-2.5 text-center">
                  <div className="text-[9px] text-gray-600 mb-1">{x.l}</div>
                  <div className={`text-sm font-mono font-bold ${x.c}`}>{x.v}</div>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={100}>
              <ComposedChart data={cd} margin={{top:4,right:2,bottom:0,left:0}}>
                <defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2}/><stop offset="100%" stopColor="#22d3ee" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="1 8" stroke="#0d2137"/>
                <XAxis dataKey="time" tick={{fill:"#374151",fontSize:7}} interval={15} tickLine={false} axisLine={false}/>
                <YAxis tick={{fill:"#374151",fontSize:7}} domain={["auto","auto"]} tickLine={false} axisLine={false} width={38}/>
                <Area type="monotone" dataKey="price" stroke="#22d3ee" fill="url(#mg)" strokeWidth={1.5} dot={false}/>
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-0">
              <Row l="RSI" v={cd.length<30?"資料累積中...":sig.rsi?.toFixed(1)??"—"} c={sig.rsi<30?"text-emerald-400":sig.rsi>70?"text-red-400":"text-gray-300"}/>
              <Row l="技術指標信心" v={`${sig.conf}%`} c="text-violet-400"/>
              <Row l="產業" v={STOCKS[sym]?.sector||TW_NAMES[sym.replace(".TW","")]?"台灣股票":"—"}/>
            </div>
            <div className="text-[9px] text-gray-700 text-center mt-4 py-2 border-t border-[#0d2137]">這是RSI/MACD等規則式技術指標分數，不是後端LightGBM的判斷——實際進出場交給「自動交易」分頁的AI判斷，這裡只看指標</div>
          </MW>
        );
      }
      case "indicModal": {
        const{sym,sig}=data;
        return(
          <MW title={`${sym} · 技術指標`}>
            <Row l="RSI(14)" v={sig.rsi!=null?sig.rsi.toFixed(1):"計算中..."} c={sig.rsi<30?"text-emerald-400":sig.rsi>70?"text-red-400":"text-gray-300"}/>
            <Row l="RSI狀態" v={sig.rsi==null?"—":sig.rsi<30?"超賣 → 反彈機會":sig.rsi>70?"超買 → 回落風險":"正常區間"}/>
            <Row l="MA方向" v={sig.ma5!=null&&sig.ma20!=null?(sig.ma5>sig.ma20?"多頭排列":"空頭排列"):"計算中..."} c={sig.ma5>sig.ma20?"text-emerald-400":"text-red-400"}/>
            <Row l="MACD" v={sig.action==="buy"?"金叉":sig.action==="sell"?"死叉":"中性"} c={sig.action==="buy"?"text-emerald-400":sig.action==="sell"?"text-red-400":"text-gray-400"}/>
            <Row l="量比" v={sig.volRatio!=null?`${sig.volRatio.toFixed(2)}x`:"計算中..."} c={sig.volRatio>1.5?"text-amber-400":"text-gray-300"}/>
            <Row l="技術指標信心" v={`${sig.conf}%`} c="text-violet-400"/>
            <Row l="綜合信號" v={sig.action==="buy"?"買進▲":sig.action==="sell"?"賣出▼":"觀望"} c={sig.action==="buy"?"text-emerald-400":sig.action==="sell"?"text-red-400":"text-gray-400"}/>
          </MW>
        );
      }
      case "chartModal": {
        const{sym}=data; const cd=charts[sym]||[];
        return(
          <MW title={`${sym} · 完整圖表`}>
            <div className="space-y-3">
              <div>
                <div className="text-[9px] text-gray-600 mb-1">價格 + MA5/MA20</div>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={cd} margin={{top:4,right:2,bottom:0,left:0}}>
                    <defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25}/><stop offset="100%" stopColor="#22d3ee" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="1 8" stroke="#0d2137"/>
                    <XAxis dataKey="time" tick={{fill:"#374151",fontSize:7}} interval={15} tickLine={false} axisLine={false}/>
                    <YAxis tick={{fill:"#374151",fontSize:7}} domain={["auto","auto"]} tickLine={false} axisLine={false} width={40}/>
                    <Tooltip contentStyle={{background:"#070f1c",border:"1px solid #0d2137",borderRadius:8,color:"#fff",fontSize:10}} formatter={v=>[`NT$${v}`,""]}/>
                    <Area type="monotone" dataKey="price" stroke="#22d3ee" fill="url(#fg)" strokeWidth={2} dot={false}/>
                    <Line type="monotone" dataKey="ma5"  stroke="#a78bfa" strokeWidth={1} dot={false}/>
                    <Line type="monotone" dataKey="ma20" stroke="#fbbf24" strokeWidth={1} dot={false}/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div>
                <div className="text-[9px] text-gray-600 mb-1">RSI(14) · 紅線超買 綠線超賣</div>
                <ResponsiveContainer width="100%" height={70}>
                  <ComposedChart data={cd} margin={{top:4,right:2,bottom:0,left:0}}>
                    <XAxis dataKey="time" hide/><YAxis domain={[0,100]} hide ticks={[30,70]}/>
                    <ReferenceLine y={70} stroke="#f87171" strokeDasharray="3 3" strokeOpacity={0.4}/>
                    <ReferenceLine y={30} stroke="#4ade80" strokeDasharray="3 3" strokeOpacity={0.4}/>
                    <Line type="monotone" dataKey="rsi" stroke="#a78bfa" strokeWidth={1.5} dot={false} connectNulls={false}/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div>
                <div className="text-[9px] text-gray-600 mb-1">MACD 柱狀圖</div>
                <ResponsiveContainer width="100%" height={60}>
                  <ComposedChart data={cd} margin={{top:4,right:2,bottom:0,left:0}}>
                    <XAxis dataKey="time" hide/><YAxis domain={["auto","auto"]} hide/>
                    <ReferenceLine y={0} stroke="#374151" strokeOpacity={0.5}/>
                    <Bar dataKey="hist" fill="#a78bfa" opacity={0.7} radius={[1,1,0,0]}/>
                    <Line type="monotone" dataKey="macd"   stroke="#22d3ee" strokeWidth={1} dot={false} connectNulls={false}/>
                    <Line type="monotone" dataKey="signal" stroke="#fbbf24" strokeWidth={1} dot={false} connectNulls={false}/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </MW>
        );
      }
      case "tradeChart":{
        const t=modal.data;
        const cacheEntry=tradeChartCache[t.sym]||{};
        const bars=cacheEntry.bars||[];
        return(
          <MW title={`${t.sym} ${getStockName(t.sym)} · 當時K線`}>
            <div className="flex items-center justify-between mb-3 text-[10px]">
              <span className="text-gray-500">{t.open_time} 進場 → {t.close_time} 出場</span>
              <span className={N(t.pnl)>=0?"text-emerald-400":"text-red-400"}>{N(t.pnl)>=0?"+":""}NT${N(t.pnl).toLocaleString()} ({t.pct}%)</span>
            </div>
            {t.settlement_date&&(
              <div className="text-[9px] text-gray-600 mb-3 flex items-center gap-1.5">
                <Clock className="w-3 h-3"/>T+2交割日：{t.settlement_date}（此筆損益要等到這天才會變成可用模擬資金）
              </div>
            )}
            {cacheEntry.loading?(
              <div className="h-[180px] flex items-center justify-center text-gray-600 text-xs">
                <RefreshCw className="w-4 h-4 animate-spin mr-2"/>讀取真實歷史K棒中...
              </div>
            ):cacheEntry.error||!bars.length?(
              <div className="h-[180px] flex flex-col items-center justify-center text-gray-600 text-xs gap-1.5 px-4 text-center">
                <AlertCircle className="w-5 h-5"/>
                {cacheEntry.error||"查無歷史K棒資料（可能股票池標的太久沒掃過，或非交易日）"}
              </div>
            ):(
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={bars} margin={{top:4,right:4,bottom:0,left:0}}>
                    <defs><linearGradient id="tcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25}/><stop offset="100%" stopColor="#22d3ee" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="1 8" stroke="#0d2137"/>
                    <XAxis dataKey="time" tick={{fill:"#374151",fontSize:8}} interval={Math.ceil(bars.length/8)} tickLine={false} axisLine={false}/>
                    <YAxis tick={{fill:"#374151",fontSize:8}} domain={["auto","auto"]} tickLine={false} axisLine={false} width={42}/>
                    <Tooltip contentStyle={{background:"#0a1422",border:"1px solid #0d2137",borderRadius:8,fontSize:10}} labelStyle={{color:"#6b7280"}}/>
                    <Area type="monotone" dataKey="price" stroke="#22d3ee" fill="url(#tcg)" strokeWidth={1.5} dot={false}/>
                    <ReferenceLine y={N(t.entry)} stroke="#fbbf24" strokeDasharray="4 4" label={{value:`進場NT$${t.entry}`,fill:"#fbbf24",fontSize:9,position:"insideTopLeft"}}/>
                    <ReferenceLine y={N(t.exit)} stroke={N(t.pnl)>=0?"#34d399":"#f87171"} strokeDasharray="4 4" label={{value:`出場NT$${t.exit}`,fill:N(t.pnl)>=0?"#34d399":"#f87171",fontSize:9,position:"insideBottomLeft"}}/>
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="text-[8px] text-gray-700 mt-2">每根為5分鐘聚合K棒(真實歷史資料)，非逐筆tick；虛線標示這筆交易的進場/出場價位</div>
              </>
            )}
          </MW>
        );
      }
      case "realGateBlocked":{
        const pv=modal.data?.progress||{};
        return(
          <MW title="真實下單已被擋下">
            <div className="text-center py-3 mb-2">
              <div className="flex justify-center mb-3"><ShieldCheck className="w-9 h-9 text-amber-400"/></div>
              <div className="text-sm font-bold text-amber-400 mb-3">尚未達到真實下單的最低模擬驗證門檻</div>
              <div className="text-[11px] text-gray-400 leading-relaxed text-left bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
                <div>· 模擬交易筆數：{pv.trades??0} / {pv.min_trades??(backendAuto.status?.paper_validation_min_trades??PAPER_VALIDATION_MIN_TRADES)} 筆</div>
                <div>· 跨越交易日數：{pv.days??0} / {pv.min_days??(backendAuto.status?.paper_validation_min_days??PAPER_VALIDATION_MIN_DAYS)} 天</div>
                {pv.profit_factor!==undefined&&(pv.trades??0)>0&&(
                  <div>· 目前累積：勝率{pv.win_rate??0}% · 獲利因子{pv.profit_factor===null||pv.profit_factor===Infinity?"∞":pv.profit_factor} (&gt;1.5算及格)</div>
                )}
                <div className="pt-1 text-gray-500">用意：剛調整完邏輯/股票池/風險參數，先讓模擬模式（真實股價、不花真錢）實際跑出足夠多筆完整結果，確認真的可行，再切換真實下單，而不是憑感覺直接賭一次。</div>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={()=>{setBackendPaperMode(true);setModal(null);}} className="w-full py-3 bg-cyan-500/15 border border-cyan-500/40 text-cyan-400 rounded-xl text-sm font-bold">繼續用模擬模式累積驗證</button>
              <button onClick={()=>{setModal(null);startBackendAuto(true);}} className="w-full py-2.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-sm font-bold">我了解風險，強制啟動真實下單</button>
              <button onClick={()=>setModal(null)} className="w-full py-2 bg-[#070f1c] border border-[#0d2137] text-gray-500 rounded-xl text-sm font-bold">取消</button>
            </div>
          </MW>
        );
      }
      case "perfMetricsDetail": {
        const pm=backendAuto.status?.performance_metrics;
        if(!pm?.available) return(
          <MW title="績效指標">
            <div className="text-center py-8 text-gray-600 text-xs">{pm?.reason||"還沒有足夠的權益曲線資料"}</div>
          </MW>
        );
        return(
          <MW title="績效指標明細">
            {!pm.is_annualized_reliable&&(
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border border-amber-500/25 bg-amber-500/10 text-[10px] text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0"/>
                <span>{pm.reliability_note}</span>
              </div>
            )}
            <Row l="累積交易日數" v={`${pm.trading_days}天`}/>
            <Row l="起始權益" v={`NT$${Number(pm.start_equity).toLocaleString()}`}/>
            <Row l="目前權益" v={`NT$${Number(pm.end_equity).toLocaleString()}`}/>
            <Row l="累積總報酬率" v={`${pm.total_return_pct>=0?"+":""}${pm.total_return_pct}%`} c={pm.total_return_pct>=0?"text-emerald-400":"text-red-400"}/>
            <Row l="年化報酬率(外推估計)" v={`${pm.annualized_return_pct>=0?"+":""}${pm.annualized_return_pct}%`} c={!pm.is_annualized_reliable?"text-gray-500":pm.annualized_return_pct>=0?"text-emerald-400":"text-red-400"}/>
            <Row l="最大回撤" v={`-${pm.max_drawdown_pct}%`} c="text-red-400"/>
            <Row l="回撤區間" v={`${pm.max_drawdown_peak_date} → ${pm.max_drawdown_trough_date}`}/>
            <div className="text-[9px] text-gray-700 mt-3 leading-relaxed space-y-1.5">
              <div>· 這些數字每天收盤後14:30記錄一筆當天的帳戶總值，累積成權益曲線算出來的，不是即時數字，當天盤中不會變動。</div>
              <div>· 年化報酬率是用複利公式把目前累積的報酬率外推成「一年的話會是多少」——交易日數越少，這個外推越不可靠，可能被單一好/壞日子放大到失真，至少累積20個交易日後才值得認真參考。</div>
              <div>· 最大回撤是這段期間帳戶價值從某個歷史高點，到之後最深跌到哪裡的跌幅，不是只看頭尾兩天。</div>
            </div>
          </MW>
        );
      }
      case "realPosDetail": {
        const p=data;
        const totalCost=Number(p.avg_price||0)*Number(p.quantity||0);
        const isLong=(p.direction||"Buy")!=="Sell";
        return(
          <MW title={`${p.symbol} · ${getStockName(p.symbol)}`}>
            <div className="text-center py-3 mb-3 bg-[#0a1422] rounded-xl border border-[#0d2137]">
              <div className={`text-2xl font-mono font-bold ${(p.pnl||0)>=0?"text-emerald-400":"text-red-400"}`}>
                {(p.pnl||0)>=0?"+":""}NT${Number(p.pnl||0).toLocaleString(undefined,{maximumFractionDigits:0})}
              </div>
              <div className={`text-sm font-mono mt-1 ${(p.pnl_percent||0)>=0?"text-emerald-400":"text-red-400"}`}>
                {(p.pnl_percent||0)>=0?"+":""}{Number(p.pnl_percent||0).toFixed(2)}%
              </div>
            </div>
            <Row l="方向" v={isLong?"做多（持有現股）":"做空（融券）"} c={isLong?"text-emerald-400":"text-red-400"}/>
            <Row l="持有股數" v={`${Number(p.quantity||0).toLocaleString()}股`}/>
            <Row l="均價（每股成本）" v={`NT$${Number(p.avg_price||0).toFixed(2)}`}/>
            <Row l="買進總成本" v={`NT$${totalCost.toLocaleString(undefined,{maximumFractionDigits:0})}`} c="text-amber-400"/>
            <Row l="現價" v={`NT$${Number(p.current_price||0).toFixed(2)}`}/>
            <Row l="目前市值" v={`NT$${Number(p.value||0).toLocaleString(undefined,{maximumFractionDigits:0})}`} c="text-cyan-400"/>
            <div className="text-[9px] text-gray-700 mt-3 leading-relaxed">
              損益計算：{Number(p.quantity||0).toLocaleString()}股 ×（現價NT${Number(p.current_price||0).toFixed(2)} − 均價NT${Number(p.avg_price||0).toFixed(2)}）{isLong?"":"（做空方向相反）"} = {(p.pnl||0)>=0?"+":""}NT${Number(p.pnl||0).toLocaleString(undefined,{maximumFractionDigits:0})}
            </div>
            <div className="text-[9px] text-gray-700 mt-1 leading-relaxed">這是永豐真實帳戶的庫存損益，不含買進時已付出的手續費（永豐持倉資料本身不含這筆），實際入袋金額會比這裡顯示的數字再扣一點交易成本。</div>
          </MW>
        );
      }
      case "resetDailyConfirm":
        return(
          <MW title="今日損益清零">
            <div className="text-center py-3 mb-2">
              <div className="flex justify-center mb-3"><RotateCcw className="w-9 h-9 text-amber-400"/></div>
              <div className="text-sm font-bold text-amber-400 mb-3">將清空後端今日累計統計</div>
              <div className="text-[11px] text-gray-400 leading-relaxed text-left bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
                <div>· 今日損益、勝率、連勝/連虧計數會歸零</div>
                <div>· 目前的交易紀錄列表會清空，從現在開始重新記錄</div>
                <div>· 不會影響你的真實永豐帳戶或實際持倉</div>
                <div>· 只清除這個系統自己記錄的統計數字</div>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={resetBackendDailyStats} className="w-full py-3 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-xl text-sm font-bold">確認清零</button>
              <button onClick={()=>setModal(null)} className="w-full py-2.5 bg-[#070f1c] border border-[#0d2137] text-gray-400 rounded-xl text-sm font-bold">取消</button>
            </div>
          </MW>
        );
      case "logDetail": {
        const l=data; // {ts, sym, msg}
        const isOfiLine=l.msg.includes("OFI即時訂閱完成");
        const isCapLine=l.msg.includes("資金已同步");
        const failedSyms=backendAuto.status?.ofi_failed_symbols||[];
        const capInfo=backendAuto.status?.capital_info;
        return(
          <MW title="系統訊息詳情">
            <div className="bg-[#0a1422] border border-[#0d2137] rounded-xl p-3 mb-3">
              <div className="text-[9px] text-gray-600 mb-1">{l.ts} {l.sym&&`· ${l.sym}`}</div>
              <div className="text-xs text-gray-300 leading-relaxed">{l.msg}</div>
            </div>
            {isOfiLine&&failedSyms.length>0&&(
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 mb-2">
                <div className="text-[9px] text-amber-400 mb-2">訂閱失敗的股票代號（{failedSyms.length}檔）</div>
                <div className="flex flex-wrap gap-1.5">
                  {failedSyms.map(s=>(<span key={s} className="text-[10px] font-mono bg-[#0a1422] border border-amber-500/20 text-amber-300 px-2 py-0.5 rounded">{s}</span>))}
                </div>
                <div className="text-[9px] text-gray-600 mt-2 leading-relaxed">這些股票的OFI/大單流特徵會用0(中性值)代替，不影響其他特徵正常運作，但這幾檔的order_flow相關判斷會比較不準。常見原因：合約代碼查不到、或撞到訂閱數上限。</div>
              </div>
            )}
            {isOfiLine&&failedSyms.length===0&&(
              <div className="text-[10px] text-emerald-400 text-center py-2">這次沒有訂閱失敗的股票</div>
            )}
            {isCapLine&&capInfo&&(
              <div className="bg-[#0a1422] border border-[#0d2137] rounded-xl p-3">
                <Row l="帳戶餘額" v={`NT$${Number(capInfo.balance||0).toLocaleString()}`}/>
                <Row l="可用餘額" v={`NT$${Number(capInfo.available||0).toLocaleString()}`}/>
                <Row l="待交割金額(T+2)" v={`-NT$${Number(capInfo.pending_settlement||0).toLocaleString()}`} c="text-amber-400"/>
                <Row l="實際可用於下單" v={`NT$${Number(capInfo.available_after_settlement||0).toLocaleString()}`} c={capInfo.available_after_settlement>0?"text-emerald-400":"text-red-400"}/>
                {capInfo.available_after_settlement<=0&&(
                  <div className="text-[9px] text-red-400/80 mt-2 leading-relaxed">目前實際可用資金是0或負數，AI不會送出任何新單——不是系統卡住，是真的沒錢可買。通常是之前的買進還在T+2交割中，交割完成後可用資金會自動恢復。</div>
                )}
              </div>
            )}
            {!isOfiLine&&!isCapLine&&(
              <div className="text-[9px] text-gray-700 text-center py-1">這則訊息沒有額外的結構化明細，上面顯示的就是完整內容</div>
            )}
          </MW>
        );
      }
      case "funnelDetail": {
        const fn=backendAuto.status?.funnel||{};
        const rows=Object.entries(FUNNEL_LABELS).map(([k,label])=>({k,label,n:fn[k]||0})).sort((a,b)=>b.n-a.n);
        const total=fn.scanned||0;
        return(
          <MW title="今日交易漏斗">
            <div className="text-center py-2 mb-3">
              <div className="text-[10px] text-gray-500">今天共掃描 <span className="text-white font-mono font-bold">{total}</span> 次候選，成功進場 <span className="text-emerald-400 font-mono font-bold">{fn.opened||0}</span> 筆</div>
            </div>
            <div className="space-y-2">
              {rows.map(r=>(
                <div key={r.k} className="flex items-center gap-2">
                  <div className="flex-1 text-[10px] text-gray-400">{r.label}</div>
                  <div className="text-xs font-mono font-bold text-amber-400 w-10 text-right">{r.n}</div>
                  <div className="w-16 h-1.5 bg-[#0d2137] rounded-full overflow-hidden flex-shrink-0">
                    <div className="h-full bg-amber-500 rounded-full" style={{width:total>0?`${Math.min(100,r.n/total*100)}%`:"0%"}}/>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[9px] text-gray-700 mt-4 leading-relaxed">每一關都是獨立檢查，一個候選只會被算進「第一個擋下它的關卡」，不會重複計算。每天凌晨(交易日切換時)自動歸零重新計算。</div>
          </MW>
        );
      }
      default: return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return(
    <div className="bg-[#030b14] min-h-screen max-w-xl mx-auto text-white font-sans">
      {/* ── Header ── */}
      <div className="sticky top-0 z-40 bg-[#030b14]/97 backdrop-blur-2xl border-b border-[#0d2137]">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="relative w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-600 blur-md opacity-50 animate-pulse"/>
              <Activity className="w-4 h-4 text-white relative z-10"/>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold tracking-wide bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent">TradeAI Pro</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-[9px] px-2.5 py-1 rounded-full border font-bold ${backendAuto.enabled?RISK_BADGE_CLS[risk]:"bg-[#0d2137] border-[#1a3050] text-gray-600"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${backendAuto.enabled?`${RISK_DOT_CLS[risk]} animate-pulse`:"bg-gray-700"}`}/>
              {backendAuto.enabled?RISK_CFG[risk].label+"運行":"待機"}
            </div>
          </div>
        </div>
        {/* Stats strip：連線時顯示後端真實狀態，未連線時不裝作有數據可看 */}
        {(()=>{
          const beConnected=broker.status==="connected"&&backendAuto.status;
          const beStat=backendAuto.status||{};
          const isPaper=beStat.paper_mode!==false;
          const beAssets=beConnected?(isPaper?N(beStat.paper_capital):N(beStat.capital))+N(beStat.daily_pnl):0;
          const beDayPnL=beConnected?N(beStat.daily_pnl):0;
          const beWinRate=beConnected?(beStat.daily_trades>0?+(beStat.daily_win/beStat.daily_trades*100).toFixed(1):0):0;
          const pv=beStat.paper_validation;
          const stats=beConnected?[
            {l:"資產(後端)",v:`NT$${(beAssets/1e3).toFixed(1)}K`,c:"text-white",click:()=>setTab("auto")},
            {l:"今日(後端)",v:`${beDayPnL>=0?"+":""}NT$${F(beDayPnL,0)}`,c:CC(beDayPnL),click:()=>setTab("auto")},
            {l:"模擬驗證",v:pv?`${pv.trade_count||0}/${(backendAuto.status?.paper_validation_min_trades??PAPER_VALIDATION_MIN_TRADES)}筆`:"—",c:"text-violet-400",click:()=>setTab("records")},
            {l:"勝率(後端)",v:`${beWinRate}%`,c:beWinRate>=75?"text-emerald-400":beWinRate>=60?"text-amber-400":"text-red-400",click:()=>setTab("records")},
          ]:[
            {l:"資產",v:"—",c:"text-gray-600",click:()=>setTab("system")},
            {l:"今日",v:"—",c:"text-gray-600",click:()=>setTab("system")},
            {l:"模擬驗證",v:"—",c:"text-gray-600",click:()=>setTab("system")},
            {l:"勝率",v:"未連接",c:"text-gray-600",click:()=>setTab("system")},
          ];
          return(
            <div className="grid grid-cols-4 border-t border-[#0d2137]">
              {stats.map(x=>(
                <button key={x.l} onClick={x.click} className="text-center py-1.5 border-r border-[#0d2137] last:border-0 hover:bg-[#070f1c] transition-all">
                  <div className="text-[8px] text-gray-700">{x.l}</div>
                  <div className={`text-[10px] font-mono font-bold ${x.c}`}>{x.v}</div>
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ── Content ── */}
      <div className="px-4 py-4 pb-28">
        {tab==="overview" && OverviewTab()}
        {tab==="market"   && <MarketTab live={live} sigs={sigs} sparks={sparks} search={search} setSearch={setSearch} wl={wl} setWl={setWl} setModal={setModal} broker={broker} realBases={realBases} onRealPrice={(sym,price)=>setRealBases(b=>({...b,[sym]:price}))} wlSyncError={wlSyncError} realSyms={realSyms}/>}
        {tab==="auto"     && AutoTab()}
        {tab==="records"  && RecordsTab()}
        {tab==="strategy" && StrategyTab()}
        {tab==="system"   && SystemTab()}
      </div>

      {/* ── Bottom Nav ── */}
      <div className="fixed bottom-0 inset-x-0 max-w-xl mx-auto z-40">
        <div className="bg-[#030b14]/97 backdrop-blur-2xl border-t border-[#0d2137] px-2 pt-1.5 pb-5">
          <div className="grid grid-cols-6">
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                className={`relative flex flex-col items-center py-2 rounded-xl transition-all ${tab===t.id?"text-cyan-400":"text-gray-700 hover:text-gray-500"}`}>
                {t.id==="auto"&&(backendAuto.status?.positions?.length>0)&&(
                  <span className="absolute top-1 right-2 w-3.5 h-3.5 bg-emerald-500 rounded-full text-[7px] flex items-center justify-center text-white font-bold">{backendAuto.status.positions.length}</span>
                )}
                <span className={`text-base leading-none ${tab===t.id?"drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]":""}`}>{t.sym}</span>
                <span className="text-[9px] mt-0.5 font-semibold">{t.label}</span>
                {tab===t.id&&<div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-cyan-400 rounded-full shadow-[0_0_6px_rgba(34,211,238,0.8)]"/>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {MC()}
    </div>
  );
}
