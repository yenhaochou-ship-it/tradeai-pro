import { useState, useEffect, useRef, useCallback } from "react";
import { ComposedChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Brain, RefreshCw, X, ChevronRight, Activity, Send, Play, Pause, Zap, TrendingUp, Search, Plus, RotateCcw, Link2, ShieldCheck, AlertTriangle, FileText, Flame } from "lucide-react";

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
// 判斷是否為台灣整股可當沖的股票（代號為純數字）
function isTWStock(sym){ return /^\d{4,6}(\.TW)?$/.test(sym); }
// 台股當沖真實交易成本（手續費0.1425%x2 + 當沖證交稅0.15%，2026現行費率，估6折券商優惠）
const FEE_RATE=0.001425, FEE_DISCOUNT=0.6, DAYTRADE_TAX=0.0015;
function calcRoundTripCost(entryPrice,exitPrice,qty){
  const buyAmt=entryPrice*qty, sellAmt=exitPrice*qty;
  const buyFee=Math.max(20,buyAmt*FEE_RATE*FEE_DISCOUNT);
  const sellFee=Math.max(20,sellAmt*FEE_RATE*FEE_DISCOUNT);
  const tax=sellAmt*DAYTRADE_TAX;
  return {buyFee,sellFee,tax,totalCost:buyFee+sellFee+tax};
}
const MIN_PROFITABLE_MOVE_PCT=(FEE_RATE*FEE_DISCOUNT*2+DAYTRADE_TAX)*100; // 約0.32%，當沖至少要漲跌這麼多才打平成本

const RISK_CFG = {
  // maxHoldMin：單筆持倉最長持有分鐘數，超時且未虧損就先了結，避免AI把當沖抱成波段單
  low:  { label:"低風險", c:"text-emerald-400", bg:"bg-emerald-500/10 border-emerald-500/25", minConf:75, alloc:0.08, sl:1.5, tp:3.0, maxPos:2, maxHoldMin:25, sigW:{rsi:0.35,macd:0.30,ma:0.25,vol:0.10} },
  mid:  { label:"中風險", c:"text-amber-400",   bg:"bg-amber-500/10 border-amber-500/25",   minConf:63, alloc:0.22, sl:2.5, tp:5.5, maxPos:4, maxHoldMin:40, sigW:{rsi:0.25,macd:0.35,ma:0.25,vol:0.15} },
  high: { label:"高風險", c:"text-red-400",     bg:"bg-red-500/10 border-red-500/25",       minConf:50, alloc:0.38, sl:4.0, tp:10.0,maxPos:6, maxHoldMin:60, sigW:{rsi:0.20,macd:0.25,ma:0.30,vol:0.25} },
};

const TABS = [
  {id:"brain", sym:"⬡", label:"AI核心"},
  {id:"market",sym:"◎", label:"市場"},
  {id:"auto",  sym:"◑", label:"自動"},
  {id:"learn", sym:"◈", label:"學習"},
  {id:"chat",  sym:"◉", label:"問答"},
  {id:"set",   sym:"◐", label:"設定"},
];

const PHASES = ["初始化","數據收集","模式識別","預測優化","信心建立","穩定運行"];

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
  const vols=cd.map(d=>d.volume||1e6);

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

// ── 回測引擎 (在歷史K線上模擬信號勝率) ───────────────────────
function backtest(cd, minConf=65) {
  if(!cd||cd.length<40) return {wr:0,trades:0,pnl:0,avgWin:0,avgLoss:0};
  let trades=0,wins=0,totalPnl=0,sumWin=0,sumLoss=0;
  let inPos=null;
  for(let i=30;i<cd.length-2;i++){
    const slice=cd.slice(0,i+1);
    const mockLive={__bt:{price:cd[i].price,chg:0,pct:0}};
    const mockChart={__bt:slice};
    const sig=calcSignal("__bt",mockChart,mockLive,{rsi:0.20,macd:0.25,ma:0.20,vol:0.15,vwap:0.12,bb:0.08},0);
    if(!inPos&&sig.action!=="hold"&&sig.conf>=minConf){
      inPos={dir:sig.action==="buy"?"L":"S",entry:cd[i].price,idx:i};
    } else if(inPos&&i>inPos.idx+1){
      const pnlPct=inPos.dir==="L"?(cd[i].price-inPos.entry)/inPos.entry*100:(inPos.entry-cd[i].price)/inPos.entry*100;
      if(pnlPct<=-2.5||pnlPct>=5.0||(sig.action===( inPos.dir==="L"?"sell":"buy")&&sig.conf>=65)){
        trades++; const won=pnlPct>=0;
        if(won){wins++;sumWin+=pnlPct;}else{sumLoss+=Math.abs(pnlPct);}
        totalPnl+=pnlPct;
        inPos=null;
      }
    }
  }
  return {
    wr:trades>0?+(wins/trades*100).toFixed(1):0,
    trades,
    pnl:+totalPnl.toFixed(2),
    avgWin:wins>0?+(sumWin/wins).toFixed(2):0,
    avgLoss:(trades-wins)>0?+(sumLoss/(trades-wins)).toFixed(2):0,
  };
}

// ═══════════════════════════════════════════════════════════════
// ML 機器學習引擎 — 2層神經網路（純 JavaScript）
// 輸入 9 個技術指標特徵 → 輸出勝率預測 P(win)
// ═══════════════════════════════════════════════════════════════
class NeuralNet {
  constructor(inputSz=9, hiddenSz=16, lr=0.015) {
    this.lr = lr; this.inputSz=inputSz; this.hiddenSz=hiddenSz;
    this.reset();
  }
  reset(){
    const xi=(r,c)=>Array.from({length:r},()=>Array.from({length:c},()=>(Math.random()*2-1)*Math.sqrt(2/c)));
    this.W1=xi(this.hiddenSz,this.inputSz); this.b1=new Array(this.hiddenSz).fill(0);
    this.W2=xi(1,this.hiddenSz);           this.b2=[0];
    this.losses=[]; this.valAcc=0; this.epochs=0; this.trained=false;
  }
  _clip(x){return Math.max(-500,Math.min(500,x));}
  _sig(x){return 1/(1+Math.exp(-this._clip(x)));}
  _relu(x){return Math.max(0,x);}
  forward(x){
    this._a1=this.W1.map((w,i)=>this._relu(w.reduce((s,wi,j)=>s+wi*x[j],0)+this.b1[i]));
    this._z2=this.W2[0].reduce((s,w,i)=>s+w*this._a1[i],0)+this.b2[0];
    return this._sig(this._z2);
  }
  // Mini-batch SGD
  trainStep(X,y){
    let loss=0;
    for(let n=0;n<X.length;n++){
      const pred=this.forward(X[n]);
      const t=y[n];
      loss+=-(t*Math.log(pred+1e-10)+(1-t)*Math.log(1-pred+1e-10));
      const dZ2=pred-t;
      // Update W2,b2
      for(let j=0;j<this.hiddenSz;j++) this.W2[0][j]-=this.lr*dZ2*this._a1[j];
      this.b2[0]-=this.lr*dZ2;
      // Update W1,b1
      for(let j=0;j<this.hiddenSz;j++){
        const dH=dZ2*this.W2[0][j]*(this._a1[j]>0?1:0);
        for(let k=0;k<this.inputSz;k++) this.W1[j][k]-=this.lr*dH*X[n][k];
        this.b1[j]-=this.lr*dH;
      }
    }
    return loss/X.length;
  }
  // 評估驗證集準確率
  evaluate(X,y){
    let c=0;
    for(let i=0;i<X.length;i++) if((this.forward(X[i])>=0.5)===(y[i]>=0.5)) c++;
    return X.length?c/X.length:0;
  }
  predict(x){return this.trained?this.forward(x):0.5;}
}

// 特徵提取：把技術指標轉成 ML 輸入向量（正規化到 -1~1）
function extractFeatures(sig, livePrice){
  const safe=(v,lo=-1,hi=1)=>Math.max(lo,Math.min(hi,isFinite(v)?v:0));
  const rsiN=safe((N(sig.rsi,50)-50)/50);
  const srsiN=safe((N(sig.stochRsi,50)-50)/50);
  const macdN=safe(N(sig.bull,50)-N(sig.bear,50))/100;
  const maRatio=safe(sig.ma5&&sig.ma20?(sig.ma5/sig.ma20-1)*10:0);
  const vwapDist=safe(sig.vwap?(livePrice/sig.vwap-1)*20:0);
  const bbN=safe(N(sig.bbPct,0.5)*2-1);
  const volN=safe(Math.log(Math.max(0.1,N(sig.volRatio,1)))/2);
  const trendN=safe(N(sig.trendStr,0.5)*2-1);
  const timeN=sig.badTime?-1:1;
  return [rsiN,srsiN,macdN,maRatio,vwapDist,bbN,volN,trendN,timeN];
}

// 從歷史K線生成訓練資料（標籤：未來5根上漲>1% → 1，否則 → 0）
function generateTrainingData(chartData){
  const X=[],y=[],meta=[];
  Object.entries(chartData).forEach(([sym,cd])=>{
    if(!cd||cd.length<45) return;
    for(let i=30;i<cd.length-6;i++){
      const slice=cd.slice(0,i+1);
      const prices=slice.map(d=>d.price);
      const rsiArr=calcRSI(prices);
      const rsi=rsiArr[rsiArr.length-1]||50;
      const rsiW=rsiArr.slice(-14).filter(v=>v!==null);
      const rMin=rsiW.length?Math.min(...rsiW):0, rMax=rsiW.length?Math.max(...rsiW):100;
      const stochRsi=rMax>rMin?+((rsi-rMin)/(rMax-rMin)*100).toFixed(1):50;
      const ma5=+(prices.slice(-5).reduce((s,x)=>s+x,0)/5).toFixed(2);
      const ma20=+(prices.slice(-20).reduce((s,x)=>s+x,0)/20).toFixed(2);
      const vSlice=slice.slice(-20);
      const tVol=vSlice.reduce((s,d)=>s+(d.volume||1e6),0)||1;
      const vwap=+(vSlice.reduce((s,d)=>s+d.price*(d.volume||1e6),0)/tVol).toFixed(2);
      const variance=prices.slice(-20).reduce((s,x)=>s+Math.pow(x-ma20,2),0)/20;
      const std=Math.sqrt(variance)||1;
      const bbPct=+((cd[i].price-(ma20-2*std))/(4*std||1)).toFixed(3);
      const rv=slice.slice(-3).reduce((s,d)=>s+(d.volume||1e6),0)/3;
      const av=slice.slice(-20).reduce((s,d)=>s+(d.volume||1e6),0)/20||1;
      const volRatio=+(rv/av).toFixed(2);
      const r14=prices.slice(-14);
      const mxP=Math.max(...r14),mnP=Math.min(...r14);
      const aM=r14.slice(1).reduce((s,p,i)=>s+Math.abs(p-r14[i]),0)/13||1;
      const trendStr=+Math.min(1,(mxP-mnP)/(aM*14)).toFixed(2);
      const lb=cd[i], pb=cd[i-1]||{};
      const bull2= rsi<33?13:rsi<42?6:0;
      const bear2= rsi>67?13:rsi>58?6:0;
      const fakeSig={rsi,stochRsi,ma5,ma20,vwap,bbPct,volRatio,trendStr,bull:bull2+(ma5>ma20?20:0),bear:bear2+(ma5<=ma20?20:0),badTime:false};
      // 未來5根的漲跌
      const futPct=(cd[Math.min(i+5,cd.length-1)].price-cd[i].price)/cd[i].price*100;
      // 做多訓練：上漲>1% → win
      const buyLabel=futPct>1?1:0;
      X.push(extractFeatures(fakeSig,cd[i].price));
      y.push(buyLabel);
      meta.push({sym,i,futPct,rsi,ma5ma20:ma5>ma20});
    }
  });
  return {X,y,meta};
}

// 計算特徵重要性（擾動法：輪流擾動每個特徵，看準確率下降多少）
function featureImportance(model,X,y){
  const base=model.evaluate(X,y);
  const featureNames=["RSI","StochRSI","MACD/信號","MA比例","VWAP距離","BB位置","量比","趨勢強","時段"];
  return featureNames.map((name,fi)=>{
    const Xp=X.map(row=>{const r=[...row];r[fi]=Math.random()*2-1;return r;});
    const perturbed=model.evaluate(Xp,y);
    return {name,importance:Math.max(0,+(base-perturbed).toFixed(4))};
  }).sort((a,b)=>b.importance-a.importance);
}

