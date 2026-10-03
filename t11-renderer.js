"use strict";
(async()=>{
  const qs=new URLSearchParams(location.search);
  const path=qs.get("manifest")||"/manifests/aapl-golden.json";
  const res=await fetch(path,{cache:"no-store"});
  if(!res.ok) throw new Error("Manifest fetch failed: "+res.status+" "+path);
  const M=await res.json();
  const required=["header1_html","topcharts_html","mainrow_html","info_html","decision_html","footer1_html","header2_html","p2grid_html","footer2_html"];
  if(!M.render||required.some(k=>typeof M.render[k]!=="string")) throw new Error("T11 manifest missing fixed render fields");
  const binds={header1:"header1_html",topcharts:"topcharts_html",mainrow:"mainrow_html",info:"info_html",decision:"decision_html",footer1:"footer1_html",header2:"header2_html",p2grid:"p2grid_html",footer2:"footer2_html"};
  for(const [id,key] of Object.entries(binds)){ const el=document.getElementById(id); if(!el) throw new Error("Missing fixed T11 slot "+id); el.innerHTML=M.render[key]; }
  function mk(id,cfg={}){
    const el=document.getElementById(id); if(!el) return;
    const data=cfg.data||[];
    if(!data.length){ el.innerHTML='<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#7aa8bc;font-size:12px">UNAVAILABLE / NOT APPLICABLE - NO SYNTHETIC CANDLES</div>'; return; }
    const chart=LightweightCharts.createChart(el,{width:el.clientWidth,height:el.clientHeight,layout:{background:{type:"solid",color:"#04131d"},textColor:"#bfd3dc",fontSize:10},grid:{vertLines:{color:"rgba(84,132,154,.18)"},horzLines:{color:"rgba(84,132,154,.18)"}},rightPriceScale:{borderColor:"#355c6e"},timeScale:{borderColor:"#355c6e",timeVisible:!!cfg.timeVisible,secondsVisible:false,rightOffset:2,barSpacing:cfg.barSpacing||8},crosshair:{mode:0},localization:{priceFormatter:p=>Number(p).toFixed(cfg.decimals??2)}});
    const s=chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:"#20e66c",downColor:"#ff4d5d",borderUpColor:"#20e66c",borderDownColor:"#ff4d5d",wickUpColor:"#20e66c",wickDownColor:"#ff4d5d",priceLineVisible:false,lastValueVisible:false});
    s.setData(data);
    (cfg.lines||[]).forEach(L=>s.createPriceLine({price:L.price,color:L.color||"#f6cb4a",lineWidth:L.width||1,lineStyle:L.style||0,axisLabelVisible:L.axisLabelVisible!==false,title:L.title||""}));
    chart.timeScale().fitContent();
  }
  const order=["m","w","d","h7","h4","h1","m15","main","p2daily"];
  for(const id of order) mk(id,(M.charts||{})[id]||{});
  window.__T11_MANIFEST__=M;
  window.__T11_RENDER_READY__=true;
})().catch(e=>{document.body.innerHTML='<pre style="color:#ff4e61;background:#031019;padding:24px;font:16px monospace">'+String(e.stack||e)+'</pre>';window.__T11_RENDER_ERROR__=String(e);});
