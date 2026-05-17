#!/usr/bin/env python3
"""Generate self-contained approval-analytics.html with embedded data."""
import json, os
from pathlib import Path

LOG = Path(os.path.expanduser('~/.openclaw/logs/approval.jsonl'))
OUT = Path(__file__).parent / 'approval-analytics.html'

records = []
if LOG.exists():
    with open(LOG) as f:
        for line in f:
            try: records.append(json.loads(line.strip()))
            except: pass

records.sort(key=lambda r: r.get('timestamp', ''), reverse=True)
data_json = json.dumps(records, ensure_ascii=False)

# fmt: off
HTML = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Policy Layer — Approval Analytics</title>
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; font-size: 14px; }
.header { padding: 16px 24px; border-bottom: 1px solid #21262d; display: flex; align-items: center; justify-content: space-between; }
.header h1 { font-size: 16px; font-weight: 600; color: #58a6ff; }
.header .meta { font-size: 12px; color: #8b949e; }
.dashboard { display: grid; grid-template-columns: 220px 1fr 240px; min-height: calc(100vh - 57px); }
.sidebar { padding: 16px; border-right: 1px solid #21262d; overflow-y: auto; }
.sidebar h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #8b949e; margin: 16px 0 8px; }
.sidebar h3:first-child { margin-top: 0; }
.stat-card { background: #161b22; border: 1px solid #21262d; border-radius: 6px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: border-color 0.15s; }
.stat-card:hover { border-color: #58a6ff; }
.stat-card .value { font-size: 24px; font-weight: 700; }
.stat-card .label { font-size: 11px; color: #8b949e; margin-top: 2px; }
.deny-card .value { color: #f85149; } .escalate-card .value { color: #d29922; } .approve-card .value { color: #3fb950; } .fast-card .value { color: #a371f7; }
.main { padding: 16px; overflow-y: auto; }
.chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.chart-card { background: #161b22; border: 1px solid #21262d; border-radius: 6px; padding: 12px; }
.chart-card h3 { font-size: 12px; color: #e6edf3; margin-bottom: 10px; font-weight: 500; }
.chart { display: flex; align-items: flex-start; justify-content: center; min-height: 130px; overflow-y: auto; max-height: 300px; }
.tl-card { background: #161b22; border: 1px solid #21262d; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
.tl-card h3 { font-size: 12px; color: #e6edf3; margin-bottom: 10px; font-weight: 500; }
.table-card { background: #161b22; border: 1px solid #21262d; border-radius: 6px; padding: 12px; }
.table-card h3 { font-size: 12px; color: #e6edf3; margin-bottom: 10px; font-weight: 500; }
.filter-bar { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.chip { font-size: 11px; padding: 3px 10px; border-radius: 12px; border: 1px solid #30363d; background: #21262d; color: #8b949e; cursor: pointer; }
.chip:hover, .chip.on { background: #1c2128; border-color: #58a6ff; color: #58a6ff; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { text-align: left; color: #8b949e; font-weight: 500; padding: 6px 8px; border-bottom: 1px solid #21262d; cursor: pointer; white-space: nowrap; }
th:hover { color: #e6edf3; }
td { padding: 6px 8px; border-bottom: 1px solid #161b22; }
tr:hover td { background: #1c2128; }
td.mono { font-family: 'Fira Code', monospace; font-size: 11px; color: #79c0ff; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.right { padding: 16px; border-left: 1px solid #21262d; overflow-y: auto; }
.right h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #8b949e; margin: 16px 0 8px; }
.event-item { background: #161b22; border: 1px solid #21262d; border-radius: 6px; padding: 10px; margin-bottom: 8px; cursor: pointer; }
.event-item:hover { border-color: #58a6ff; }
.event-item .ts { font-size: 10px; color: #8b949e; }
.event-item .cmd { font-size: 11px; font-family: 'Fira Code', monospace; color: #79c0ff; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 5px; }
.tag { font-size: 10px; padding: 1px 5px; border-radius: 3px; }
.tag-deny { background: rgba(248,81,73,0.2); color: #f85149; } .tag-escalate { background: rgba(210,153,34,0.2); color: #d29922; } .tag-approve { background: rgba(63,185,80,0.2); color: #3fb950; } .tag-fast_lane { background: rgba(163,113,247,0.2); color: #a371f7; } .tag-pat { background: rgba(88,166,255,0.15); color: #58a6ff; }
.drill-bar { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.drill-bar-label { font-size: 10px; color: #8b949e; width: 56px; flex-shrink: 0; }
.drill-bar-track { flex: 1; height: 5px; background: #21262d; border-radius: 3px; }
.drill-bar-fill { height: 100%; border-radius: 3px; }
.drill-bar-val { font-size: 10px; color: #8b949e; width: 18px; text-align: right; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; }
.dot-deny { background: #f85149; } .dot-escalate { background: #d29922; } .dot-approve { background: #3fb950; } .dot-fast_lane { background: #a371f7; }
.pattern-item { background: #161b22; border: 1px solid #21262d; border-radius: 6px; padding: 10px; margin-bottom: 6px; cursor: pointer; }
#drilldown, #top-risks { overflow-y: auto; max-height: 400px; padding-right: 4px; }
#drilldown::-webkit-scrollbar, #top-risks::-webkit-scrollbar { width: 4px; }
#drilldown::-webkit-scrollbar-thumb, #top-risks::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
.pattern-item:hover { border-color: #58a6ff; }
.pattern-item .pat-name { font-size: 11px; color: #58a6ff; }
.pattern-item .pat-count { font-size: 11px; color: #e6edf3; margin-top: 3px; }
</style>
</head>
<body>
<div class="header">
  <h1>Policy Layer — Approval Analytics</h1>
  <div class="meta" id="meta"></div>
</div>
<div class="dashboard">
  <div class="sidebar">
    <h3>Results</h3>
    <div class="stat-card deny-card" onclick="filter('deny')"><div class="value" id="s-deny">0</div><div class="label">Blocked (deny)</div></div>
    <div class="stat-card escalate-card" onclick="filter('escalate')"><div class="value" id="s-escalate">0</div><div class="label">Escalated</div></div>
    <div class="stat-card approve-card" onclick="filter('approve')"><div class="value" id="s-approve">0</div><div class="label">Approved</div></div>
    <div class="stat-card fast-card" onclick="filter('fast_lane')"><div class="value" id="s-fast_lane">0</div><div class="label">Fast Lane</div></div>
    <h3>Sessions</h3>
    <div id="sessions"></div>
    <h3>Top Risks (deny+escalate)</h3>
    <div id="top-risks"></div>
  </div>
  <div class="main">
    <div class="chart-row">
      <div class="chart-card"><h3>Result Distribution</h3><div class="chart" id="pie"></div></div>
      <div class="chart-card"><h3>Top Patterns</h3><div class="chart" id="bars"></div></div>
    </div>
    <div class="tl-card"><h3>Timeline (by hour)</h3><div id="timeline"></div></div>
    <div class="table-card">
      <h3>Event Log <span id="filter-info" style="font-weight:400;font-size:11px;color:#8b949e"></span></h3>
      <div class="filter-bar" id="chips"></div>
      <div style="overflow-x:auto"><table><thead><tr><th onclick="sort('timestamp')">Time ↕</th><th onclick="sort('session')">Session ↕</th><th onclick="sort('result')">Result ↕</th><th>Patterns</th><th onclick="sort('cmd')">Command ↕</th></tr></thead><tbody id="tbody"></tbody></table></div>
    </div>
  </div>
  <div class="right">
    <h3>Pattern Breakdown</h3>
    <div id="drilldown"></div>
  </div>
</div>
<script>
const DATA = __DATA__;
const COLORS = {deny:'#f85149',escalate:'#d29922',approve:'#3fb950',fast_lane:'#a371f7'};
const CLIST = ['#f85149','#d29922','#3fb950','#a371f7','#58a6ff','#ff7b72','#ffa657','#d2a8ff','#7ee787','#79c0ff'];
let records = DATA, cur = null, sortC = 'timestamp', sortA = false;

function init() {
  document.getElementById('meta').textContent = `${records.length} events · ${new Date().toLocaleString()}`;
  const cnts = {deny:0,escalate:0,approve:0,fast_lane:0};
  const ptnCnt = {};
  const sessCnt = {};
  const tl = {};
  for (const r of records) {
    cnts[r.result] = (cnts[r.result]||0)+1;
    for (const p of r.patterns||[]) ptnCnt[p] = (ptnCnt[p]||0)+1;
    const s = (r.sessionId||'?').split(':')[0];
    sessCnt[s] = (sessCnt[s]||0)+1;
    const h = (r.timestamp||'').slice(0,13)+':00';
    if(!tl[h]) tl[h]={deny:0,escalate:0,approve:0,fast_lane:0};
    tl[h][r.result] = (tl[h][r.result]||0)+1;
  }
  for(const k of ['deny','escalate','approve','fast_lane']) document.getElementById('s-'+k).textContent = cnts[k]||0;
  buildPie(cnts);
  buildBars(Object.entries(ptnCnt).sort((a,b)=>b[1]-a[1]).slice(0,8));
  buildTL(tl);
  buildSess(sessCnt);
  buildRisks(Object.entries(ptnCnt).sort((a,b)=>b[1]-a[1]).slice(0,6));
  buildDrill(ptnCnt);
  buildChips();
  render();
}

function filter(r) {
  cur = cur===r ? null : r;
  document.querySelectorAll('.stat-card').forEach(c=>c.style.borderColor='');
  if(cur) event.currentTarget.style.borderColor='#58a6ff';
  document.getElementById('filter-info').textContent = cur ? `(${cur})` : '';
  render();
}

function sort(c) { if(sortC===c) sortA=!sortA; else {sortC=c;sortA=false;} render(); }

function render() {
  let data = cur ? records.filter(r=>r.result===cur) : records;
  data = [...data].sort((a,b)=>{
    let av=a[sortC==='session'?'sessionId':sortC==='cmd'?'command':sortC]||'', bv=b[sortC==='session'?'sessionId':sortC==='cmd'?'command':sortC]||'';
    if(sortC==='timestamp') return sortA?av.localeCompare(bv):bv.localeCompare(av);
    return sortA?av.localeCompare(bv):bv.localeCompare(av);
  });
  document.getElementById('tbody').innerHTML = data.slice(0,200).map(r=>{
    const ts = r.timestamp ? r.timestamp.slice(0,16).replace('T',' ') : '';
    const dots = `<span class="dot dot-${r.result}"></span>`;
    const tags = (r.patterns||[]).map(p=>`<span class="tag tag-pat">${p.slice(0,20)}</span>`).join('');
    const cmd = (r.rawCommand || r.command || '').slice(0,70);
    return `<tr><td>${ts}</td><td>${(r.sessionId||'').split(':')[0]}</td><td>${dots}${r.result||''}</td><td>${tags}</td><td class="mono" title="${r.rawCommand||r.command||''}">${cmd}</td></tr>`;
  }).join('');
}

function buildChips() {
  document.getElementById('chips').innerHTML = ['deny','escalate','approve','fast_lane'].map(r=>
    `<span class="chip${cur===r?' on':''}" onclick="filter('${r}')">${r}</span>`
  ).join('')+`<span class="chip${!cur?' on':''}" onclick="filter(null)">all</span>`;
}

function buildPie(cnts) {
  const el = document.getElementById('pie'); el.innerHTML='';
  const d = Object.entries(cnts).filter(([,v])=>v>0);
  if(!d.length) return;
  const w=el.clientWidth||200, h=160, r=Math.min(w,h)/2-16;
  const svg=d3.select(el).append('svg').attr('width',w).attr('height',h);
  const g=svg.append('g').attr('transform',`translate(${w/2},${h/2})`);
  g.selectAll('path').data(d3.pie().value(d=>d[1]).sort(null)(d)).join('path')
    .attr('d',d3.arc().innerRadius(r*0.5).outerRadius(r))
    .attr('fill',d=>COLORS[d.data[0]]).attr('opacity',0.85).attr('cursor','pointer')
    .on('click',(_,d)=>filter(d.data[0]))
    .append('title').text(d=>`${d.data[0]}: ${d.data[1]}`);
}

function buildBars(data) {
  const el = document.getElementById('bars'); el.innerHTML='';
  if(!data.length) return;
  const w=el.clientWidth||240, bh=14, gap=3;
  const h=Math.max(130, data.length*(bh+gap)+8);
  const mx=data[0][1];
  const svg=d3.select(el).append('svg').attr('width',w).attr('height',h);
  const g=svg.append('g').attr('transform','translate(2,4)');
  g.selectAll('rect').data(data).join('rect')
    .attr('x',0).attr('y',(_,i)=>i*(bh+gap)).attr('height',bh).attr('rx',2)
    .attr('fill',(_,i)=>CLIST[i%CLIST.length]).attr('opacity',0.75).attr('width',d=>(d[1]/mx)*(w-90))
    .attr('cursor','pointer').on('click',(_,d)=>{cur=d[0];render();buildChips();})
    .append('title').text(d=>`${d[0]}: ${d[1]}`);
  g.selectAll('text.l').data(data).join('text').attr('class','l')
    .attr('x',d=>(d[1]/mx)*(w-90)+4).attr('y',(_,i)=>i*(bh+gap)+bh/2+4)
    .attr('font-size','10').attr('fill','#8b949e')
    .text(d=>`${d[0].slice(0,22)}${d[0].length>22?'…':''}`);
}

function buildTL(tl) {
  const el = document.getElementById('timeline'); el.innerHTML='';
  const hrs=Object.keys(tl).sort();
  if(!hrs.length) return;
  const w=el.clientWidth||680, h=100;
  const svg=d3.select(el).append('svg').attr('width',w).attr('height',h);
  const x=d3.scaleBand().domain(hrs).range([0,w]).padding(0.08);
  const max=d3.max(Object.values(tl),s=>d3.sum(Object.values(s)))||1;
  const y=d3.scaleLinear().domain([0,max]).range([h-18,0]);
  const types=['deny','escalate','approve','fast_lane'];
  const st=d3.stack().keys(types)(hrs.map(h=>({h,...tl[h]})));
  svg.append('g').attr('transform','translate(0,8)')
    .selectAll('g').data(st).join('g').attr('fill',(_,i)=>COLORS[types[i]]).attr('opacity',0.8)
    .selectAll('rect').data(d=>d).join('rect')
    .attr('x',d=>x(d.data.h)).attr('width',x.bandwidth())
    .attr('y',d=>y(d[1])).attr('height',d=>y(d[0])-y(d[1]))
    .append('title').text(d=>`${d.data.h}: ${types[st.findIndex(s=>s===d3.select(d3.select(d).node().parentNode).datum())]} ${d[1]-d[0]}`);
  svg.append('g').attr('transform',`translate(0,${h-14})`).call(d3.axisBottom(x).tickSize(0))
    .selectAll('text').attr('font-size','9').attr('fill','#8b949e').attr('transform','rotate(-45)').attr('text-anchor','end');
}

function buildSess(c) {
  document.getElementById('sessions').innerHTML = Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([s,n])=>
    `<div class="stat-card" style="cursor:default"><div class="value" style="font-size:18px">${n}</div><div class="label">${s}</div></div>`
  ).join('');
}

function buildRisks(data) {
  document.getElementById('top-risks').innerHTML = data.map(([p,c])=>
    `<div class="pattern-item" onclick="cur='${p.replace(/'/g,"\\'")}';render();buildChips();document.getElementById('filter-info').textContent='(${p.slice(0,20)})'">
      <div class="pat-name">${p.slice(0,35)}${p.length>35?'…':''}</div>
      <div class="pat-count">${c}×</div>
    </div>`
  ).join('');
}

function buildDrill(ptnCnt) {
  document.getElementById('drilldown').innerHTML = Object.entries(ptnCnt).sort((a,b)=>b[1]-a[1]).map(([p,total])=>{
    const byR={};
    for(const r of records) if((r.patterns||[]).includes(p)) byR[r.result]=(byR[r.result]||0)+1;
    const bars=Object.entries({deny:'#f85149',escalate:'#d29922',approve:'#3fb950',fast_lane:'#a371f7'})
      .filter(([k])=>byR[k]).map(([k,col])=>`
        <div class="drill-bar">
          <span class="drill-bar-label">${k}</span>
          <div class="drill-bar-track"><div class="drill-bar-fill" style="width:${(byR[k]/total*100)}%;background:${col}"></div></div>
          <span class="drill-bar-val">${byR[k]}</span>
        </div>`).join('');
    return `<div class="pattern-item" style="cursor:default">
      <div class="pat-name">${p.slice(0,30)}${p.length>30?'…':''}</div>
      <div class="pat-count">${total} total</div>
      ${bars}
    </div>`;
  }).join('');
}

init();
setInterval(init, 30000);
</script>
</body>
</html>'''

html = HTML.replace('__DATA__', data_json)

with open(OUT, 'w') as f:
    f.write(html)

print(f"Generated {OUT}")
print(f"Records: {len(records)}, Size: {OUT.stat().st_size//1024}KB")