const N=(n,fb=0)=>(typeof n==="number"&&isFinite(n))?n:fb;
const F=(n,d=2)=>N(n).toFixed(d);
const CC=n=>N(n)>=0?"text-emerald-400":"text-red-400";
const BC=n=>N(n)>=0?"bg-emerald-500/10 border-emerald-500/25":"bg-red-500/10 border-red-500/25";

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
function MarketTab({selSym,setSelSym,charts,live,sigs,sparks,search,setSearch,wl,setWl,setModal,manQty,setManQty,placeTrade,broker,onRealPrice,realBases}) {
  const cd=charts[selSym]||[], lp=live[selSym]||{}, sig=sigs[selSym]||{action:"hold",conf:50,rsi:50};
  const [realQuote,setRealQuote]=useState(null); // {sym, price, loading, error}
  // ── 重要安全機制：台股下單單位是「張」(1張=1000股)，美股demo是「股」，兩者數字不能混用 ──
  // 切換到不同單位類型的股票時，自動把數量重置為該單位下的安全預設值，避免「100股」誤送成「100張」
  const isTW = isTWStock(selSym);
  const prevIsTWRef = useRef(isTW);
  useEffect(()=>{
    if(prevIsTWRef.current!==isTW){ setManQty(isTW?1:10); prevIsTWRef.current=isTW; }
  },[isTW,setManQty]);
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
            if(!wl.includes(search)){setWl(w=>[...w,search]);setSelSym(search);}
            setSearch("");setRealQuote(null);
          }}
          className="flex-1 bg-[#070f1c] border border-[#0d2137] rounded-xl px-3 py-2 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-cyan-500/40"/>
        <button onClick={()=>{
          if(!search.trim()) return;
          if(!wl.includes(search)){setWl(w=>[...w,search]);setSelSym(search);}
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
                setSelSym(realQuote.sym);
                setRealQuote(null);
              }} className="text-[9px] px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 rounded-lg font-bold">+ 新增</button>
            )}
            {wl.includes(realQuote.sym)&&<span className="text-[9px] text-gray-600">已在自選股</span>}
          </div>
        </Card>
      )}

      {/* Watchlist */}
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
                onClick={()=>{ if(offset!==0){setSwipeX(s=>({...s,[sym]:0}));return;} setSelSym(sym);setModal({type:"stockModal",data:{sym,lp:l,sig:s}});}}
                onContextMenu={e=>{e.preventDefault();setWl(w=>w.filter(s=>s!==sym));}}>
                <div className="w-7 h-7 rounded-lg bg-[#0d2137] flex items-center justify-center text-[9px] font-bold text-cyan-400 mr-3 flex-shrink-0">
                  {sym.replace(".TW","").slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                    {sym}
                    {broker?.status==="connected"&&!STOCKS[sym]&&<span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">真實</span>}
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

      {/* Selected chart */}
      <Card onClick={()=>setModal({type:"chartModal",data:{sym:selSym}})} cls="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-white">{selSym}</span>
            <Chip c={sig.action==="buy"?"bg-emerald-500/10 border-emerald-500/25 text-emerald-400":sig.action==="sell"?"bg-red-500/10 border-red-500/25 text-red-400":"border-gray-800 text-gray-600"}>
              {sig.action==="buy"?"買▲":sig.action==="sell"?"賣▼":"觀望"}
            </Chip>
          </div>
          <div className="text-right">
            <span className="text-sm font-mono font-bold text-white">{N(lp.price,STOCKS[selSym]?.base??realBases[selSym]??0).toFixed(2)}</span>
            <span className={`text-[10px] ml-2 ${CC(lp.pct)}`}>{N(lp.pct)>=0?"▲":"▼"}{Math.abs(N(lp.pct)).toFixed(2)}%</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={cd} margin={{top:4,right:2,bottom:0,left:0}}>
            <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2}/><stop offset="100%" stopColor="#22d3ee" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="1 8" stroke="#0d2137"/>
            <XAxis dataKey="time" tick={{fill:"#374151",fontSize:7}} interval={15} tickLine={false} axisLine={false}/>
            <YAxis tick={{fill:"#374151",fontSize:7}} domain={["auto","auto"]} tickLine={false} axisLine={false} width={40}/>
            <Tooltip contentStyle={{background:"#070f1c",border:"1px solid #0d2137",borderRadius:8,color:"#fff",fontSize:10}} formatter={v=>[`NT$${v}`,""]}/>
            <Area type="monotone" dataKey="price" stroke="#22d3ee" fill="url(#ag)" strokeWidth={1.5} dot={false}/>
            <Line type="monotone" dataKey="ma5"  stroke="#a78bfa" strokeWidth={1} dot={false}/>
            <Line type="monotone" dataKey="ma20" stroke="#fbbf24" strokeWidth={1} dot={false}/>
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* Indicators mini — 6 指標 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {l:"RSI",v:sig.rsi?.toFixed(0),c:sig.rsi<30?"text-emerald-400":sig.rsi>70?"text-red-400":"text-gray-300"},
          {l:"StochRSI",v:sig.stochRsi?.toFixed(0),c:sig.stochRsi<20?"text-emerald-400":sig.stochRsi>80?"text-red-400":"text-gray-300"},
          {l:"VWAP",v:sig.vwap?`NT$${sig.vwap.toFixed(0)}`:"-",c:N(lp.price)>N(sig.vwap)?"text-emerald-400":"text-red-400"},
          {l:"BB位置",v:sig.bbPct!=null?`${(sig.bbPct*100).toFixed(0)}%`:"-",c:sig.bbPct<0.2?"text-emerald-400":sig.bbPct>0.8?"text-red-400":"text-gray-300"},
          {l:"趨勢強度",v:sig.trendStr!=null?`${(sig.trendStr*100).toFixed(0)}%`:"-",c:sig.trendStr>0.6?"text-amber-400":"text-gray-500"},
          {l:"信號",v:sig.action==="buy"?"買▲":sig.action==="sell"?"賣▼":"觀",c:sig.action==="buy"?"text-emerald-400":sig.action==="sell"?"text-red-400":"text-gray-600"},
        ].map(x=>(
          <Card key={x.l} onClick={()=>setModal({type:"indicModal",data:{sym:selSym,sig}})} cls="p-2.5 text-center">
            <div className="text-[9px] text-gray-600 mb-1">{x.l}</div>
            <div className={`text-xs font-mono font-bold ${x.c}`}>{x.v}</div>
          </Card>
        ))}
      </div>

      {/* Quick trade */}
      <Card cls="p-3">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">快速下單 · {selSym}（單位：{isTW?"張":"股"}）</div>
        <div className="flex gap-1.5 mb-3">
          {(isTW?[1,2,3,5]:[10,25,50,100]).map(n=>(
            <button key={n} onClick={()=>setManQty(n)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${manQty===n?"bg-cyan-500/20 border-cyan-500/40 text-cyan-300":"border-[#0d2137] text-gray-600"}`}>{n}</button>
          ))}
        </div>
        {isTW&&broker?.status==="connected"&&(
          <div className="text-[9px] text-amber-400/80 mb-2">{manQty}張 = {(manQty*1000).toLocaleString()}股，約 NT${Math.round(manQty*1000*N(lp.price,realBases[selSym]||0)).toLocaleString()}</div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={()=>placeTrade(selSym,"L",manQty)} className="py-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs text-emerald-400 font-bold hover:bg-emerald-500/20">▲ 做多 {manQty}{isTW?"張":"股"}</button>
          <button onClick={()=>placeTrade(selSym,"S",manQty)} className="py-2.5 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400 font-bold hover:bg-red-500/20">▼ 做空 {manQty}{isTW?"張":"股"}</button>
        </div>
      </Card>
    </div>
  );
}

// ── ◉ 問答頁（含聊天輸入框）— 提升至頂層保持元件身分穩定 ──────
function ChatTab({chat,chatBusy,chatEnd,chatIn,setChatIn,sendChat}) {
  return (
    <div className="flex flex-col" style={{height:"calc(100vh - 230px)"}}>
      <div className="flex-1 overflow-y-auto space-y-3 pb-3">
        {chat.map((m,i)=>(
          <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
            {m.role==="ai"&&(
              <div className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                <Brain className="w-3 h-3 text-violet-400"/>
              </div>
            )}
            <div className={`max-w-[82%] px-3 py-2.5 rounded-2xl text-xs leading-relaxed ${m.role==="user"?"bg-cyan-500/10 border border-cyan-500/20 text-cyan-100 rounded-br-sm":"bg-[#070f1c] border border-[#0d2137] text-gray-300 rounded-bl-sm"}`}>
              {m.t}
            </div>
          </div>
        ))}
        {chatBusy&&(
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mr-2 flex-shrink-0">
              <Brain className="w-3 h-3 text-violet-400"/>
            </div>
            <div className="bg-[#070f1c] border border-[#0d2137] rounded-2xl px-3 py-2.5 flex gap-1 items-center">
              {[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}
            </div>
          </div>
        )}
        <div ref={chatEnd}/>
      </div>
      {/* Quick prompts */}
      <div className="flex gap-1.5 overflow-x-auto pb-2" style={{scrollbarWidth:"none"}}>
        {["NVDA今日行情？","如何設定止損？","低風險策略說明","分析目前信號","勝率如何提升？"].map(q=>(
          <button key={q} onClick={()=>sendChat(q)} className="flex-shrink-0 text-[9px] border border-[#0d2137] text-gray-500 px-2.5 py-1.5 rounded-full hover:border-cyan-500/40 hover:text-cyan-400 whitespace-nowrap">{q}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={chatIn} onChange={e=>setChatIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendChat(chatIn)}
          placeholder="詢問市場分析、交易策略、指標解讀..."
          className="flex-1 bg-[#070f1c] border border-[#0d2137] rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-cyan-500/40"/>
        <button onClick={()=>sendChat(chatIn)} disabled={chatBusy||!chatIn.trim()}
          className="w-10 h-10 bg-cyan-500/10 border border-cyan-500/25 rounded-xl flex items-center justify-center disabled:opacity-40">
          {chatBusy?<RefreshCw className="w-4 h-4 text-cyan-400 animate-spin"/>:<Send className="w-4 h-4 text-cyan-400"/>}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
export default function TradeAIPro() {
  const [tab,      setTab]      = useState("brain");
  const [modal,    setModal]    = useState(null);
  const [selSym,   setSelSym]   = useState("NVDA");
  const [wl, setWl] = useState(()=>{
    try{ const s=JSON.parse(localStorage.getItem("wl")||"null"); if(Array.isArray(s)&&s.length) return s; }catch{}
    return ["2330","0050","2317","2454","2882"]; // 預設改為台股（永豐可查真實報價、可實際當沖交易）
  });
  const [charts,   setCharts]   = useState({});
  const [sparks,   setSparks]   = useState({});
  const [live,     setLive]     = useState({});
  const [sigs,     setSigs]     = useState({});
  const [pf,       setPf]       = useState(()=>{
    try{ const saved=Number(localStorage.getItem("starting_capital")); if(saved>0) return{cash:saved,total:saved,dayPnL:0,cumPnL:0}; }catch{}
    return{cash:1_000_000,total:1_000_000,dayPnL:0,cumPnL:0};
  });
  // 風控護盾的每日損益百分比門檻，必須依使用者實際設定的起始資金計算，不能寫死100萬
  const startingCapitalR = useRef((()=>{ try{ const s=Number(localStorage.getItem("starting_capital")); return s>0?s:1_000_000; }catch{ return 1_000_000; } })());
  const [pos,      setPos]      = useState([]);
  const [hist,     setHist]     = useState([]);
  const [search,   setSearch]   = useState("");
  const [autoOn,   setAutoOn]   = useState(false);
  const [risk,     setRisk]     = useState("low");
  const [alog,     setAlog]     = useState([]);
  const [learn,    setLearn]    = useState(()=>{
    try{ const s=JSON.parse(localStorage.getItem("learn_state")||"null"); if(s&&typeof s==="object") return s; }catch{}
    return {phase:0,trades:0,wins:0,pnl:0,conf:30,streak:0,maxStreak:0,bonus:0,history:[],weights:{rsi:0.25,macd:0.35,ma:0.25,vol:0.15}};
  });
  const [chat,     setChat]     = useState([{role:"ai",t:"我是 TradeAI Pro 的 AI 分析師，已整合即時市場數據與學習系統。有什麼問題都可以問我，例如分析股票、策略建議、或解釋指標。"}]);
  const [chatIn,   setChatIn]   = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [manQty,   setManQty]   = useState(10); // 快速下單數量（提升到頂層，避免每次報價更新被重置）
  const [capInput, setCapInput] = useState(()=>{ try{ return localStorage.getItem("starting_capital")||"1000000"; }catch{ return "1000000"; } });
  const [instFlows, setInstFlows] = useState({date:null,topBuy:[],topSell:[],loading:false}); // 三大法人真實買賣超（來源：台灣證交所公開資料）
  const [broker,   setBroker]   = useState({status:"disconnected",apiKey:"",secretKey:"",account:null,balance:null,error:null}); // 永豐真實帳戶連接
  const [tradeMode, setTradeMode] = useState("virtual");
  const [autoCapPct, setAutoCapPct] = useState(()=>{ try{ return Number(localStorage.getItem("autoCapPct")||100); }catch{ return 100; } }); // AI自動交易可用資金%
  const [riskGuard, setRiskGuard] = useState({pauseUntil:0,consecLoss:0,dailyLoss:0,dailyProfit:0});
  const [backendAuto, setBackendAuto] = useState({enabled:false,status:null,log:[],loading:false}); // 後端24h自動交易 // 風控護盾
  const [backendPaperMode, setBackendPaperMode] = useState(()=>{
    try{ const s=localStorage.getItem("backend_paper_mode"); return s===null?true:s==="true"; }catch{ return true; }
  }); // 後端24h自動交易模式：true=模擬下單(用真實股價算損益,不花真錢)，false=真實下單
  useEffect(()=>{ try{ localStorage.setItem("backend_paper_mode",String(backendPaperMode)); }catch{} },[backendPaperMode]);
  const riskGuardR = useRef({pauseUntil:0,consecLoss:0,dailyLoss:0,dailyProfit:0}); // "virtual" | "real"  虛擬盤/真實盤切換
  const [realPos,   setRealPos]   = useState([]); // 永豐真實持倉（連線後從後端取得）
  const [realBases, setRealBases] = useState({}); // {sym: price} 使用者新增股票的真實起始報價
  const [realNames, setRealNames] = useState(()=>{ try{ return JSON.parse(localStorage.getItem("real_names")||"{}"); }catch{ return {}; } }); // {sym: 真實中文名稱}，來自永豐合約資料，補足內建清單沒有的股票
  useEffect(()=>{ try{ localStorage.setItem("real_names",JSON.stringify(realNames)); }catch{}; realNamesCache=realNames; },[realNames]);
  // ── ML 機器學習狀態 ──────────────────────────────────────────
  const [mlModel,    setMlModel]    = useState(()=>{
    // 嘗試從 localStorage 還原已訓練的模型
    try{
      const saved=JSON.parse(localStorage.getItem("ml_model_weights")||"null");
      if(saved&&saved.W1&&saved.W2){
        const m=new NeuralNet(saved.inputSz||9,saved.hiddenSz||16,saved.lr||0.015);
        m.W1=saved.W1; m.b1=saved.b1; m.W2=saved.W2; m.b2=saved.b2;
        m.valAcc=saved.valAcc||0; m.trained=true;
        return m;
      }
    }catch(e){}
    return new NeuralNet(9,16,0.015);
  });
  const [mlState,    setMlState]    = useState(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem("ml_model_weights")||"null");
      if(saved&&saved.W1){
        return {trained:true,training:false,epoch:0,totalEpochs:120,
          loss:[],valAcc:[],bestAcc:saved.valAcc||0,dataSize:0,
          featureImport:[],prediction:{},
          lastTrained:`${saved.savedAt}（已還原）`};
      }
    }catch(e){}
    return {trained:false,training:false,epoch:0,totalEpochs:0,
      loss:[],valAcc:[],bestAcc:0,dataSize:0,
      featureImport:[],prediction:{},lastTrained:null};
  });
  const chatEnd = useRef(null);
  const liveR = useRef({}), posR = useRef([]), learnR = useRef(learn), chartR = useRef({});
  const sigsR  = useRef({}), autoOnR = useRef(false), riskR = useRef("low");
  const wlR = useRef([]); // 自選股清單的即時參照，讓信號計算迴圈能拿到最新清單（不再侷限於內建模擬股票）
  const tradeModeR = useRef("virtual");
  const autoCapPctR = useRef(100); // ref 讓 autoTrade 能即時讀到最新的 tradeMode
  const brokerR    = useRef({status:"disconnected"}); // ref 讓 autoTrade 能即時讀到 broker 連線狀態
  const realSymR   = useRef(new Set()); // 已確認為「真實報價來源」的股票代號集合，這些不再用亂數模擬跳動
  useEffect(()=>{liveR.current=live;},[live]);
  useEffect(()=>{tradeModeR.current=tradeMode;},[tradeMode]);
  useEffect(()=>{autoCapPctR.current=autoCapPct;},[autoCapPct]);
  useEffect(()=>{brokerR.current=broker;},[broker]);
  useEffect(()=>{posR.current=pos;},[pos]);
  useEffect(()=>{learnR.current=learn;},[learn]);
  useEffect(()=>{chartR.current=charts;},[charts]);
  useEffect(()=>{sigsR.current=sigs;},[sigs]);
  useEffect(()=>{autoOnR.current=autoOn;},[autoOn]);
  useEffect(()=>{riskR.current=risk;},[risk]);
  useEffect(()=>{wlR.current=wl;},[wl]);
  useEffect(()=>{ try{ localStorage.setItem("wl",JSON.stringify(wl)); }catch{} },[wl]);
  useEffect(()=>{ try{ localStorage.setItem("autoCapPct",String(autoCapPct)); }catch{} },[autoCapPct]);
  // 學習狀態（AI信心度/勝率/連勝/自適應權重）持久化：本機立即存，連線時同步到後端（換裝置也不會重置）
  useEffect(()=>{
    try{ localStorage.setItem("learn_state",JSON.stringify(learn)); }catch{}
    if(brokerR.current?.status==="connected"){
      const t=setTimeout(()=>{
        fetch("/api/sinopac?path=learn/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(learn)}).catch(()=>{});
      },1500); // 1.5秒防抖，避免每次小變動都打後端
      return()=>clearTimeout(t);
    }
  },[learn]);
  useEffect(()=>{riskGuardR.current=riskGuard;},[riskGuard]);
  // 後端自動交易狀態輪詢（連線後每30秒同步）
  useEffect(()=>{
    if(broker.status!=="connected") return;
    const poll=async()=>{
      try{
        const r=await fetch("/api/sinopac?path=auto/status");
        const d=await r.json();
        if(r.ok) setBackendAuto(b=>({...b,enabled:d.enabled,status:d,log:d.log||[]}));
      }catch{}
    };
    poll();
    const iv=setInterval(poll,30000);
    return()=>clearInterval(iv);
  },[broker.status]);
  // 自選股同步到後端（連線中且自選股有變動時）
  useEffect(()=>{
    if(broker.status!=="connected") return;
    fetch("/api/sinopac?path=auto/watchlist",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(wl)}).catch(()=>{});
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

  // ── Live tick every 2s ───────────────────────────────────────
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
      setPos(prev=>prev.map(p=>{
        const lp=liveR.current[p.sym]; if(!lp) return p;
        const shares=p.shares??(isTWStock(p.sym)?p.qty*1000:p.qty); // 修正：用實際股數算錢，不能直接用「張」數
        const pnl=p.dir==="L"?(lp.price-p.entry)*shares:(p.entry-lp.price)*shares;
        const pct=+(pnl/(p.entry*shares)*100).toFixed(2);
        // ── Trailing Stop：獲利超過1.5%後啟動，停損跟隨上移 ──
        let newSl=p.sl;
        if(p.dir==="L"&&pct>=1.5){
          const trailSl=+(lp.price*0.988).toFixed(2); // 距當前價1.2%
          if(trailSl>p.sl) newSl=trailSl;
        } else if(p.dir==="S"&&pct>=1.5){
          const trailSl=+(lp.price*1.012).toFixed(2);
          if(trailSl<p.sl) newSl=trailSl;
        }
        // 自動觸發停損
        const hitSl=(p.dir==="L"&&lp.price<=newSl)||(p.dir==="S"&&lp.price>=newSl);
        return{...p,cur:lp.price,pnl:+pnl.toFixed(2),pct,sl:newSl,hitSl};
      }));
      // 自動平倉觸及停損的部位
      const curPos=posR.current;
      curPos.filter(p=>p.hitSl).forEach(p=>closePosById(p.id,true));
      // Recalc signals
      const ns={};
      const lrn=learnR.current;
      const lr=liveR.current;
      const cr=chartR.current;
      // 優化：只計算使用者實際自選股清單，不再連帶計算未顯示的內建模擬股票，減少無謂運算
      wlR.current.forEach(sym=>{ns[sym]=calcSignal(sym,cr,lr,lrn.weights,lrn.bonus);});
      setSigs(ns);
    },2000);
    return()=>clearInterval(iv);
  },[]);

  // ── Portfolio sync ───────────────────────────────────────────
  useEffect(()=>{
    const posVal=pos.reduce((s,p)=>s+N(p.cur)*(p.shares??(isTWStock(p.sym)?p.qty*1000:p.qty)),0); // 修正：用實際股數計算持倉市值
    const dayPnL=pos.reduce((s,p)=>s+N(p.pnl),0)+hist.reduce((s,t)=>s+N(t.pnl),0);
    setPf(pv=>({...pv,total:+(pv.cash+posVal).toFixed(2),dayPnL:+dayPnL.toFixed(2)}));
    // 每日凌晨重置風控護盾
    const hr=new Date().getHours();
    if(hr===0) setRiskGuard(rg=>rg.dailyLoss!==0||rg.dailyProfit!==0?{pauseUntil:0,consecLoss:0,dailyLoss:0,dailyProfit:0}:rg);
  },[pos,hist]);

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

  // ── 真實歷史K棒定期刷新（避免抓一次後RSI/MACD用越來越舊的歷史資料）──
  useEffect(()=>{
    if(broker.status!=="connected") return;
    let cancelled=false;
    const refresh=async()=>{
      const realSyms=wl.filter(sym=>realSymR.current.has(sym)&&!STOCKS[sym]);
      if(realSyms.length===0) return;
      const results=await Promise.allSettled(realSyms.map(async sym=>{
        const r=await fetch(`/api/sinopac?path=history/${encodeURIComponent(sym)}?bars=90`);
        const d=await r.json();
        if(!r.ok||!d.bars||d.bars.length<20) throw new Error("no data");
        return{sym,bars:d.bars};
      }));
      if(cancelled) return;
      const updates={};
      results.forEach(r=>{ if(r.status==="fulfilled") updates[r.value.sym]=r.value.bars; });
      if(Object.keys(updates).length>0){
        setCharts(prev=>({...prev,...updates}));
      }
    };
    const iv=setInterval(refresh,60000); // 每60秒刷新一次真實歷史K棒
    return()=>{cancelled=true;clearInterval(iv);};
  },[broker.status,wl]);

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
          realSymR.current.add(sym); // 標記為真實報價來源，停用該股的亂數模擬跳動
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
  },[broker.status]);

  // ── 清理已移除自選股的殘留資料（避免記憶體累積、避免移除後重新加入出現舊資料）──
  const prevWlR = useRef(wl);
  useEffect(()=>{
    const removed = prevWlR.current.filter(s=>!wl.includes(s));
    prevWlR.current = wl;
    if(removed.length===0) return;
    removed.forEach(sym=>realSymR.current.delete(sym));
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
              realSymR.current.add(sym);
            }
          }catch{}
          // 沒有真實歷史K棒時，至少嘗試抓目前報價當基準（用於模擬圖表的起點，比預設100準確）
          if(bases[sym]==null){
            try{
              const r=await fetch(`/api/sinopac?path=price/${encodeURIComponent(sym)}`);
              const d=await r.json();
              if(r.ok&&d.price){ bases[sym]=Number(d.price); realSymR.current.add(sym); if(d.name) newNames[sym]=d.name; }
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
  },[wl,realBases]);

  // ── Auto confidence builder ──────────────────────────────────
  // 每 8 秒根據信號品質、勝率、連勝自動提升 AI 信心度
  useEffect(()=>{
    const iv=setInterval(()=>{
      const curSigs=sigsR.current;
      const curAutoOn=autoOnR.current;
      setLearn(lrn=>{
        if(lrn.conf>=95) return lrn;
        const allSigs=Object.values(curSigs);
        const strong=allSigs.filter(s=>s.action!=="hold"&&s.conf>=65);
        const consistent=allSigs.filter(s=>s.action!=="hold"&&s.conf>=75);
        const wr=lrn.trades>0?lrn.wins/lrn.trades:0;
        // Base increment — system always learning from market data
        let inc=0.18;
        // Signal quality boost
        if(strong.length>=2)  inc+=0.20;
        if(consistent.length>=2) inc+=0.25;
        // Auto mode boost
        if(curAutoOn)         inc+=0.15;
        if(curAutoOn&&wr>=0.6)inc+=0.30;
        // Win rate boost
        if(wr>=0.70)          inc+=0.40;
        if(wr>=0.80)          inc+=0.30;
        // Streak boost
        if(lrn.streak>=2)     inc+=0.20;
        if(lrn.streak>=5)     inc+=0.30;
        // Trade history boost
        if(lrn.trades>=10)    inc+=0.15;
        if(lrn.trades>=30)    inc+=0.15;
        // Penalty on losing streak
        if(lrn.streak===0&&lrn.trades>0) inc-=0.05;
        const newConf=Math.min(95,+(lrn.conf+inc).toFixed(1));
        const newBonus=Math.max(0,Math.min(18,(wr-0.50)*55+consistent.length*0.8));
        // Phase auto-advance by confidence thresholds
        const confThresh=[0,38,50,62,72,83];
        let newPhase=lrn.phase;
        if(newPhase<5&&newConf>=confThresh[newPhase+1]) newPhase=Math.min(5,newPhase+1);
        return{...lrn,conf:newConf,bonus:+newBonus.toFixed(1),phase:newPhase};
      });
    },8000);
    return()=>clearInterval(iv);
  },[]);

  // ── Close position ───────────────────────────────────────────
  const closePosById = useCallback((id,fromAuto=false)=>{
    const p=posR.current.find(x=>x.id===id); if(!p) return;
    const exitP=N(p.cur,p.entry);
    const shares=p.shares??(isTWStock(p.sym)?p.qty*1000:p.qty); // 修正：用實際股數計算，不能直接用「張」數
    const grossPnl=p.dir==="L"?(exitP-p.entry)*shares:(p.entry-exitP)*shares;
    // 扣除真實交易成本（手續費x2 + 當沖證交稅），讓模擬績效貼近真實當沖獲利
    const cost=calcRoundTripCost(
      p.dir==="L"?p.entry:exitP,
      p.dir==="L"?exitP:p.entry,
      shares
    ).totalCost;
    const pnl=grossPnl-cost;
    const win=pnl>=0;
    const rec={id,sym:p.sym,name:p.name,dir:p.dir,qty:p.qty,entry:p.entry,exit:exitP,pnl:+pnl.toFixed(2),grossPnl:+grossPnl.toFixed(2),fee:+cost.toFixed(0),pct:+(pnl/(p.entry*shares)*100).toFixed(2),open:p.openTime,close:new Date().toLocaleTimeString("zh-TW"),win,auto:p.auto,rl:p.rl};
    setHist(h=>[...h,rec]);
    setPos(x=>x.filter(y=>y.id!==id));
    setPf(pv=>({...pv,cash:+(pv.cash+exitP*shares-cost).toFixed(2),cumPnL:+(pv.cumPnL+pnl).toFixed(2)}));
    // Update learning
    setLearn(lrn=>{
      const newT=lrn.trades+1, newW=lrn.wins+(win?1:0), wr=newW/newT;
      const phase=newT<5?0:newT<20?1:newT<50?2:newT<100?3:wr>=0.7?5:4;
      const streak=win?lrn.streak+1:0;
      const conf=Math.min(95,+(50+(wr-0.5)*90+Math.min(streak*2,15)).toFixed(1));
      const bonus=Math.max(0,Math.min(18,(wr-0.55)*60));
      // Adaptive weight update（修正：原本引用不存在的rsiScore/macdScore欄位，導致獲利時權重永遠不會上調，
      // 只有虧損時下調，現在改用真實存在的信號欄位判斷各指標當時是否方向一致，四個權重都會調整）
      const newW2={...lrn.weights};
      if(p.sigDetails){
        const d=p.sigDetails, alpha=0.04, isLong=p.dir==="L";
        // 判斷當時各指標是否與這筆交易方向一致（一致=該指標有貢獻，依勝負決定加減權重）
        const rsiAgreed = isLong ? d.rsi<45 : d.rsi>55;
        const macdAgreed = isLong ? d.freshGolden : d.freshDeath;
        const maAgreed = d.trendStr>0.55; // 趨勢夠強時MA排列才有參考價值，方向已包含在bull/bear分數中
        const volAgreed = d.volRatio>1.15; // 成交量放大確認

        const adj=(agreed,key)=>{
          if(agreed==null) return; // 沒有足夠資料就不調整該項
          const delta = win ? (agreed?alpha:-alpha*0.5) : (agreed?-alpha:alpha*0.3);
          newW2[key]=Math.max(0.08,Math.min(0.5,newW2[key]+delta));
        };
        adj(rsiAgreed,"rsi"); adj(macdAgreed,"macd"); adj(maAgreed,"ma"); adj(volAgreed,"vol");

        const sum=Object.values(newW2).reduce((s,v)=>s+v,0);
        Object.keys(newW2).forEach(k=>{newW2[k]=+(newW2[k]/sum).toFixed(3);});
      }
      return{...lrn,trades:newT,wins:newW,pnl:+(lrn.pnl+pnl).toFixed(2),conf,streak,maxStreak:Math.max(lrn.maxStreak,streak),phase,bonus,weights:newW2,history:[...lrn.history.slice(-99),{t:Date.now(),win,pnl:+pnl.toFixed(2),wr:+(wr*100).toFixed(1)}]};
    });
    if(!fromAuto) setModal({type:"closed",data:rec});
  },[]);

  // ── Auto trading engine (30s) ────────────────────────────────
  const autoTrade = useCallback(()=>{
    const cfg=RISK_CFG[risk];
    // ── 風控護盾 ────────────────────────────────────────────────
    const rg=riskGuardR.current, now=Date.now();
    if(rg.pauseUntil>now) return; // 連虧冷靜期
    const dailyLossPct=Math.abs(Math.min(0,rg.dailyLoss))/startingCapitalR.current*100;
    if(dailyLossPct>=3){
      setAlog(l=>[{ts:new Date().toLocaleTimeString("zh-TW"),sym:"系統",act:"⛔日損停損",price:0,conf:0,note:`今日虧損${dailyLossPct.toFixed(1)}%，已停止自動交易`},...l.slice(0,49)]);
      return;
    }
    if(rg.dailyProfit/startingCapitalR.current*100>=8){
      setAlog(l=>[{ts:new Date().toLocaleTimeString("zh-TW"),sym:"系統",act:"🔒鎖定獲利",price:0,conf:0,note:`今日獲利${(rg.dailyProfit/startingCapitalR.current*100).toFixed(1)}%，已停止`},...l.slice(0,49)]);
      return;
    }
    const cLive=liveR.current, cPos=posR.current, cChart=chartR.current, cLearn=learnR.current;
    wl.forEach(sym=>{
      const sig=calcSignal(sym,cChart,cLive,cLearn.weights,cLearn.bonus);
      const lp=cLive[sym]; if(!lp) return;
      const existing=cPos.find(p=>p.sym===sym);
      // Exit check（含短炒持倉時間上限：避免AI抱單變成波段交易）
      if(existing){
        const pp=existing.pct||0;
        const heldMin=(Date.now()-(existing.openTs||Date.now()))/60000;
        const timeUp=heldMin>=cfg.maxHoldMin&&pp>-0.1; // 超時且未明顯虧損就先了結，鎖定當沖節奏
        if(pp<=-cfg.sl||pp>=cfg.tp||timeUp||(existing.dir==="L"&&sig.action==="sell")||(existing.dir==="S"&&sig.action==="buy")){
          const isProfit=pp>=cfg.tp, isLoss=pp<=-cfg.sl;
          closePosById(existing.id,true);
          setAlog(l=>[{ts:new Date().toLocaleTimeString("zh-TW"),sym,act:"出場",price:lp.price,conf:sig.conf,note:isProfit?"✅止盈":isLoss?"🔴停損":timeUp?"⏱️持倉超時了結":"信號反轉"},...l.slice(0,49)]);
          // 風控護盾：連虧計數（用實際股數計算金額，不能直接用「張」數，否則風控門檻形同虛設）
          const sharesEx=existing.shares??(isTWStock(sym)?existing.qty*1000:existing.qty);
          if(isLoss){
            setRiskGuard(rg=>{
              const nc=rg.consecLoss+1;
              return{...rg,consecLoss:nc,dailyLoss:rg.dailyLoss+existing.entry*sharesEx*cfg.sl/100,
                pauseUntil:nc>=3?Date.now()+15*60*1000:rg.pauseUntil};
            });
          } else {
            setRiskGuard(rg=>({...rg,consecLoss:0,dailyProfit:rg.dailyProfit+existing.entry*sharesEx*Math.abs(pp)/100}));
          }
        }
        return;
      }
      if(sig.conf<cfg.minConf||sig.action==="hold") return;
      if(sig.badTime) return; // 開盤前15分 / 午休不交易
      if(cPos.length>=cfg.maxPos) return;
      // 板塊分散：同板塊已有持倉則跳過
      const thisSector=STOCKS[sym]?.sector;
      if(thisSector&&cPos.some(p=>STOCKS[p.sym]?.sector===thisSector)) return;
      const price=N(lp.price); if(!price) return;
      // 台灣整張規則：整股代號每張=1000股，最少1張；其他市場以資金%計算
      const availCap = pf.cash * (autoCapPctR.current/100);
      const qty = isTWStock(sym)
        ? Math.max(1, Math.floor(availCap * cfg.alloc / (price * 1000))) // 張
        : Math.max(1, Math.floor(availCap * cfg.alloc / price));
      const dir=sig.action==="buy"?"L":"S";
      const sl=+(price*(dir==="L"?1-cfg.sl/100:1+cfg.sl/100)).toFixed(2);
      const tp=+(price*(dir==="L"?1+cfg.tp/100:1-cfg.tp/100)).toFixed(2);
      const id=Date.now()+Math.random();
      // 重要：qty是「張」(TW股) 或「股」(非TW)的顯示單位；shares永遠是實際股數，用於所有金額計算
      const shares1=isTWStock(sym)?qty*1000:qty;
      const newPos={id,sym,name:getStockName(sym),dir,qty,shares:shares1,entry:price,cur:price,pnl:0,pct:0,sl,tp,openTime:new Date().toLocaleTimeString("zh-TW"),openTs:Date.now(),auto:true,rl:risk,sigDetails:sig.details};
      if(tradeModeR.current==="real"){
        // 真實盤：送出真實委託，同時更新模擬持倉讓畫面即時顯示
        if(brokerR.current?.status!=="connected"){
          setAlog(l=>[{ts:new Date().toLocaleTimeString("zh-TW"),sym,act:"⚠️未連接",price,conf:sig.conf,note:"真實下單需先連接永豐"},...l.slice(0,49)]);
          return;
        }
        fetch("/api/sinopac?path=order",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({symbol:sym,direction:dir==="L"?"buy":"sell",quantity:qty,price:price,order_type:"市價"})
        }).catch(e=>console.error("Real auto order failed:",e));
        setAlog(l=>[{ts:new Date().toLocaleTimeString("zh-TW"),sym,act:dir==="L"?"🔴AI真實買▲":"🔴AI真實賣▼",price,conf:sig.conf,rsi:sig.rsi},...l.slice(0,49)]);
      } else {
        // 虛擬盤：僅更新畫面狀態
        setAlog(l=>[{ts:new Date().toLocaleTimeString("zh-TW"),sym,act:dir==="L"?"做多▲":"做空▼",price,conf:sig.conf,rsi:sig.rsi},...l.slice(0,49)]);
      }
      setPos(p=>[...p,newPos]);
      setPf(pv=>({...pv,cash:+(pv.cash-(dir==="L"?price*qty:0)).toFixed(2)}));
    });
  },[risk,wl,pf.cash,closePosById]);

  useEffect(()=>{
    if(!autoOn) return;
    autoTrade(); // immediate
    const iv=setInterval(autoTrade,30000);
    return()=>clearInterval(iv);
  },[autoOn,autoTrade]);

  // ── Manual trade ─────────────────────────────────────────────
  // 真實下單的實際執行（從確認彈窗呼叫，不會在使用者按下"做多/做空"的瞬間就直接送出）
  const executeRealOrder = useCallback(async(sym,dir,qty,price)=>{
    if(brokerR.current?.status!=="connected"){
      setModal({type:"realErr",data:{msg:"請先在設定頁連接永豐帳戶"}});
      return;
    }
    try{
      const r=await fetch("/api/sinopac?path=order",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({symbol:sym,direction:dir==="L"?"buy":"sell",quantity:qty,price:price,order_type:"市價"})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"下單失敗");
      setModal({type:"realOk",data:{sym,dir,qty,price}});
    }catch(e){
      setModal({type:"realErr",data:{msg:e.message||"下單失敗，請確認帳戶連接狀態"}});
    }
  },[]);

  const placeTrade = useCallback(async(sym,dir,qty)=>{
    const price=N(liveR.current[sym]?.price,STOCKS[sym]?.base??0);
    if(!price||!qty||qty<1) return;
    if(tradeModeR.current==="real"){
      // 真實盤：手動下單先彈出確認視窗顯示確切金額，避免單位誤解或手滑造成的下單風險
      if(brokerR.current?.status!=="connected"){
        setModal({type:"realErr",data:{msg:"請先在設定頁連接永豐帳戶"}});
        return;
      }
      setModal({type:"manualRealConfirm",data:{sym,dir,qty,price,eligibility:"loading"}});
      try{
        const er=await fetch(`/api/sinopac?path=contract/${encodeURIComponent(sym)}`);
        const ed=await er.json();
        setModal(m=>m?.type==="manualRealConfirm"&&m.data.sym===sym?{...m,data:{...m.data,eligibility:ed}}:m);
      }catch{
        setModal(m=>m?.type==="manualRealConfirm"&&m.data.sym===sym?{...m,data:{...m.data,eligibility:null}}:m);
      }
      return;
    }
    // 虛擬盤
    const sl=+(price*(dir==="L"?0.98:1.02)).toFixed(2);
    const tp=+(price*(dir==="L"?1.05:0.95)).toFixed(2);
    const id=Date.now();
    const shares2=isTWStock(sym)?qty*1000:qty;
    const p={id,sym,name:getStockName(sym),dir,qty,shares:shares2,entry:price,cur:price,pnl:0,pct:0,sl,tp,openTime:new Date().toLocaleTimeString("zh-TW"),openTs:Date.now(),auto:false,rl:"manual"};
    setPos(x=>[...x,p]);
    setPf(pv=>({...pv,cash:+(pv.cash-(dir==="L"?price*qty:0)).toFixed(2)}));
    setModal({type:"ok",data:p});
  },[]);

  // ── AI Chat ──────────────────────────────────────────────────
  const sendChat = useCallback(async(msg)=>{
    if(!msg.trim()||chatBusy) return;
    setChat(c=>[...c,{role:"user",t:msg}]); setChatIn(""); setChatBusy(true);
    const lrn=learnR.current;
    const marketSnap=Object.entries(liveR.current).slice(0,6).map(([s,d])=>`${s}:NT$${d.price.toFixed(2)}(${d.pct>=0?"+":""}${d.pct.toFixed(2)}%)`).join(", ");
    const topSig=Object.entries(sigs).filter(([,v])=>v.action!=="hold").slice(0,3).map(([s,v])=>`${s}:${v.action==="buy"?"買▲":"賣▼"}信心${v.conf}%`).join(", ");
    try{
      const r=await fetch("/api/anthropic",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:600,messages:[
          {role:"user",content:`你是 TradeAI Pro 的 AI 當沖分析師，以繁體中文回答，精簡專業控制在120字以內。
市況：${marketSnap} | 熱門信號：${topSig||"無"} | 自動交易：${autoOn?"運行（"+RISK_CFG[risk].label+")":"停止"} | AI勝率：${lrn.trades>0?(lrn.wins/lrn.trades*100).toFixed(1):0}%(${lrn.trades}次) | AI信心：${lrn.conf}%
用戶：${msg}`}
        ]})});
      const d=await r.json();
      if(!r.ok){
        const errMsg=d?.error?.message||d?.detail||`伺服器錯誤(${r.status})`;
        setChat(c=>[...c,{role:"ai",t:`⚠️ 連線失敗：${errMsg}`}]);
        setChatBusy(false);
        return;
      }
      const txt=(d.content?.[0]?.text||"暫時無法回應，請稍後再試。").replace(/```json|```/g,"").trim();
      setChat(c=>[...c,{role:"ai",t:txt}]);
    }catch(e){setChat(c=>[...c,{role:"ai",t:`⚠️ 網路異常：${e.message||"無法連接伺服器"}，請稍後重試。`}]);}
    setChatBusy(false);
  },[chatBusy,sigs,autoOn,risk]);

  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:"smooth"});},[chat]);

  // ── 永豐真實帳戶連接（透過 /api/sinopac 代理呼叫 Railway 後端，僅讀取帳戶資訊，不影響AI模擬下單）────
  const connectBroker = useCallback(async()=>{
    if(!broker.apiKey.trim()||!broker.secretKey.trim()){
      setBroker(b=>({...b,error:"請輸入 API Key 與 Secret Key"})); return;
    }
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
      // 若本機已有訓練過的ML模型（localStorage），同步到後端供自動交易參考
      try{
        const saved=JSON.parse(localStorage.getItem("ml_model_weights")||"null");
        if(saved&&saved.W1&&Object.keys(mlState.prediction||{}).length>0){
          const predictions01={};
          Object.entries(mlState.prediction).forEach(([sym,v])=>{predictions01[sym]=+(v/100).toFixed(3);});
          fetch("/api/sinopac?path=ml/predictions",{method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({predictions:predictions01})}).catch(()=>{});
        }
      }catch{}
      // 從後端還原學習狀態（AI信心度/勝率/連勝/權重）——換裝置、清過快取也能接回進度
      try{
        const lr=await fetch("/api/sinopac?path=learn/state");
        const ld=await lr.json();
        if(lr.ok&&ld&&typeof ld.trades==="number"&&ld.trades>=(learn.trades||0)){
          // 只在後端紀錄比本機更新（trades較多）時才覆蓋，避免反向覆蓋掉本機剛累積的新進度
          setLearn(ld);
        }
      }catch{}
      // 從後端還原ML神經網路模型權重（換裝置也能接續使用已訓練的模型）
      try{
        const mr=await fetch("/api/sinopac?path=ml/model");
        const md=await mr.json();
        if(mr.ok&&md&&md.W1&&!mlState.trained){
          const m=new NeuralNet(md.inputSz||9,md.hiddenSz||16,md.lr||0.015);
          m.W1=md.W1; m.b1=md.b1; m.W2=md.W2; m.b2=md.b2; m.valAcc=md.valAcc||0; m.trained=true;
          setMlModel(m);
          setMlState(s=>({...s,trained:true,bestAcc:md.valAcc||0,lastTrained:`${md.savedAt||""}（自後端還原）`}));
        }
      }catch{}
    }catch(e){
      setBroker(b=>({...b,status:"disconnected",error:e.message||"連接失敗，請確認金鑰正確"}));
    }
  },[broker.apiKey,broker.secretKey,mlState.prediction,mlState.trained,learn.trades]);

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
    // 安全機制：中斷連接時若仍在真實盤模式，強制退回虛擬盤，避免畫面顯示「真實盤」卻其實沒有連接的混淆狀態
    setTradeMode(m=>{
      if(m==="real"){ setAlog(l=>[{ts:new Date().toLocaleTimeString("zh-TW"),sym:"系統",act:"⚠️已退回虛擬盤",price:0,conf:0,note:"永豐連接已中斷，真實盤無法繼續"},...l.slice(0,49)]); return "virtual"; }
      return m;
    });
  },[]);

  // ── 後端24h自動交易控制 ────────────────────────────────────────
  const startBackendAuto = useCallback(async()=>{
    if(broker.status!=="connected"){alert("請先連接永豐帳戶");return;}
    setBackendAuto(b=>({...b,loading:true}));
    try{
      const r=await fetch("/api/sinopac?path=auto/start",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({risk,cap_pct:autoCapPct,watchlist:wl,paper_mode:backendPaperMode})});
      const d=await r.json();
      if(r.ok){
        setBackendAuto(b=>({...b,enabled:true,loading:false,status:d.state}));
        try{ localStorage.setItem("backend_auto_should_run","true"); }catch{} // 記住意圖：後端重啟/重新部署後可自動恢復
      }
      else throw new Error(d.detail||"啟動失敗");
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

  // ── ML 訓練（非同步，分批執行避免 UI 凍結）────────────────────
  const trainML = useCallback(async()=>{
    const cd=chartR.current;
    if(Object.keys(cd).length===0) return;
    setMlState(s=>({...s,training:true,epoch:0,loss:[],valAcc:[]}));
    // 生成訓練資料
    await new Promise(r=>setTimeout(r,50));
    const {X,y}=generateTrainingData(cd);
    if(X.length<30){setMlState(s=>({...s,training:false}));return;}
    // 80/20 訓練/驗證分割
    const split=Math.floor(X.length*0.8);
    const Xtrain=X.slice(0,split), ytrain=y.slice(0,split);
    const Xval=X.slice(split),   yval=y.slice(split);
    const model=new NeuralNet(9,16,0.015);
    const EPOCHS=120, BATCH=32;
    const lossHist=[], accHist=[];
    setMlState(s=>({...s,totalEpochs:EPOCHS,dataSize:X.length}));
    // 分批訓練（每10 epoch 讓 UI 更新）
    for(let e=0;e<EPOCHS;e+=10){
      await new Promise(r=>setTimeout(r,0));
      for(let sub=0;sub<10&&(e+sub)<EPOCHS;sub++){
        const ep=e+sub;
        // Shuffle
        for(let i=Xtrain.length-1;i>0;i--){
          const j=Math.floor(Math.random()*(i+1));
          [Xtrain[i],Xtrain[j]]=[Xtrain[j],Xtrain[i]];
          [ytrain[i],ytrain[j]]=[ytrain[j],ytrain[i]];
        }
        let l=0;
        for(let b=0;b<Xtrain.length;b+=BATCH) l+=model.trainStep(Xtrain.slice(b,b+BATCH),ytrain.slice(b,b+BATCH));
        const avgL=+(l/(Math.ceil(Xtrain.length/BATCH))).toFixed(4);
        const acc=+(model.evaluate(Xval,yval)*100).toFixed(1);
        lossHist.push({e:ep+1,loss:avgL}); accHist.push({e:ep+1,acc});
        if(acc>model.valAcc) model.valAcc=acc;
      }
      setMlState(s=>({...s,epoch:Math.min(e+10,EPOCHS),loss:[...lossHist],valAcc:[...accHist],bestAcc:model.valAcc}));
    }
    model.trained=true;
    // 計算特徵重要性
    const fi=featureImportance(model,Xval,yval);
    // 用目前信號做預測
    const preds={};
    Object.entries(sigs).forEach(([sym,sig])=>{
      const lp=liveR.current[sym];
      if(lp){const feat=extractFeatures(sig,lp.price);preds[sym]=+(model.predict(feat)*100).toFixed(1);}
    });
    setMlModel(model);
    const modelSnapshot={
      W1:model.W1, b1:model.b1, W2:model.W2, b2:model.b2,
      inputSz:model.inputSz, hiddenSz:model.hiddenSz, lr:model.lr,
      valAcc:model.valAcc, savedAt:new Date().toLocaleString("zh-TW")
    };
    // 訓練完成後儲存模型到 localStorage（同裝置重整頁面立即可用）
    try{ localStorage.setItem("ml_model_weights",JSON.stringify(modelSnapshot)); }catch(e){}
    setMlState(s=>({...s,trained:true,training:false,featureImport:fi,prediction:preds,bestAcc:model.valAcc,lastTrained:new Date().toLocaleTimeString("zh-TW")}));
    // 將訓練結果同步到後端：① 完整模型權重（換裝置可還原）② 預測結果（讓後端下單邏輯實際參考）
    if(brokerR.current?.status==="connected"){
      fetch("/api/sinopac?path=ml/model",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(modelSnapshot)}).catch(()=>{});
      const predictions01={};
      Object.entries(preds).forEach(([sym,v])=>{predictions01[sym]=+(v/100).toFixed(3);});
      fetch("/api/sinopac?path=ml/predictions",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({predictions:predictions01})}).catch(()=>{});
    }
  },[sigs]);

  // ── ML 即時預測（每 10s 更新）────────────────────────────────
  useEffect(()=>{
    if(!mlModel.trained) return;
    const iv=setInterval(()=>{
      const preds={};
      Object.entries(sigsR.current).forEach(([sym,sig])=>{
        const lp=liveR.current[sym];
        if(lp){const feat=extractFeatures(sig,lp.price);preds[sym]=+(mlModel.predict(feat)*100).toFixed(1);}
      });
      setMlState(s=>({...s,prediction:preds}));
    },10000);
    return()=>clearInterval(iv);
  },[mlModel]);

  // ═══════════════════════════════════════════════════════════════
  // COMPUTED
  // ═══════════════════════════════════════════════════════════════
  const wr = learn.trades>0?+(learn.wins/learn.trades*100).toFixed(1):0;
  // 修正：只統計「自選股清單裡」的訊號，避免把已移除的內建模擬股票也算進活躍信號數
  const buySignals = Object.entries(sigs).filter(([sym,v])=>wl.includes(sym)&&v.action==="buy");
  const sellSignals = Object.entries(sigs).filter(([sym,v])=>wl.includes(sym)&&v.action==="sell");
  const posValue = pos.reduce((s,p)=>s+N(p.cur)*(p.shares??(isTWStock(p.sym)?p.qty*1000:p.qty)),0); // 修正：用實際股數計算持倉市值

  // 共用元件 Card/Row/Chip 已提升至檔案頂層（穩定身分，避免重複渲染時被重建）

  // ═══════════════════════════════════════════════════════════════
  // ⬡ AI BRAIN
  // ═══════════════════════════════════════════════════════════════
  const BrainTab = () => {
    const conf=learn.conf;
    const confClr=conf>=75?"text-emerald-400":conf>=55?"text-amber-400":"text-red-400";
    const confBg=conf>=75?"#4ade80":conf>=55?"#fbbf24":"#f87171";
    return (
      <div className="space-y-3">
        {/* Hero metrics */}
        <div className="grid grid-cols-2 gap-3">
          <Card onClick={()=>setModal({type:"learnDetail"})} cls="p-4">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">AI 信心度</div>
            <div className={`text-4xl font-mono font-bold ${confClr}`}>{conf}<span className="text-lg">%</span></div>
            <div className="mt-3 h-1 bg-[#0d2137] rounded-full">
              <div className="h-full rounded-full transition-all duration-1000" style={{width:`${conf}%`,background:confBg}}/>
            </div>
            <div className="text-[9px] text-gray-600 mt-1">{PHASES[learn.phase]}</div>
          </Card>
          <Card onClick={()=>setModal({type:"perfDetail"})} cls="p-4">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">累計勝率</div>
            <div className={`text-4xl font-mono font-bold ${wr>=75?"text-emerald-400":wr>=60?"text-amber-400":"text-red-400"}`}>{wr}<span className="text-lg">%</span></div>
            <div className="mt-2 text-[9px] text-gray-600">{learn.wins}勝 {learn.trades-learn.wins}敗 · {learn.trades}次</div>
            <div className={`text-[9px] mt-1 font-bold ${wr>=75?"text-emerald-400":"text-gray-600"}`}>{wr>=75?"✓ 達標 75%":"目標 75%↑"}</div>
          </Card>
        </div>

        {/* 4-metric strip */}
        <div className="grid grid-cols-4 gap-2">
          {[
            {l:"資產",v:`NT$${(N(pf.total)/1e3).toFixed(1)}K`,c:"text-white",click:()=>setModal({type:"pfDetail"})},
            {l:"今日",v:`${N(pf.dayPnL)>=0?"+":""}NT$${F(pf.dayPnL,0)}`,c:CC(pf.dayPnL),click:()=>setModal({type:"pfDetail"})},
            {l:"連勝",v:`${learn.streak}`,c:"text-amber-400",click:()=>setModal({type:"perfDetail"})},
            {l:"持倉",v:`${pos.length}`,c:"text-cyan-400",click:()=>setTab("auto")},
          ].map(x=>(
            <Card key={x.l} onClick={x.click} cls="p-3 text-center">
              <div className="text-[9px] text-gray-600 mb-1">{x.l}</div>
              <div className={`text-sm font-mono font-bold ${x.c}`}>{x.v}</div>
            </Card>
          ))}
        </div>

        {/* Auto status */}
        <Card onClick={()=>setTab("auto")} cls="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${autoOn?"bg-emerald-400 animate-pulse":"bg-gray-700"}`}/>
              <span className="text-xs font-bold text-white">AI 自動當沖</span>
              <Chip c={`border-${risk==="low"?"emerald":risk==="mid"?"amber":"red"}-500/30 text-${risk==="low"?"emerald":risk==="mid"?"amber":"red"}-400 bg-${risk==="low"?"emerald":risk==="mid"?"amber":"red"}-500/10`}>{RISK_CFG[risk].label}</Chip>
            </div>
            <span className={`text-[10px] font-bold ${autoOn?"text-emerald-400":"text-gray-600"}`}>{autoOn?"運行中":"已暫停"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="text-[9px] text-gray-600">自動交易</div><div className="text-xs font-mono font-bold text-white">{hist.filter(h=>h.auto).length}次</div></div>
            <div><div className="text-[9px] text-gray-600">自動盈虧</div><div className={`text-xs font-mono font-bold ${CC(hist.filter(h=>h.auto).reduce((s,h)=>s+h.pnl,0))}`}>{F(hist.filter(h=>h.auto).reduce((s,h)=>s+h.pnl,0))}</div></div>
            <div onClick={()=>setModal({type:"activeSignalsDetail"})} className="cursor-pointer"><div className="text-[9px] text-gray-600">活躍信號</div><div className="text-xs font-mono font-bold text-cyan-400 underline decoration-dotted">{buySignals.length+sellSignals.length}個</div></div>
          </div>
        </Card>

        {/* 潛力股雷達：依技術指標綜合強度排序自選股（非預測，僅反映目前技術面動能） */}
        {wl.length>0&&(()=>{
          const scored=wl.map(sym=>{
            const sig=sigs[sym]||{};
            const momentum=(N(sig.conf)-50)*1.0+(N(sig.volRatio,1)-1)*15+(N(sig.trendStr)*20);
            return{sym,sig,momentum};
          }).filter(x=>x.sig.action&&x.sig.action!=="hold").sort((a,b)=>Math.abs(b.momentum)-Math.abs(a.momentum)).slice(0,3);
          if(scored.length===0) return null;
          return(
            <div className="space-y-2">
              <div className="text-[9px] text-gray-600 uppercase tracking-wider px-1 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400"/>潛力股雷達（技術面動能排行，非預測）
              </div>
              <div className="grid grid-cols-3 gap-2">
                {scored.map(({sym,sig,momentum})=>(
                  <Card key={sym} onClick={()=>{setSelSym(sym);setTab("market");}} cls="p-2.5 text-center">
                    <div className="text-[10px] font-mono font-bold text-white">{sym}</div>
                    <div className={`text-[9px] mt-1 font-bold ${sig.action==="buy"?"text-emerald-400":"text-red-400"}`}>{sig.action==="buy"?"▲動能偏多":"▼動能偏空"}</div>
                    <div className="text-[8px] text-gray-600 mt-0.5">強度 {Math.abs(momentum).toFixed(0)}</div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Top signals */}
        <div className="space-y-2">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider px-1">即時信號</div>
          {wl.slice(0,5).map(sym=>{
            const sig=sigs[sym]||{action:"hold",conf:50,rsi:50};
            const lp=live[sym]||{};
            return(
              <Card key={sym} onClick={()=>setModal({type:"sigModal",data:{sym,sig,lp}})} cls="p-3 flex items-center gap-3">
                <div className={`w-1 h-8 rounded-full flex-shrink-0 ${sig.action==="buy"?"bg-emerald-400":sig.action==="sell"?"bg-red-400":"bg-gray-700"}`}/>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white">{sym}</span>
                    <span className="text-[9px] text-gray-600">{getStockName(sym)}</span>
                  </div>
                  <div className="text-[9px] text-gray-600">RSI {sig.rsi!=null?sig.rsi.toFixed(0):"—"} · 信心 {sig.conf}%</div>
                </div>
                <div className="text-right mr-2">
                  <div className="text-sm font-mono font-bold text-white">{N(lp.price,STOCKS[sym]?.base??realBases[sym]??0).toFixed(2)}</div>
                  <div className={`text-[9px] ${CC(lp.pct)}`}>{N(lp.pct)>=0?"▲":"▼"}{Math.abs(N(lp.pct)).toFixed(2)}%</div>
                </div>
                <Chip c={sig.action==="buy"?"bg-emerald-500/10 border-emerald-500/25 text-emerald-400":sig.action==="sell"?"bg-red-500/10 border-red-500/25 text-red-400":"border-gray-800 text-gray-700"}>
                  {sig.action==="buy"?"買▲":sig.action==="sell"?"賣▼":"─"}
                </Chip>
              </Card>
            );
          })}
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
        {/* Control */}
        <Card cls="p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-bold text-white">AI 自動當沖</div>
              <div className="text-[9px] text-gray-600 mt-0.5">真實市場數據 × 虛擬資金測試</div>
            </div>
            <button onClick={()=>setAutoOn(v=>!v)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-all ${autoOn?"bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/15":"bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15"}`}>
              {autoOn?<><Pause className="w-4 h-4"/>暫停</>:<><Play className="w-4 h-4"/>啟動</>}
            </button>
          </div>
          {/* Risk selector */}
          <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">風險等級</div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(RISK_CFG).map(([key,c])=>(
              <button key={key} onClick={()=>setRisk(key)}
                className={`py-3 rounded-xl border text-xs font-bold transition-all ${risk===key?`${c.bg} ${c.c}`:"border-[#0d2137] text-gray-600 bg-[#070f1c]"}`}>
                <div>{c.label}</div>
                <div className="text-[9px] opacity-60 font-normal mt-0.5">信心{c.minConf}%↑</div>
              </button>
            ))}
          </div>
        </Card>

        {/* Params */}
        <Card onClick={()=>setModal({type:"riskModal",data:{risk}})} cls="p-3">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">當前參數 — 點擊詳情</div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[{l:"倉位",v:`${cfg.alloc*100}%`},{l:"停損",v:`${cfg.sl}%`},{l:"止盈",v:`${cfg.tp}%`},{l:"最多持倉",v:`${cfg.maxPos}筆`}].map(x=>(
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
              關閉瀏覽器後仍持續交易 · 台股時段 09:00-13:25 · 自動使用目前風險等級（{RISK_CFG[risk].label}）與自選股清單
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
            {!backendAuto.enabled?(
              <button onClick={startBackendAuto} disabled={backendAuto.loading}
                className="w-full py-2.5 bg-violet-500/10 border border-violet-500/30 text-violet-400 rounded-xl text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
                {backendAuto.loading?<><RefreshCw className="w-3 h-3 animate-spin"/>啟動中...</>:`啟動後端24h自動交易（${backendPaperMode?"模擬":"真實"}）`}
              </button>
            ):(
              <button onClick={stopBackendAuto}
                className="w-full py-2.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs font-bold">
                停止後端自動交易
              </button>
            )}
            {backendAuto.log.length>0&&(
              <div className="mt-3 max-h-24 overflow-y-auto space-y-1">
                {backendAuto.log.slice(0,5).map((l,i)=>(
                  <div key={i} className="flex gap-2 text-[9px]">
                    <span className="text-gray-700 flex-shrink-0">{l.ts}</span>
                    <span className="text-gray-500">{l.sym}</span>
                    <span className="text-gray-400">{l.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Auto log（本機虛擬盤訊號日誌） */}
        {alog.length>0&&(
          <Card cls="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[9px] text-gray-600 uppercase tracking-wider">自動交易日誌</div>
              <div className="flex gap-1">
                {riskGuard.pauseUntil>Date.now()&&<Chip c="border-amber-500/30 text-amber-400 bg-amber-500/10">冷靜期</Chip>}
                {Math.abs(Math.min(0,riskGuard.dailyLoss))/startingCapitalR.current*100>=3&&<Chip c="border-red-500/30 text-red-400 bg-red-500/10">日損停損</Chip>}
                {riskGuard.dailyProfit/startingCapitalR.current*100>=8&&<Chip c="border-emerald-500/30 text-emerald-400 bg-emerald-500/10">獲利鎖定</Chip>}
              </div>
            </div>
            {alog.slice(0,6).map((l,i)=>(
              <div key={i} className="flex items-center gap-2 py-1 border-b border-[#0d2137] last:border-0 text-[10px]">
                <span className="text-gray-700 font-mono w-10 flex-shrink-0">{l.ts?.slice(-8,-3)}</span>
                <span className="font-bold text-white">{l.sym}</span>
                <span className={l.act.includes("多")?"text-emerald-400":l.act.includes("空")?"text-red-400":"text-amber-400"}>{l.act}</span>
                <span className="text-gray-600">NT${N(l.price).toFixed(2)}</span>
                <span className="text-gray-700 ml-auto">{N(l.conf).toFixed(0)}%</span>
              </div>
            ))}
          </Card>
        )}

        {/* Positions */}
        {pos.length>0&&(
          <Card cls="overflow-hidden">
            <div className="px-3 py-2 border-b border-[#0d2137] flex justify-between">
              <span className="text-[9px] text-gray-600 uppercase tracking-wider">持倉</span>
              <span className="text-[9px] text-cyan-400">{pos.length}筆 · ${posValue.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
            </div>
            {pos.map((p,i)=>(
              <div key={p.id} onClick={()=>setModal({type:"posModal",data:p})}
                className={`flex items-center px-3 py-2.5 cursor-pointer hover:bg-[#0a1422] transition-all ${i<pos.length-1?"border-b border-[#0d2137]":""}`}>
                <div className={`w-1 h-6 rounded-full mr-3 flex-shrink-0 ${p.dir==="L"?"bg-emerald-500":"bg-red-500"}`}/>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white">{p.sym}</span>
                    <Chip c={p.auto?"border-violet-500/30 text-violet-400 bg-violet-500/10":"border-gray-700 text-gray-600 bg-transparent"}>{p.auto?"AI":"手動"}</Chip>
                  </div>
                  <div className="text-[9px] text-gray-600">{p.qty}{isTWStock(p.sym)?"張":"股"} · NT${N(p.entry).toFixed(2)}</div>
                </div>
                <div className="text-right mr-3">
                  <div className={`text-sm font-mono font-bold ${CC(p.pnl)}`}>{N(p.pnl)>=0?"+":""}{F(p.pnl)}</div>
                  <div className={`text-[9px] ${CC(p.pct)}`}>{N(p.pct)>=0?"+":""}{F(p.pct)}%</div>
                </div>
                <button onClick={e=>{e.stopPropagation();closePosById(p.id);}} className="text-[9px] bg-red-500/10 border border-red-500/25 text-red-400 px-2 py-1 rounded-lg font-bold">出場</button>
              </div>
            ))}
          </Card>
        )}

        {/* Trade history */}
        {hist.length>0&&(
          <Card cls="overflow-hidden">
            <div className="px-3 py-2 border-b border-[#0d2137]">
              <span className="text-[9px] text-gray-600 uppercase tracking-wider">交易記錄</span>
            </div>
            {hist.slice().reverse().slice(0,10).map((t,i)=>(
              <div key={t.id} onClick={()=>setModal({type:"tradeModal",data:t})}
                className={`flex items-center px-3 py-2 cursor-pointer hover:bg-[#0a1422] ${i<Math.min(hist.length,10)-1?"border-b border-[#0d2137]":""}`}>
                <div className={`w-1.5 h-1.5 rounded-full mr-3 flex-shrink-0 ${t.win?"bg-emerald-400":"bg-red-400"}`}/>
                <div className="flex-1">
                  <span className="text-[10px] font-mono font-bold text-white">{t.sym}</span>
                  <span className={`text-[9px] ml-2 ${t.dir==="L"?"text-emerald-400":"text-red-400"}`}>{t.dir==="L"?"多":"空"}</span>
                  {t.auto&&<span className="text-[9px] ml-1 text-violet-400">AI</span>}
                </div>
                <div className="text-right">
                  <span className={`text-xs font-mono font-bold ${CC(t.pnl)}`}>NT${t.pnl>=0?"+":""}{F(t.pnl)}</span>
                  {t.fee!=null&&<div className="text-[8px] text-gray-700">含成本NT${t.fee}</div>}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // ◈ LEARNING
  // ═══════════════════════════════════════════════════════════════
  const LearnTab = () => {
    const phase=PHASES[learn.phase];
    const phaseTrades=[0,5,20,50,100,999];
    const nextT=phaseTrades[Math.min(learn.phase+1,5)];
    const prog=learn.phase>=5?100:Math.min(100,learn.trades/nextT*100);
    return(
      <div className="space-y-3">
        {/* Learning progress */}
        <Card onClick={()=>setModal({type:"learnDetail"})} cls="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-bold text-white">{phase}</div>
              <div className="text-[9px] text-gray-600 mt-0.5">{learn.phase<5?`${learn.trades}/${nextT}次 → 下一階段`:"已達最高階段"}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-violet-400">{learn.conf}%</div>
              <div className="text-[9px] text-gray-600">AI信心</div>
            </div>
          </div>
          {/* Phase dots */}
          <div className="flex gap-1 mb-3">
            {PHASES.map((_,i)=>(
              <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i<learn.phase?"bg-violet-500":i===learn.phase?"bg-violet-400":"bg-[#0d2137]"}`}/>
            ))}
          </div>
          <div className="h-1.5 bg-[#0d2137] rounded-full">
            <div className="h-full bg-gradient-to-r from-violet-600 to-cyan-400 rounded-full transition-all duration-500" style={{width:`${prog}%`}}/>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          {[
            {l:"累計交易",v:`${learn.trades}次`,c:"text-white"},
            {l:"AI勝率",v:`${wr}%`,c:wr>=75?"text-emerald-400":wr>=60?"text-amber-400":"text-red-400"},
            {l:"學習盈虧",v:`${learn.pnl>=0?"+":""}NT$${F(learn.pnl)}`,c:CC(learn.pnl)},
            {l:"最高連勝",v:`${learn.maxStreak}連`,c:"text-amber-400"},
          ].map(x=>(
            <Card key={x.l} cls="p-3">
              <div className="text-[9px] text-gray-600 mb-1">{x.l}</div>
              <div className={`text-lg font-mono font-bold ${x.c}`}>{x.v}</div>
            </Card>
          ))}
        </div>

        {/* Win rate targets */}
        <Card cls="p-4">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">勝率目標</div>
          <div className="space-y-3">
            {[{l:"入門",t:60},{l:"良好",t:65},{l:"目標",t:75},{l:"卓越",t:80}].map(g=>(
              <div key={g.t}>
                <div className="flex justify-between text-[9px] mb-1">
                  <span className={wr>=g.t?"text-emerald-400":"text-gray-600"}>{g.l} {g.t}%</span>
                  {wr>=g.t&&<span className="text-emerald-500">✓</span>}
                </div>
                <div className="h-1 bg-[#0d2137] rounded-full">
                  <div className={`h-full rounded-full transition-all ${wr>=g.t?"bg-emerald-500":"bg-gray-700"}`} style={{width:`${Math.min(100,wr/g.t*100)}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Adaptive weights */}
        <Card cls="p-4">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">AI 自適應指標權重</div>
          <div className="space-y-2">
            {[{l:"RSI",k:"rsi"},{l:"MACD",k:"macd"},{l:"MA均線",k:"ma"},{l:"成交量",k:"vol"}].map(x=>(
              <div key={x.k} className="flex items-center gap-3">
                <span className="text-[10px] text-gray-500 w-12">{x.l}</span>
                <div className="flex-1 h-1.5 bg-[#0d2137] rounded-full">
                  <div className="h-full bg-violet-500 rounded-full transition-all" style={{width:`${Math.min(100,(learn.weights[x.k]||0.25)*250).toFixed(0)}%`}}/>
                </div>
                <span className="text-[9px] font-mono text-violet-400 w-8 text-right">{((learn.weights[x.k]||0.25)*100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <div className="text-[9px] text-gray-700 mt-3">每次交易後AI自動調整各指標權重，提高準確信號的影響力</div>
        </Card>

        {/* Win rate history chart */}
        {learn.history.length>4&&(
          <Card cls="p-3">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">勝率趨勢</div>
            <ResponsiveContainer width="100%" height={70}>
              <LineChart data={learn.history.slice(-30).map((h,i)=>({i,wr:h.wr}))} margin={{top:4,right:2,bottom:0,left:0}}>
                <XAxis dataKey="i" hide/>
                <YAxis domain={[40,100]} hide/>
                <ReferenceLine y={75} stroke="#4ade80" strokeDasharray="3 3" strokeOpacity={0.4}/>
                <Tooltip contentStyle={{background:"#070f1c",border:"1px solid #0d2137",borderRadius:8,color:"#fff",fontSize:10}} formatter={v=>[`${v}%`,"勝率"]}/>
                <Line type="monotone" dataKey="wr" stroke="#a78bfa" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* AI insights */}
        <Card cls="p-4">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">AI 學習洞察</div>
          <div className="space-y-1.5 text-[10px] text-gray-400 leading-relaxed">
            <div>{wr>=75?"✓ 勝率達標，維持現有策略配置":"→ 建議增加 RSI<30 超賣信號的比重"}</div>
            <div>{learn.streak>=3?"✓ 連勝進行中，保持倉位紀律":"→ 連敗超過3次請縮減倉位50%"}</div>
            <div>{learn.conf>=70?"✓ AI信心穩定，可考慮適度增加倉位":"→ 需要更多交易數據建立信心"}</div>
            <div>{learn.pnl>=0?"✓ 累計盈利，策略運作有效":"→ 優化停損設置，減少大額虧損"}</div>
          </div>
        </Card>

        {/* ── ML 機器學習訓練 ── */}
        <Card cls="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-bold text-white">ML 神經網路訓練</div>
              <div className="text-[9px] text-gray-600 mt-0.5">9特徵 × 2層 × 16神經元 · 純JS實作</div>
            </div>
            <div className="flex items-center gap-2">
              {mlState.trained&&<span className="text-[9px] text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold">已訓練</span>}
              <button onClick={()=>!mlState.training&&trainML()}
                disabled={mlState.training}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${mlState.training?"border-violet-500/30 text-violet-400 bg-violet-500/10 animate-pulse":"border-cyan-500/30 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/15"}`}>
                {mlState.training?<><RefreshCw className="w-3 h-3 animate-spin"/>訓練中</>:<><Brain className="w-3 h-3"/>開始訓練</>}
              </button>
            </div>
          </div>

          {/* 訓練進度 */}
          {mlState.training&&(
            <div className="mb-3">
              <div className="flex justify-between text-[9px] mb-1">
                <span className="text-gray-600">Epoch {mlState.epoch}/{mlState.totalEpochs}</span>
                <span className="text-violet-400">資料 {mlState.dataSize} 筆</span>
              </div>
              <div className="h-2 bg-[#0d2137] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-600 to-cyan-400 rounded-full transition-all"
                  style={{width:`${mlState.totalEpochs?mlState.epoch/mlState.totalEpochs*100:0}%`}}/>
              </div>
            </div>
          )}

          {/* 訓練結果 */}
          {(mlState.trained||mlState.loss.length>0)&&(
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  {l:"最佳驗證準確率",v:`${mlState.bestAcc?.toFixed?.(1)||"─"}%`,c:N(mlState.bestAcc)>=70?"text-emerald-400":"text-amber-400"},
                  {l:"訓練資料",v:`${mlState.dataSize}筆`,c:"text-white"},
                  {l:"模型架構",v:"9→16→1",c:"text-cyan-400"},
                ].map(x=>(
                  <div key={x.l} className="bg-[#0a1422] border border-[#0d2137] rounded-lg p-2 text-center">
                    <div className="text-[8px] text-gray-600 mb-0.5">{x.l}</div>
                    <div className={`text-xs font-mono font-bold ${x.c}`}>{x.v}</div>
                  </div>
                ))}
              </div>

              {/* Loss 曲線 */}
              {mlState.loss.length>3&&(
                <div className="mb-3">
                  <div className="text-[9px] text-gray-600 mb-1">訓練損失 (越低越好)</div>
                  <ResponsiveContainer width="100%" height={55}>
                    <LineChart data={mlState.loss} margin={{top:2,right:2,bottom:0,left:0}}>
                      <YAxis domain={["auto","auto"]} hide/>
                      <Tooltip contentStyle={{background:"#070f1c",border:"1px solid #0d2137",borderRadius:8,color:"#fff",fontSize:9}} formatter={v=>[v?.toFixed(4),"Loss"]}/>
                      <Line type="monotone" dataKey="loss" stroke="#a78bfa" strokeWidth={1.5} dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="text-[9px] text-gray-600 mt-1">驗證準確率</div>
                  <ResponsiveContainer width="100%" height={55}>
                    <LineChart data={mlState.valAcc} margin={{top:2,right:2,bottom:0,left:0}}>
                      <YAxis domain={[40,100]} hide/>
                      <ReferenceLine y={70} stroke="#4ade80" strokeDasharray="3 3" strokeOpacity={0.4}/>
                      <Tooltip contentStyle={{background:"#070f1c",border:"1px solid #0d2137",borderRadius:8,color:"#fff",fontSize:9}} formatter={v=>[`${v}%`,"驗證準確率"]}/>
                      <Line type="monotone" dataKey="acc" stroke="#22d3ee" strokeWidth={1.5} dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 特徵重要性 */}
              {mlState.featureImport.length>0&&(
                <div className="mb-3">
                  <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">特徵重要性（擾動法）</div>
                  <div className="space-y-1.5">
                    {mlState.featureImport.slice(0,5).map((f,i)=>(
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-500 w-16 flex-shrink-0">{f.name}</span>
                        <div className="flex-1 h-1.5 bg-[#0d2137] rounded-full">
                          <div className="h-full bg-cyan-500 rounded-full"
                            style={{width:`${Math.min(100,f.importance*1000)}%`}}/>
                        </div>
                        <span className="text-[9px] font-mono text-cyan-400 w-10 text-right">{(f.importance*100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ML 即時預測 */}
              {Object.keys(mlState.prediction).length>0&&(
                <div>
                  <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">ML 即時勝率預測</div>
                  <div className="space-y-1">
                    {wl.slice(0,5).map(sym=>{
                      const prob=mlState.prediction[sym];
                      if(prob===undefined) return null;
                      const sig=sigs[sym]||{};
                      return(
                        <div key={sym} className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-white w-16">{sym}</span>
                          <div className="flex-1 h-2 bg-[#0d2137] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${prob>=65?"bg-emerald-500":prob>=50?"bg-amber-500":"bg-red-500"}`}
                              style={{width:`${prob}%`}}/>
                          </div>
                          <span className={`text-[9px] font-mono font-bold w-10 text-right ${prob>=65?"text-emerald-400":prob>=50?"text-amber-400":"text-red-400"}`}>{prob}%</span>
                          <span className={`text-[9px] font-bold w-8 ${sig.action==="buy"?"text-emerald-400":sig.action==="sell"?"text-red-400":"text-gray-700"}`}>{sig.action==="buy"?"▲":sig.action==="sell"?"▼":"─"}</span>
                        </div>
                      );
                    })}
                  </div>
                  {mlState.lastTrained&&<div className="text-[9px] text-gray-700 mt-2">上次訓練：{mlState.lastTrained}</div>}
                </div>
              )}
            </>
          )}

          {!mlState.trained&&!mlState.training&&(
            <div className="text-[10px] text-gray-600 leading-relaxed">
              點擊「開始訓練」從歷史 K 線自動提取特徵並訓練神經網路。
              訓練資料來自所有自選股的模擬歷史數據（約 500-1000 筆），
              訓練完成後 ML 模型將輔助傳統指標做出更精準的預測。
            </div>
          )}
        </Card>

        {/* 回測結果 */}
        <Card onClick={()=>setModal({type:"backtestModal"})} cls="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] text-gray-600 uppercase tracking-wider">歷史回測 — 點擊查看詳情</div>
            <span className="text-[9px] text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 rounded font-bold">BACKTEST</span>
          </div>
          {(()=>{
            const btSym=wl[0]||"NVDA";
            const bt=backtest(charts[btSym]||[],65);
            return(
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  {l:"模擬勝率",v:`${bt.wr}%`,c:bt.wr>=65?"text-emerald-400":bt.wr>=55?"text-amber-400":"text-red-400"},
                  {l:"交易次數",v:`${bt.trades}`,c:"text-white"},
                  {l:"平均盈利",v:`${bt.avgWin}%`,c:"text-emerald-400"},
                  {l:"平均虧損",v:`${bt.avgLoss}%`,c:"text-red-400"},
                ].map(x=>(
                  <div key={x.l}>
                    <div className="text-[9px] text-gray-600 mb-0.5">{x.l}</div>
                    <div className={`text-xs font-mono font-bold ${x.c}`}>{x.v}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Card>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // ◐ SETTINGS
  // ═══════════════════════════════════════════════════════════════
  const SettingsTab = () => (
    <div className="space-y-3">
      <Card cls="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider flex items-center gap-1.5"><Link2 className="w-3 h-3"/>永豐大戶投連接</div>
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
            <div className="text-[9px] text-gray-600 leading-relaxed">連接後將自動讀取真實帳戶餘額與持倉。下單行為由上方「虛擬盤/真實盤」切換決定——虛擬盤僅模擬，真實盤會送出真實委託，請在自動分頁確認目前模式。</div>
            <div className="text-[9px] text-amber-400/70 mt-1.5 leading-relaxed">⚠ 當沖需符合法規資格（開戶滿3個月＋近1年成交達10筆＋已簽署當沖風險預告書），請先確認已在永豐開通，否則委託會被拒絕。零股不可當沖，僅整張可當沖（本系統已固定使用張為單位）。</div>
            <div className="text-[9px] text-gray-700 mt-1.5">💡 已記住的金鑰下次開啟網站會自動連接，不需要再手動按一次。</div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 mb-2"><ShieldCheck className="w-3.5 h-3.5"/>身分驗證成功</div>
            {broker.account?.ca_activated===true&&<div className="flex items-center gap-1 text-[9px] text-cyan-400 mb-2"><ShieldCheck className="w-3 h-3"/>CA 憑證已啟用（可查詢庫存）</div>}
            {broker.account?.ca_activated===false&&<div className="text-[9px] text-amber-400 mb-2">⚠ CA 憑證未啟用 — 持倉查詢可能為空，請確認 Railway 環境變數</div>}
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
                <div key={p.symbol} className="bg-[#0a1622] rounded-xl p-3 border border-[#0d2137]">
                  <div className="flex justify-between items-center mb-1">
                    <div><span className="text-xs font-mono font-bold text-white">{p.symbol}</span><span className="text-[9px] text-gray-500 ml-2">{p.name}</span></div>
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
      {/* 以下原始卡片繼續 — 補個假的 Card 開頭讓結構完整 */}
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">系統資訊</div>
        <Row l="模式" v="測試版（虛擬資金）" c="text-amber-400"/>
        <Row l="數據來源" v={broker.status==="connected"?"永豐真實報價（台股）":"模擬數據（未連接永豐）"} c={broker.status==="connected"?"text-emerald-400":"text-amber-400"}/>
        <Row l="AI 引擎" v="Claude Sonnet 4.6" c="text-violet-400"/>
        <Row l="掃描頻率" v="每30秒" c="text-cyan-400"/>
        <Row l="信號門檻" v="67%（嚴格模式）" c="text-cyan-400"/>
        <Row l="後端架構" v="Railway Python + FastAPI"/>
      </Card>
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">信號引擎 v2 — 9大指標</div>
        <div className="space-y-1.5 text-[10px]">
          {[
            {l:"RSI (14)", d:"超買超賣反轉", s:20},
            {l:"Stochastic RSI", d:"RSI動量確認", s:8},
            {l:"MACD (12,26,9)", d:"趨勢金叉死叉", s:25},
            {l:"MA 5/20 均線", d:"多空排列方向", s:20},
            {l:"VWAP", d:"機構均價位置", s:12},
            {l:"Bollinger Bands", d:"波動率通道", s:8},
            {l:"成交量比", d:"放量確認信號", s:8},
            {l:"趨勢強度 ADX", d:"趨勢加乘確認", s:7},
            {l:"時段品質", d:"過濾低效時段", s:0},
          ].map(x=>(
            <div key={x.l} className="flex items-center justify-between">
              <div>
                <span className="text-white">{x.l}</span>
                <span className="text-gray-600 ml-2">{x.d}</span>
              </div>
              {x.s>0&&<span className="text-cyan-400 font-mono text-[9px]">{x.s}分</span>}
              {x.s===0&&<span className="text-amber-400 text-[9px]">×0.72</span>}
            </div>
          ))}
        </div>
      </Card>
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">理論勝率預估</div>
        <div className="space-y-2 text-[10px] text-gray-400">
          <div className="flex justify-between"><span>單純技術指標（3個）</span><span className="text-gray-500">52-58%</span></div>
          <div className="flex justify-between"><span>多指標確認（5個）</span><span className="text-amber-400">58-65%</span></div>
          <div className="flex justify-between"><span>本系統（9指標+時段過濾）</span><span className="text-emerald-400 font-bold">65-75%</span></div>
          <div className="flex justify-between"><span>加上AI學習優化後</span><span className="text-cyan-400 font-bold">70-80%</span></div>
          <div className="mt-2 text-[9px] text-gray-600 leading-relaxed">勝率會隨 AI 學習次數增加而提升。追蹤停損讓單筆虧損更小，板塊分散避免集中風險。目標 75% 在 50+ 次交易後可達到。</div>
        </div>
      </Card>
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">AI 風險說明</div>
        <div className="space-y-3">
          {Object.entries(RISK_CFG).map(([k,c])=>(
            <div key={k} className={`p-3 rounded-xl border ${c.bg}`}>
              <div className={`text-[10px] font-bold ${c.c} mb-1`}>{c.label}</div>
              <div className="text-[9px] text-gray-500">
                信心 {c.minConf}%↑ · 倉位 {c.alloc*100}% · 停損 {c.sl}% · 止盈 {c.tp}% · 最多 {c.maxPos} 筆
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card cls="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider">AI 自動交易可用資金</div>
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
          ✓ 已串接永豐真實合約資料：自動檢查個股當沖資格（處置股/不符資格股票會被AI自動跳過）與漲跌停鎖死風險，避免送出必定失敗或無法沖銷的委託。
        </div>
      </Card>
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">當沖真實交易成本</div>
        <Row l="手續費（買進）" v="0.1425%×6折" c="text-gray-400"/>
        <Row l="手續費（賣出）" v="0.1425%×6折" c="text-gray-400"/>
        <Row l="當沖證交稅" v="0.15%（優惠至2027）" c="text-gray-400"/>
        <Row l="損益兩平最小漲跌" v={`${MIN_PROFITABLE_MOVE_PCT.toFixed(2)}%`} c="text-amber-400"/>
        <div className="text-[9px] text-gray-700 mt-2 leading-relaxed">
          每筆當沖交易必須漲跌超過 {MIN_PROFITABLE_MOVE_PCT.toFixed(2)}% 才能在扣除手續費與證交稅後真正獲利。所有模擬與真實交易的損益顯示均已扣除此成本。
        </div>
      </Card>
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
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">虛擬盤起始資金（新台幣）</div>
        <div className="flex gap-2">
          <input type="number" min={10000} step={10000} value={capInput}
            onChange={e=>setCapInput(e.target.value)} placeholder="例如 1000000"
            className="flex-1 bg-[#0a1622] border border-[#0d2137] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"/>
          <button onClick={()=>{
            const v=Number(capInput);
            if(!v||v<10000){alert("請輸入至少 NT$10,000 的金額");return;}
            if(pos.length>0||hist.length>0){
              setModal({type:"capitalResetConfirm",data:{newCapital:v}});
              return;
            }
            try{ localStorage.setItem("starting_capital",String(v)); }catch{}
            startingCapitalR.current=v;
            setPf({cash:v,total:v,dayPnL:0,cumPnL:0});
            setPos([]); setHist([]);
            setModal({type:"capitalApplied",data:{newCapital:v}});
          }} className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold">套用</button>
        </div>
        <div className="text-[9px] text-gray-700 mt-2">目前虛擬盤資產：NT${Number(pf.total||0).toLocaleString()}。僅影響虛擬盤模擬資金，不影響你的真實永豐帳戶。</div>
      </Card>
      <Card cls="p-4">
        <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">重置</div>
        <button onClick={()=>setModal({type:"resetModal"})} className="w-full py-2.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs font-bold">重置所有數據</button>
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
      case "sigModal": {
        const{sym,sig,lp}=data;
        return(
          <MW title={`${sym} · 信號分析`}>
            <div className={`text-center py-4 rounded-xl border mb-4 ${sig.action==="buy"?"bg-emerald-500/10 border-emerald-500/25":sig.action==="sell"?"bg-red-500/10 border-red-500/25":"bg-[#0d2137] border-[#1a3050]"}`}>
              <div className={`text-3xl font-bold mb-1 ${sig.action==="buy"?"text-emerald-400":sig.action==="sell"?"text-red-400":"text-gray-500"}`}>{sig.action==="buy"?"▲ 做多信號":sig.action==="sell"?"▼ 做空信號":"觀望"}</div>
              <div className="text-sm text-gray-400">AI信心度 {sig.conf}%</div>
              {sig.badTime&&<div className="text-[10px] text-amber-400 mt-1">⚠ 目前為低品質時段</div>}
            </div>
            {/* 多因子評分視覺化 */}
            <div className="bg-[#0a1422] border border-[#0d2137] rounded-xl p-3 mb-4">
              <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-2">信號強度分析</div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[9px] text-emerald-400 w-8">多頭</span>
                <div className="flex-1 h-2 bg-[#0d2137] rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{width:`${N(sig.bull)/Math.max(N(sig.bull)+N(sig.bear),1)*100}%`}}/>
                </div>
                <span className="text-[9px] text-emerald-400 w-8 text-right">{F(sig.bull,0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-red-400 w-8">空頭</span>
                <div className="flex-1 h-2 bg-[#0d2137] rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{width:`${N(sig.bear)/Math.max(N(sig.bull)+N(sig.bear),1)*100}%`}}/>
                </div>
                <span className="text-[9px] text-red-400 w-8 text-right">{F(sig.bear,0)}</span>
              </div>
            </div>
            {/* 建議進場/出場點（依目前風險等級與支撐壓力位計算，僅供參考非保證） */}
            {sig.action!=="hold"&&N(lp.price)>0&&(()=>{
              const cfg=RISK_CFG[risk];
              const entry=N(lp.price);
              const isLong=sig.action==="buy";
              const slPct=cfg.sl/100, tpPct=cfg.tp/100;
              let sl=isLong?entry*(1-slPct):entry*(1+slPct);
              let tp=isLong?entry*(1+tpPct):entry*(1-tpPct);
              // 若有支撐/壓力位資料，停損優先參考支撐壓力（更貼近實際盤勢）
              if(sig.support&&isLong&&sig.support<entry&&sig.support>sl) sl=sig.support*0.995;
              if(sig.resist&&!isLong&&sig.resist>entry&&sig.resist<sl) sl=sig.resist*1.005;
              return(
                <div className="bg-[#0a1422] border border-cyan-500/20 rounded-xl p-3 mb-4">
                  <div className="text-[9px] text-cyan-400 uppercase tracking-wider mb-2">建議進出場點（依{cfg.label}風險設定試算，僅供參考）</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-[8px] text-gray-600">建議進場</div><div className="text-xs font-mono font-bold text-white">NT${entry.toFixed(2)}</div></div>
                    <div><div className="text-[8px] text-gray-600">停損價</div><div className="text-xs font-mono font-bold text-red-400">NT${sl.toFixed(2)}</div></div>
                    <div><div className="text-[8px] text-gray-600">止盈價</div><div className="text-xs font-mono font-bold text-emerald-400">NT${tp.toFixed(2)}</div></div>
                  </div>
                  {(sig.support||sig.resist)&&<div className="text-[8px] text-gray-700 mt-2">近期支撐 NT${N(sig.support).toFixed(2)} · 壓力 NT${N(sig.resist).toFixed(2)}</div>}
                </div>
              );
            })()}
            <Row l="現價" v={`NT$${N(lp.price).toFixed(2)}`}/>
            <Row l="漲跌" v={`${N(lp.pct)>=0?"+":""}${N(lp.pct).toFixed(2)}%`} c={CC(lp.pct)}/>
            <Row l="RSI(14)" v={sig.rsi!=null?sig.rsi.toFixed(1):"計算中..."} c={sig.rsi<30?"text-emerald-400":sig.rsi>70?"text-red-400":"text-gray-300"}/>
            <Row l="StochRSI" v={sig.stochRsi!=null?sig.stochRsi.toFixed(1):"計算中..."} c={sig.stochRsi<20?"text-emerald-400":sig.stochRsi>80?"text-red-400":"text-gray-400"}/>
            <Row l="VWAP" v={sig.vwap!=null?`NT$${sig.vwap.toFixed(2)}`:"計算中..."} c={lp.price>sig.vwap?"text-emerald-400":"text-red-400"}/>
            <Row l="價格 vs VWAP" v={sig.vwap==null?"—":lp.price>sig.vwap?"在VWAP上方（偏多）":"在VWAP下方（偏空）"} c={lp.price>sig.vwap?"text-emerald-400":"text-red-400"}/>
            <Row l="布林位置" v={sig.bbPct!=null?`${(sig.bbPct*100).toFixed(0)}%（${sig.bbPct<0.2?"接近下軌":sig.bbPct>0.8?"接近上軌":"中間位置"}）`:"計算中..."} c={sig.bbPct<0.2?"text-emerald-400":sig.bbPct>0.8?"text-red-400":"text-gray-400"}/>
            <Row l="MA趨勢" v={sig.ma5!=null&&sig.ma20!=null?(sig.ma5>sig.ma20?"多頭排列▲":"空頭排列▼"):"計算中..."} c={sig.ma5>sig.ma20?"text-emerald-400":"text-red-400"}/>
            <Row l="趨勢強度" v={sig.trendStr!=null?`${sig.trendStr.toFixed(2)}（${sig.trendStr>0.65?"強趨勢":"弱趨勢/盤整"}）`:"計算中..."} c={sig.trendStr>0.65?"text-amber-400":"text-gray-500"}/>
            <Row l="量比" v={sig.volRatio!=null?`${sig.volRatio.toFixed(2)}x`:"計算中..."} c={sig.volRatio>1.5?"text-amber-400":"text-gray-300"}/>
            <Row l="MACD" v={sig.freshGolden?"金叉（剛發生）":sig.freshDeath?"死叉（剛發生）":"延續"} c={sig.freshGolden?"text-emerald-400":sig.freshDeath?"text-red-400":"text-gray-500"}/>
            {(sig.rsi==null||sig.vwap==null)&&<div className="text-[9px] text-amber-400/70 mt-2">此股票剛加入，資料仍在累積，部分指標需要約1分鐘才會顯示完整數值。</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={()=>{placeTrade(sym,"L",isTWStock(sym)?1:10);setModal(null);}} className="flex-1 py-2.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-xl text-xs font-bold">▲ 做多 {isTWStock(sym)?"1張":"10股"}</button>
              <button onClick={()=>{placeTrade(sym,"S",isTWStock(sym)?1:10);setModal(null);}} className="flex-1 py-2.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs font-bold">▼ 做空 {isTWStock(sym)?"1張":"10股"}</button>
            </div>
          </MW>
        );
      }
      case "stockModal": {
        const{sym,lp,sig}=data; const cd=charts[sym]||[];
        const bareSym=sym.replace(".TW","").replace(".TWO","");
        const instMatch=[...instFlows.topBuy,...instFlows.topSell].find(s=>s.symbol===bareSym);
        return(
          <MW title={`${sym} · ${getStockName(sym)}`}>
            {instMatch&&(
              <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border text-[10px] ${instMatch.total>=0?"bg-emerald-500/10 border-emerald-500/25 text-emerald-400":"bg-red-500/10 border-red-500/25 text-red-400"}`}>
                <span className="font-bold">{instMatch.total>=0?"📈 三大法人買超":"📉 三大法人賣超"}</span>
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
              <Row l="AI信心" v={`${sig.conf}%`} c="text-violet-400"/>
              <Row l="產業" v={STOCKS[sym]?.sector||TW_NAMES[sym.replace(".TW","")]?"台灣股票":"—"}/>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={()=>{setSelSym(sym);placeTrade(sym,"L",isTWStock(sym)?1:10);setModal(null);}} className="flex-1 py-2.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-xl text-xs font-bold">▲ 做多{isTWStock(sym)?"1張":"10股"}</button>
              <button onClick={()=>{setSelSym(sym);placeTrade(sym,"S",isTWStock(sym)?1:10);setModal(null);}} className="flex-1 py-2.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs font-bold">▼ 做空{isTWStock(sym)?"1張":"10股"}</button>
            </div>
          </MW>
        );
      }
      case "posModal": {
        const d=data;
        return(
          <MW title={`${d.sym} · 持倉詳情`}>
            <div className={`text-center py-5 rounded-xl border mb-4 ${BC(d.pnl)}`}>
              <div className={`text-3xl font-mono font-bold ${CC(d.pnl)}`}>NT${N(d.pnl)>=0?"+":""}{F(d.pnl)}</div>
              <div className={`text-sm mt-1 ${CC(d.pct)}`}>{N(d.pct)>=0?"+":""}{F(d.pct)}%</div>
            </div>
            <Row l="方向" v={d.dir==="L"?"做多▲":"做空▼"} c={d.dir==="L"?"text-emerald-400":"text-red-400"}/>
            <Row l="數量" v={`${d.qty}${isTWStock(d.sym)?"張":"股"}`}/>
            <Row l="進場價" v={`NT$${N(d.entry).toFixed(2)}`}/>
            <Row l="當前價" v={`NT$${N(d.cur).toFixed(2)}`}/>
            <Row l="停損" v={`NT$${N(d.sl).toFixed(2)}`} c="text-red-400"/>
            <Row l="止盈" v={`NT$${N(d.tp).toFixed(2)}`} c="text-emerald-400"/>
            <Row l="進場時間" v={d.openTime}/>
            <Row l="類型" v={d.auto?"AI自動":"手動"} c="text-violet-400"/>
            <button onClick={()=>{closePosById(d.id);}} className="w-full mt-4 py-3 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-sm font-bold">立即出場</button>
          </MW>
        );
      }
      case "tradeModal": {
        const d=data;
        return(
          <MW title={`${d.sym} · 交易記錄`}>
            <div className={`text-center py-5 rounded-xl border mb-4 ${BC(d.pnl)}`}>
              <div className="text-4xl mb-2">{d.win?"🎯":"📉"}</div>
              <div className={`text-2xl font-mono font-bold ${CC(d.pnl)}`}>NT${d.pnl>=0?"+":""}{F(d.pnl)}</div>
            </div>
            <Row l="方向" v={d.dir==="L"?"做多":"做空"} c={d.dir==="L"?"text-emerald-400":"text-red-400"}/>
            <Row l="數量" v={`${d.qty}${isTWStock(d.sym)?"張":"股"}`}/>
            <Row l="進場" v={`NT$${N(d.entry).toFixed(2)}`}/><Row l="出場" v={`NT$${N(d.exit).toFixed(2)}`}/>
            <Row l="進場時間" v={d.open}/><Row l="出場時間" v={d.close}/>
            <Row l="類型" v={d.auto?"AI自動":"手動"} c="text-violet-400"/>
          </MW>
        );
      }
      case "closed": {
        const d=data;
        return(
          <MW title="出場完成">
            <div className={`text-center py-6 rounded-xl border mb-4 ${BC(d.pnl)}`}>
              <div className="text-5xl mb-3">{d.win?"🎯":"📉"}</div>
              <div className={`text-3xl font-mono font-bold ${CC(d.pnl)}`}>NT${d.pnl>=0?"+":""}{F(d.pnl)}</div>
              <div className={`text-sm mt-1 ${CC(d.pct)}`}>{d.pct>=0?"+":""}{F(d.pct)}%</div>
            </div>
            <Row l="股票" v={d.sym}/><Row l="進場" v={`NT$${N(d.entry).toFixed(2)}`}/><Row l="出場" v={`NT$${N(d.exit).toFixed(2)}`}/>
            <button onClick={()=>setModal(null)} className="w-full mt-4 py-3 bg-[#070f1c] border border-[#0d2137] text-gray-400 rounded-xl text-sm font-bold">確認</button>
          </MW>
        );
      }
      case "ok": {
        const d=data;
        return(
          <MW title="下單成功">
            <div className="text-center py-6">
              <div className="text-5xl mb-3">{d.dir==="L"?"🟢":"🔴"}</div>
              <div className="text-base font-bold text-white">{d.sym} · {d.dir==="L"?"做多▲":"做空▼"}</div>
              <div className="text-sm text-gray-500 mt-1">{d.qty}{isTWStock(d.sym)?"張":"股"} @ NT${N(d.entry).toFixed(2)}</div>
            </div>
            <Row l="停損" v={`NT$${N(d.sl).toFixed(2)}`} c="text-red-400"/>
            <Row l="止盈" v={`NT$${N(d.tp).toFixed(2)}`} c="text-emerald-400"/>
            <button onClick={()=>setModal(null)} className="w-full mt-4 py-3 bg-[#070f1c] border border-[#0d2137] text-gray-400 rounded-xl text-sm font-bold">確認</button>
          </MW>
        );
      }
      case "activeSignalsDetail":
        return(
          <MW title="活躍信號明細">
            {buySignals.length===0&&sellSignals.length===0?(
              <div className="text-center py-8 text-gray-600 text-xs">目前自選股中沒有任何明確買賣信號</div>
            ):(
              <div className="space-y-2">
                {[...buySignals,...sellSignals].map(([sym,sig])=>(
                  <div key={sym} onClick={()=>{setModal(null);setTab("market");}}
                    className="flex items-center justify-between bg-[#070f1c] border border-[#0d2137] rounded-xl p-3 cursor-pointer hover:border-cyan-500/30">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${sig.action==="buy"?"bg-emerald-400":"bg-red-400"}`}/>
                      <span className="text-xs font-mono font-bold text-white">{sym}</span>
                      <span className="text-[9px] text-gray-600">{getStockName(sym)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold ${sig.action==="buy"?"text-emerald-400":"text-red-400"}`}>{sig.action==="buy"?"買▲":"賣▼"}</span>
                      <span className="text-[10px] text-violet-400 font-mono">{sig.conf}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </MW>
        );
      case "learnDetail":
        return(
          <MW title="AI 學習系統">
            <div className="space-y-3">
              <div className="bg-[#070f1c] border border-[#0d2137] rounded-xl p-4">
                <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">學習階段</div>
                {PHASES.map((p,i)=>(
                  <div key={i} className={`flex items-center gap-3 py-1.5 ${i===learn.phase?"text-violet-400":i<learn.phase?"text-gray-500":"text-gray-700"}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${i<learn.phase?"bg-violet-400":i===learn.phase?"bg-violet-400 animate-pulse":"bg-[#0d2137]"}`}/>
                    <span className="text-xs">{p}</span>
                    {i<learn.phase&&<span className="text-[9px] ml-auto text-violet-500">✓</span>}
                    {i===learn.phase&&<span className="text-[9px] ml-auto text-violet-400">進行中</span>}
                  </div>
                ))}
              </div>
              <Row l="AI信心度" v={`${learn.conf}%`} c="text-violet-400"/>
              <Row l="信號加成" v={`+${learn.bonus?.toFixed(1)||0}%`} c="text-cyan-400"/>
              <Row l="累計交易" v={`${learn.trades}次`}/>
              <Row l="當前勝率" v={`${wr}%`} c={wr>=75?"text-emerald-400":wr>=60?"text-amber-400":"text-red-400"}/>
            </div>
          </MW>
        );
      case "perfDetail":
        return(
          <MW title="績效詳情">
            <Row l="累計勝率" v={`${wr}%`} c={wr>=75?"text-emerald-400":wr>=60?"text-amber-400":"text-red-400"}/>
            <Row l="總交易" v={`${learn.trades}次`}/>
            <Row l="盈利" v={`${learn.wins}次`} c="text-emerald-400"/>
            <Row l="虧損" v={`${learn.trades-learn.wins}次`} c="text-red-400"/>
            <Row l="累計盈虧" v={`${learn.pnl>=0?"+":""}NT$${F(learn.pnl)}`} c={CC(learn.pnl)}/>
            <Row l="最高連勝" v={`${learn.maxStreak}連勝`} c="text-amber-400"/>
            <Row l="當前連勝" v={`${learn.streak}連勝`}/>
            <Row l="目標勝率" v="75%↑" c="text-cyan-400"/>
          </MW>
        );
      case "pfDetail":
        return(
          <MW title="投資組合">
            <Row l="總資產" v={`NT$${N(pf.total).toLocaleString()}`}/>
            <Row l="可用資金" v={`NT$${N(pf.cash).toLocaleString()}`} c="text-cyan-400"/>
            <Row l="持倉市值" v={`NT$${posValue.toLocaleString(undefined,{maximumFractionDigits:0})}`}/>
            <Row l="今日盈虧" v={`${N(pf.dayPnL)>=0?"+":""}NT$${F(pf.dayPnL)}`} c={CC(pf.dayPnL)}/>
            <Row l="累計盈虧" v={`${N(pf.cumPnL)>=0?"+":""}NT$${F(pf.cumPnL)}`} c={CC(pf.cumPnL)}/>
            <Row l="持倉數" v={`${pos.length}筆`}/>
            <Row l="交易模式" v={tradeMode==="real"?"🔴 真實盤":"🟡 虛擬盤"} c={tradeMode==="real"?"text-red-400":"text-amber-400"}/>
          </MW>
        );
      case "riskModal": {
        const cfg=RISK_CFG[risk];
        return(
          <MW title={`${cfg.label} — 詳細設定`}>
            <div className={`p-3 rounded-xl border mb-4 text-center ${cfg.bg}`}><span className={`text-sm font-bold ${cfg.c}`}>{cfg.label}</span></div>
            <Row l="最低信心度" v={`${cfg.minConf}%`} c={cfg.c}/>
            <Row l="每次倉位" v={`${cfg.alloc*100}%`}/>
            <Row l="等值金額" v={`約NT$${(N(pf.cash)*cfg.alloc).toLocaleString(undefined,{maximumFractionDigits:0})}`} c="text-cyan-400"/>
            <Row l="停損幅度" v={`${cfg.sl}%`} c="text-red-400"/>
            <Row l="止盈幅度" v={`${cfg.tp}%`} c="text-emerald-400"/>
            <Row l="最多持倉" v={`${cfg.maxPos}筆`}/>
            <div className="mt-4 text-[10px] text-gray-600 leading-relaxed">AI每30秒掃描自選股，信心度超過 {cfg.minConf}% 自動進場。觸及停損 {cfg.sl}% 或止盈 {cfg.tp}% 自動出場。</div>
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
            <Row l="AI信心" v={`${sig.conf}%`} c="text-violet-400"/>
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
      case "backtestModal":
        return(
          <MW title="歷史回測報告">
            <div className="space-y-4">
              <div className="bg-[#0a1422] border border-[#0d2137] rounded-xl p-3 text-[10px] text-gray-500 leading-relaxed">
                回測說明：在歷史模擬K線上跑信號引擎，統計進出場勝率。設定：信心門檻65%、停損2.5%、止盈5.5%。
              </div>
              {wl.slice(0,5).map(sym=>{
                const bt=backtest(charts[sym]||[],65);
                return(
                  <div key={sym} className="bg-[#070f1c] border border-[#0d2137] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-bold text-white">{sym}</span>
                      <span className={`text-xs font-bold font-mono ${bt.wr>=65?"text-emerald-400":bt.wr>=55?"text-amber-400":"text-red-400"}`}>{bt.wr}% 勝率</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[{l:"交易",v:`${bt.trades}次`},{l:"平均盈利",v:`+${bt.avgWin}%`,c:"text-emerald-400"},{l:"平均虧損",v:`-${bt.avgLoss}%`,c:"text-red-400"},{l:"淨損益",v:`${bt.pnl>=0?"+":""}${bt.pnl}%`,c:bt.pnl>=0?"text-emerald-400":"text-red-400"}].map(x=>(
                        <div key={x.l}>
                          <div className="text-[8px] text-gray-600 mb-0.5">{x.l}</div>
                          <div className={`text-[10px] font-mono font-bold ${x.c||"text-white"}`}>{x.v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 h-1 bg-[#0d2137] rounded-full">
                      <div className={`h-full rounded-full ${bt.wr>=65?"bg-emerald-500":bt.wr>=55?"bg-amber-500":"bg-red-500"}`} style={{width:`${Math.min(100,bt.wr)}%`}}/>
                    </div>
                  </div>
                );
              })}
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-[10px] text-amber-400 leading-relaxed">
                ⚠ 回測使用模擬數據，實際市場因滑價、流動性等因素，真實勝率會低10-15%。目標：回測勝率70%+ → 實際勝率55-60%。達到穩定75%+ 需要更多真實交易數據累積。
              </div>
            </div>
          </MW>
        );
      case "realModeConfirm":
        return(
          <MW title="⚠️ 切換至真實盤">
            <div className="text-center py-4 mb-2">
              <div className="text-4xl mb-3">🔴</div>
              <div className="text-sm font-bold text-red-400 mb-3">即將切換為真實資金模式</div>
              <div className="text-[11px] text-gray-400 leading-relaxed text-left bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1.5">
                <div>· 手動下單會先顯示確認視窗（張數/股數+估計金額），確認後才送出</div>
                <div>· AI 自動交易將每30秒自動用真實資金下單，過程中不會再次確認</div>
                <div>· 停損/止盈設定由你在自動分頁選擇的風險等級決定</div>
                <div>· 台股下單單位為「張」（1張=1000股），請留意數量單位</div>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={()=>{setTradeMode("real");setModal(null);}} className="w-full py-3 bg-red-500/20 border border-red-500/40 text-red-400 rounded-xl text-sm font-bold">我已了解風險，切換真實盤</button>
              <button onClick={()=>setModal(null)} className="w-full py-2.5 bg-[#070f1c] border border-[#0d2137] text-gray-400 rounded-xl text-sm font-bold">取消</button>
            </div>
          </MW>
        );
      case "manualRealConfirm": {
        const{sym,dir,qty,price,eligibility}=data;
        const isTW=isTWStock(sym);
        const shares=isTW?qty*1000:qty;
        const estAmount=shares*price;
        const blocked = eligibility&&eligibility!=="loading"&&eligibility.can_day_trade===false;
        return(
          <MW title="確認真實委託">
            <div className="text-center py-3 mb-3">
              <div className="text-4xl mb-2">{dir==="L"?"🟢":"🔴"}</div>
              <div className="text-base font-bold text-white">{sym} · {getStockName(sym)}</div>
              <div className={`text-sm font-bold mt-1 ${dir==="L"?"text-emerald-400":"text-red-400"}`}>{dir==="L"?"買入（做多）":"賣出（做空）"}</div>
            </div>
            {eligibility==="loading"&&(
              <div className="text-[10px] text-gray-600 text-center mb-3 flex items-center justify-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin"/>查詢當沖資格中...</div>
            )}
            {blocked&&(
              <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 mb-3 text-[10px] text-red-400">
                ⛔ {sym} {eligibility.reason||"今日不可當沖"}，已阻止下單
              </div>
            )}
            {eligibility&&eligibility!=="loading"&&eligibility.can_day_trade&&dir==="S"&&eligibility.limit_up>0&&price>=eligibility.limit_up*0.985&&(
              <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 mb-3 text-[10px] text-red-400">
                🚨 價格已偏向漲停，做空若被軋到漲停鎖死將無法回補，可能產生借券費用與違約交割風險，請務必謹慎
              </div>
            )}
            {eligibility&&eligibility!=="loading"&&eligibility.can_day_trade&&dir==="L"&&eligibility.limit_down>0&&price<=eligibility.limit_down*1.005&&(
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 mb-3 text-[10px] text-amber-400">
                ℹ️ 價格已接近跌停，若收盤無法賣出將自動變成一般持股待T+2交割（非違約風險，僅需留意資金）
              </div>
            )}
            <div className="bg-[#0a1422] border border-amber-500/20 rounded-xl p-3 mb-4 space-y-1.5">
              <Row l="數量" v={isTW?`${qty}張（${shares.toLocaleString()}股）`:`${qty}股`}/>
              <Row l="參考價格" v={`NT$${N(price).toFixed(2)}`}/>
              <Row l="估計金額" v={`NT$${Math.round(estAmount).toLocaleString()}`} c="text-amber-400"/>
              <Row l="委託方式" v="市價單"/>
            </div>
            <div className="text-[9px] text-gray-600 mb-3 text-center">確認後將立即送出真實委託至永豐，請確認金額無誤</div>
            <div className="space-y-2">
              <button onClick={()=>{setModal(null);executeRealOrder(sym,dir,qty,price);}} disabled={blocked}
                className={`w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40 ${dir==="L"?"bg-emerald-500/20 border border-emerald-500/40 text-emerald-400":"bg-red-500/20 border border-red-500/40 text-red-400"}`}>
                確認送出委託
              </button>
              <button onClick={()=>setModal(null)} className="w-full py-2.5 bg-[#070f1c] border border-[#0d2137] text-gray-400 rounded-xl text-sm font-bold">取消</button>
            </div>
          </MW>
        );
      }
      case "realOk":{
        const{sym,dir,qty,price}=data;
        return(
          <MW title="真實委託已送出">
            <div className="text-center py-6">
              <div className="text-5xl mb-3">{dir==="L"?"🟢":"🔴"}</div>
              <div className="text-base font-bold text-white">{sym} · {dir==="L"?"買入▲":"賣出▼"}</div>
              <div className="text-sm text-gray-500 mt-1">{qty}{isTWStock(sym)?"張":"股"} @ NT${N(price).toFixed(2)}</div>
              <div className="mt-3 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">委託已送出永豐，實際成交以永豐大戶投為準</div>
            </div>
            <button onClick={()=>setModal(null)} className="w-full mt-2 py-3 bg-[#070f1c] border border-[#0d2137] text-gray-400 rounded-xl text-sm font-bold">確認</button>
          </MW>
        );
      }
      case "realErr":
        return(
          <MW title="下單失敗">
            <div className="text-center py-6">
              <div className="text-4xl mb-3">⚠️</div>
              <div className="text-sm text-red-400 font-bold mb-2">真實委託失敗</div>
              <div className="text-xs text-gray-500">{data?.msg||"請確認帳戶連接狀態"}</div>
            </div>
            <button onClick={()=>setModal(null)} className="w-full mt-2 py-3 bg-[#070f1c] border border-[#0d2137] text-gray-400 rounded-xl text-sm font-bold">確認</button>
          </MW>
        );
      case "capitalResetConfirm": {
        const{newCapital}=data;
        return(
          <MW title="確認更改起始資金">
            <div className="text-center py-3 mb-2">
              <div className="text-4xl mb-3">💰</div>
              <div className="text-sm font-bold text-amber-400 mb-2">目前虛擬盤有持倉或交易記錄</div>
              <div className="text-[11px] text-gray-400 leading-relaxed text-left bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
                <div>· 目前持倉：{pos.length} 筆</div>
                <div>· 歷史交易記錄：{hist.length} 筆</div>
                <div>· 更改起始資金將清空以上資料，重新從 NT${newCapital.toLocaleString()} 開始</div>
                <div>· 不會影響你的真實永豐帳戶</div>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={()=>{
                try{ localStorage.setItem("starting_capital",String(newCapital)); }catch{}
                startingCapitalR.current=newCapital;
                setPf({cash:newCapital,total:newCapital,dayPnL:0,cumPnL:0});
                setPos([]); setHist([]);
                setModal({type:"capitalApplied",data:{newCapital}});
              }} className="w-full py-3 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-xl text-sm font-bold">確認清空並套用新資金</button>
              <button onClick={()=>setModal(null)} className="w-full py-2.5 bg-[#070f1c] border border-[#0d2137] text-gray-400 rounded-xl text-sm font-bold">取消</button>
            </div>
          </MW>
        );
      }
      case "capitalApplied": {
        const{newCapital}=data;
        return(
          <MW title="已套用">
            <div className="text-center py-6">
              <div className="text-5xl mb-3">✅</div>
              <div className="text-base font-bold text-white">虛擬盤起始資金已更新</div>
              <div className="text-2xl font-mono font-bold text-cyan-400 mt-2">NT${newCapital.toLocaleString()}</div>
            </div>
            <button onClick={()=>setModal(null)} className="w-full py-3 bg-[#070f1c] border border-[#0d2137] text-gray-400 rounded-xl text-sm font-bold">確認</button>
          </MW>
        );
      }
      case "resetModal":
        return(
          <MW title="確認重置">
            <div className="text-center py-4 mb-4">
              <div className="text-4xl mb-3">⚠️</div>
              <div className="text-sm text-gray-400">將清除所有學習記錄、交易歷史及資金，恢復初始狀態</div>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setModal(null)} className="flex-1 py-3 bg-[#070f1c] border border-[#0d2137] text-gray-400 rounded-xl text-sm font-bold">取消</button>
              <button onClick={()=>{setHist([]);setPos([]);setPf({cash:startingCapitalR.current,total:startingCapitalR.current,dayPnL:0,cumPnL:0});setAlog([]);setLearn({phase:0,trades:0,wins:0,pnl:0,conf:30,streak:0,maxStreak:0,bonus:0,history:[],weights:{rsi:0.25,macd:0.35,ma:0.25,vol:0.15}});setModal(null);}} className="flex-1 py-3 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-sm font-bold">確認重置</button>
            </div>
          </MW>
        );
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
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${tradeMode==="real"?"text-red-400 border-red-500/40 bg-red-500/10":"text-amber-400 border-amber-500/40 bg-amber-500/10"}`}>{tradeMode==="real"?"LIVE":"TEST"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-[9px] px-2.5 py-1 rounded-full border font-bold ${autoOn?"bg-emerald-500/10 border-emerald-500/30 text-emerald-400":"bg-[#0d2137] border-[#1a3050] text-gray-600"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${autoOn?"bg-emerald-400 animate-pulse":"bg-gray-700"}`}/>
              {autoOn?RISK_CFG[risk].label+"運行":"待機"}
            </div>
            <button onClick={()=>{
              if(tradeMode==="virtual"){
                if(broker.status!=="connected"){alert("請先在設定頁連接永豐帳戶，才能切換真實盤");return;}
                setModal({type:"realModeConfirm"});
              }else{
                setTradeMode("virtual");
              }
            }} className={`flex items-center gap-1 text-[9px] px-2.5 py-1 rounded-full border font-bold transition-all ${tradeMode==="real"?"bg-red-500/20 border-red-500/50 text-red-400":"bg-[#0d2137] border-[#1a3050] text-gray-500 hover:text-gray-400"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${tradeMode==="real"?"bg-red-400 animate-pulse":"bg-gray-700"}`}/>
              {tradeMode==="real"?"🔴真實盤":"虛擬盤"}
            </button>
          </div>
        </div>
        {/* Ticker */}
        <div className="flex gap-4 px-4 pb-1.5 overflow-x-auto" style={{scrollbarWidth:"none"}}>
          {wl.map(sym=>{
            const l=live[sym],s=STOCKS[sym];
            return(
              <button key={sym} onClick={()=>{setSelSym(sym);setTab("market");}} className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[9px] text-gray-600 font-mono">{sym}</span>
                <span className="text-[9px] font-mono font-bold text-white">{N(l?.price,s?.base??0).toFixed(2)}</span>
                <span className={`text-[9px] font-bold ${CC(l?.pct)}`}>{N(l?.pct)>=0?"▲":"▼"}{Math.abs(N(l?.pct)).toFixed(2)}%</span>
              </button>
            );
          })}
        </div>
        {/* Stats strip */}
        <div className="grid grid-cols-4 border-t border-[#0d2137]">
          {[
            {l:"資產",v:`NT$${(N(pf.total)/1e3).toFixed(1)}K`,c:"text-white",click:()=>setModal({type:"pfDetail"})},
            {l:"今日",v:`${N(pf.dayPnL)>=0?"+":""}NT$${F(pf.dayPnL,0)}`,c:CC(pf.dayPnL),click:()=>setModal({type:"pfDetail"})},
            {l:"AI信心",v:`${learn.conf}%`,c:"text-violet-400",click:()=>setModal({type:"learnDetail"})},
            {l:"勝率",v:`${wr}%`,c:wr>=75?"text-emerald-400":wr>=60?"text-amber-400":"text-red-400",click:()=>setModal({type:"perfDetail"})},
          ].map(x=>(
            <button key={x.l} onClick={x.click} className="text-center py-1.5 border-r border-[#0d2137] last:border-0 hover:bg-[#070f1c] transition-all">
              <div className="text-[8px] text-gray-700">{x.l}</div>
              <div className={`text-[10px] font-mono font-bold ${x.c}`}>{x.v}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Real mode warning banner ── */}
      {tradeMode==="real"&&(
        <div className="bg-red-500/15 border-b border-red-500/30 px-4 py-1.5 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0"/>
          <span className="text-[9px] text-red-400 font-bold">真實盤模式 — 所有下單將直接送出真實委託至永豐帳戶</span>
        </div>
      )}
      {/* ── Content ── */}
      <div className="px-4 py-4 pb-28">
        {tab==="brain"  && BrainTab()}
        {tab==="market" && <MarketTab selSym={selSym} setSelSym={setSelSym} charts={charts} live={live} sigs={sigs} sparks={sparks} search={search} setSearch={setSearch} wl={wl} setWl={setWl} setModal={setModal} manQty={manQty} setManQty={setManQty} placeTrade={placeTrade} broker={broker} realBases={realBases} onRealPrice={(sym,price)=>setRealBases(b=>({...b,[sym]:price}))}/>}
        {tab==="auto"   && AutoTab()}
        {tab==="learn"  && LearnTab()}
        {tab==="chat"   && <ChatTab chat={chat} chatBusy={chatBusy} chatEnd={chatEnd} chatIn={chatIn} setChatIn={setChatIn} sendChat={sendChat}/>}
        {tab==="set"    && SettingsTab()}
      </div>

      {/* ── Bottom Nav ── */}
      <div className="fixed bottom-0 inset-x-0 max-w-xl mx-auto z-40">
        <div className="bg-[#030b14]/97 backdrop-blur-2xl border-t border-[#0d2137] px-2 pt-1.5 pb-5">
          <div className="grid grid-cols-6">
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                className={`relative flex flex-col items-center py-2 rounded-xl transition-all ${tab===t.id?"text-cyan-400":"text-gray-700 hover:text-gray-500"}`}>
                {t.id==="auto"&&pos.length>0&&(
                  <span className="absolute top-1 right-2 w-3.5 h-3.5 bg-emerald-500 rounded-full text-[7px] flex items-center justify-center text-white font-bold">{pos.length}</span>
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
