import {PROBLEMS, METHODS, FUNCTIONS, GRAPH_CONNECTIONS, ITERATION_LIMITS, createProblem, defaults, parametersFor, Simulation} from './engine.mjs';
import {knapsackLayout,knapsackItemAt} from './knapsack-view.mjs';
import {parseDeliveryInput,deliveryScore,deliveryOrderIds,isDeliveryRoute,formatDeliveryInput,formatDeliveryOutput} from './delivery.mjs';
import {drawDelivery,deliveryGeometry,deliveryHitTest} from './delivery-view.mjs';
import {iterationAxis} from './chart-axis.mjs';

const $ = id => document.getElementById(id);
const icon = (name,cls='') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const fmt = (v,d=3) => Math.abs(v)<1e-7?'0':Number(v).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:Number.isInteger(v)?0:d});
const scoreText = v => state.type==='function'&&v>0&&v<.01?v.toExponential(2):fmt(v);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const state = {type:'tsp', method:'sa', size:40, seed:42, variant:'rastrigin', colors:PROBLEMS.coloring.colors, functionLayout:'shifted',graphConnections:'standard',deliveryInitialization:'nearby',chartXScale:'linear',params:{}, speed:1, limit:ITERATION_LIMITS.default, compare:false, compareMethod:'ga', view:'best', ghost:true, running:false};
try {
  const saved = JSON.parse(localStorage.getItem('heuristic-lab-v1') || 'null');
  if(saved && PROBLEMS[saved.type] && METHODS[saved.method]?.problems.includes(saved.type)) {
    state.type=saved.type;state.method=saved.method;
    state.size=clamp(Math.round(Number(saved.size)||PROBLEMS[state.type].size),PROBLEMS[state.type].min||2,PROBLEMS[state.type].max||2);
    state.seed=clamp(Math.round(Number(saved.seed)||0),0,999999);state.variant=FUNCTIONS[saved.variant]?saved.variant:'rastrigin';state.colors=clamp(Math.round(Number(saved.colors)||4),3,6);
    state.functionLayout=saved.functionLayout==='classic'?'classic':'shifted';state.graphConnections=GRAPH_CONNECTIONS[saved.graphConnections]?saved.graphConnections:'standard';
    if(Number.isFinite(saved.limit))state.limit=clamp(Math.round(saved.limit),ITERATION_LIMITS.min,ITERATION_LIMITS.max);
    state.deliveryInitialization=saved.deliveryInitialization==='random'?'random':'nearby';
    state.chartXScale=saved.chartXScale==='log'?'log':'linear';
    for(const [key,,min,max] of parametersFor(state.method,state.type))if(Number.isFinite(saved.params?.[key]))state.params[key]=clamp(saved.params[key],min,max);
    if(!saved.observationVersion){
      if(saved.colors===4)state.colors=PROBLEMS.coloring.colors;
      if(state.type==='coloring'&&saved.size===24)state.size=PROBLEMS.coloring.size;
      if(['function','coloring'].includes(state.type)){
        const legacy=Object.fromEntries(METHODS[state.method].params.map(a=>[a[0],a[5]]));
        if(state.method==='sa')legacy.temperature=state.type==='function'?12:3;
        if(Object.entries(legacy).every(([key,v])=>saved.params?.[key]===v))state.params={};
      }
    }
  }
} catch {}
state.params={...defaults(state.method,state.type),...state.params};
let problem, sim, comparison, toastTimer, accumulator=0, lastTime=0, dragged=-1, heatmapCache=null, lastMetricTime=0, lastDrawTime=0, itemLayout=null, inspectedItem=-1, speedCustomized=false, deliveryOrders=null, deliveryFocus=-1;
const scene=$('scene'), ctx=scene.getContext('2d'), chart=$('chart'), chartCtx=chart.getContext('2d');

function persist(){try{localStorage.setItem('heuristic-lab-v1',JSON.stringify({type:state.type,method:state.method,size:state.size,seed:state.seed,variant:state.variant,colors:state.colors,functionLayout:state.functionLayout,graphConnections:state.graphConnections,deliveryInitialization:state.deliveryInitialization,chartXScale:state.chartXScale,observationVersion:1,params:state.params,limit:state.limit}));}catch{}}
function syncChartAxis(){const log=state.chartXScale==='log';$('chartXScale').value=state.chartXScale;$('chartAxisLabel').textContent=log?'反復回数（対数） →':'反復回数 →';$('chartScaleNote').hidden=!log;$('chart').setAttribute('aria-label',log?'1反復目以降の反復回数を対数軸にした最良目的値の推移':'反復回数に対する最良目的値の推移');}
function applyProblemPace(){if(!speedCustomized)state.speed=['function','coloring'].includes(state.type) ? .5 : 1;$('speed').value=String(state.speed);}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
function pause(){state.running=false;accumulator=0;updateRunButton();}
function reset({newProblem=false}={}) {
  pause();if(newProblem||!problem)problem=createProblem(state.type,state.size,state.seed,state.variant,state.colors,{functionLayout:state.functionLayout,graphConnections:state.graphConnections,deliveryInitialization:state.deliveryInitialization,deliveryOrders});
  sim=new Simulation(problem,state.method,state.params,state.seed);
  comparison=state.compare?new Simulation(problem,state.compareMethod,{},state.seed):null;
  heatmapCache=null;inspectedItem=-1;itemLayout=null;deliveryFocus=-1;$('itemTooltip').hidden=true;updateMetrics();draw();drawChart();persist();
}
function updateRunButton(){
  $('runBtn').classList.toggle('running',state.running);
  $('runBtn').innerHTML=icon(state.running?'pause':'play')+`<span>${state.running?'一時停止':sim?.iteration>=state.limit?'もう一度探索する':sim?.iteration?'探索をつづける':'探索をはじめる'}</span>`;
  $('quickRun').innerHTML=icon(state.running?'pause':'play')+`<span>${state.running?'停止':'実行'}</span>`;
  $('runStatus').textContent=state.running?'探索中':sim?.iteration>=state.limit?'完了':sim?.iteration?'一時停止':'準備完了';
  $('liveDot').classList.toggle('running',state.running);$('stepBtn').disabled=state.running||sim?.iteration>=state.limit;
}
function changeProblem(type){
  state.type=type;state.size=PROBLEMS[type].size;
  if(!METHODS[state.method].problems.includes(type))state.method=type==='function'?'pso':'sa';
  state.params=defaults(state.method,type);applyProblemPace();ensureComparison();renderUI();reset({newProblem:true});$('sidebar').classList.remove('open');
}
function changeMethod(method){state.method=method;state.params=defaults(method,state.type);ensureComparison();renderUI();reset();$('sidebar').classList.remove('open');}
function ensureComparison(){if(state.compareMethod===state.method||!METHODS[state.compareMethod].problems.includes(state.type))state.compareMethod=Object.keys(METHODS).find(m=>m!==state.method&&METHODS[m].problems.includes(state.type));}
const help={temperature:'高いほど、改悪する移動も受け入れやすくなります。',cooling:'1に近いほど、ゆっくり温度が下がります。',stepSize:'関数の移動幅。離散問題では固定の近傍操作を使います。',population:'1ステップで探索する候補の数。',mutation:'子個体に近傍変化を加える確率。',crossover:'親の情報を組み合わせる確率。',inertia:'直前の移動方向を維持する強さ。',cognitive:'自分の最良位置に引かれる強さ。',social:'群れの最良位置に引かれる強さ。',alpha:'フェロモンの情報を重視する度合い。',beta:'近い都市を選びやすくする度合い。',evaporation:'1ステップで失われるフェロモンの割合。',differential:'個体間の差を増幅する強さ。',orderSwapRate:'近傍操作で注文を入れ替える割合。GAでは突然変異に適用します。',candidatePool:'近い候補を主に試し、一部は全1,000件から探します。'};
const insights={sa:['遠回りが、近道になる。','焼きなまし法は、あえて悪い変化も受け入れます。温度を少しずつ下げることで、探索と集中のバランスが変わっていきます。'],ga:['よいアイデアは、受け継がれる。','小さな突然変異が、新しい可能性を生むことも。個体数と変異率を変えて、集団の多様性と収束の関係を観察しましょう。'],pso:['ひとりの発見が、群れを動かす。','自己の経験と、群れの発見。2つの重みを変えると、粒子の集まり方が変わります。強すぎる引力は振動を起こすことも。'],aco:['小さな足跡が、道になる。','フェロモンを忘れる速さが探索を変えます。蒸発を弱くすると過去を信じ、強くすると新しい道を試しやすくなります。'],de:['違いの中に、次の一歩がある。','集団が広がっていると大きな一歩に、集まると小さな一歩に。個体間の差分を使うことで、移動幅も自然に変わります。'],hill:['一歩ずつ、けれど慎重に。','改善だけを受け入れると、近くの頂上で止まることもあります。同じ問題を焼きなまし法で解いて、その違いを比べてみましょう。']};
function renderUI(){
  syncChartAxis();
  const p=PROBLEMS[state.type],m=METHODS[state.method];
  $('problemCount').textContent=Object.keys(PROBLEMS).length;
  $('problemList').innerHTML=Object.entries(PROBLEMS).map(([key,p])=>`<button class="problem-item ${key===state.type?'active':''}" data-problem="${key}" aria-pressed="${key===state.type}"><span class="problem-icon">${icon(p.icon)}</span><span><strong>${p.name}</strong><small>${p.en}</small></span>${key===state.type?icon('chevron'):''}</button>`).join('');
  const available=Object.entries(METHODS).filter(([,m])=>m.problems.includes(state.type));
  $('methodCount').textContent=`${available.length} methods`;
  $('methodList').innerHTML=available.map(([key,m])=>`<button class="method-item ${key===state.method?'active':''}" data-method="${key}" aria-pressed="${key===state.method}"><span class="method-mini-icon">${icon(m.icon)}</span><span><strong>${m.name}</strong><small>${m.short} · ${key==='hill'?'LOCAL SEARCH':'METAHEURISTIC'}</small></span><span class="radio-mark"></span></button>`).join('');
  $('problemTitle').textContent=p.name+(state.type==='function'?` / ${FUNCTIONS[state.variant].name}`:state.type==='delivery'?' / AHC006':'');$('problemTag').textContent=p.tag;$('problemDescription').textContent=p.description;
  $('scoreLabel').innerHTML=`最良の${p.unit} <span class="tiny-tag">${p.direction.toUpperCase()}</span>`;
  $('currentLabel').textContent=state.type==='delivery'?'現在の移動時間':state.type==='tsp'?'現在の距離':state.type==='knapsack'?'現在の価値':state.type==='coloring'?'現在の衝突数':'現在の関数値';
  $('methodName').textContent=m.name;$('methodEn').textContent=m.en;$('methodIcon').innerHTML=icon(m.icon);$('chartLegend').textContent=m.name;
  $('insightTitle').textContent=insights[state.method][0];$('insightText').textContent=insights[state.method][1];
  if(state.type==='delivery'){$('insightTitle').textContent='選ぶ注文も、経路の一部。';$('insightText').textContent=state.method==='ga'?'選ぶ50件も交叉で組み合わせます。入替率は、突然変異による注文変更の割合です。':'担当する50件と訪問順を一緒に改善します。入替率0では同じ集合の経路だけを探索します。';}
  $('parameters').innerHTML=parametersFor(state.method,state.type).filter(([key])=>key!=='stepSize'||state.type==='function').map(([key,label,min,max,step])=>`<div class="parameter"><div class="param-top"><label for="range-${key}">${label}</label><input class="param-value" aria-label="${label}の数値" id="value-${key}" data-key="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${state.params[key]}"></div><input class="param-range" id="range-${key}" data-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${state.params[key]}" style="--fill:${(state.params[key]-min)/(max-min)*100}%"><div class="range-labels"><span>${min}</span><span>${max}</span></div><p class="param-help">${help[key]}</p></div>`).join('');
  let settings='';
  if(p.sizeLabel)settings+=`<div class="parameter"><div class="param-top"><label for="${state.type==='knapsack'?'sizeInput':'sizeRange'}">${p.sizeLabel}</label>${state.type==='knapsack'?`<input id="sizeInput" class="param-value size-input" type="number" min="${p.min}" max="${p.max}" step="1" value="${state.size}" aria-label="品物数">`:`<span id="sizeValue" class="param-value">${state.size}</span>`}</div><input id="sizeRange" class="param-range" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${state.size}" ${state.type==='knapsack'?'aria-label="品物数のスライダー"':''} style="--fill:${(state.size-p.min)/(p.max-p.min)*100}%"><div class="range-labels"><span>${fmt(p.min,0)}</span><span>${fmt(p.max,0)}</span></div>${state.type==='knapsack'?`<div class="size-presets" aria-label="品物数のプリセット">${[100,500,1000,5000,10000].map(n=>`<button type="button" data-size="${n}" aria-pressed="${state.size===n}">${fmt(n,0)}</button>`).join('')}</div>`:''}</div>`;
  if(state.type==='function')settings+=`<div class="field-row"><label for="functionSelect">目的関数</label><select id="functionSelect" class="wide-select">${Object.entries(FUNCTIONS).map(([k,f])=>`<option value="${k}" ${k===state.variant?'selected':''}>${f.name}</option>`).join('')}</select></div><div class="field-row"><label for="functionLayout">地形の配置</label><select id="functionLayout" class="wide-select"><option value="shifted" ${state.functionLayout==='shifted'?'selected':''}>シードで変化</option><option value="classic" ${state.functionLayout==='classic'?'selected':''}>元の配置</option></select></div><p class="param-help">2変数を最小化します。最小値は0です。${state.functionLayout==='shifted'?'地形を回転・平行移動し、中央に集まるだけでは解けない配置にします。':'元の関数の配置で探索します。'}${state.variant==='sphere'?' Sphereは入門向けです。山谷の多いRastriginも試してみましょう。':''}</p>`;
  if(state.type==='coloring')settings+=`<div class="field-row"><label for="colorsSelect">使用する色数</label><select id="colorsSelect">${[3,4,5,6].map(n=>`<option value="${n}" ${n===state.colors?'selected':''}>${n} 色</option>`).join('')}</select></div><div class="field-row"><label for="graphConnections">接続の多さ</label><select id="graphConnections">${Object.entries(GRAPH_CONNECTIONS).map(([key,g])=>`<option value="${key}" ${state.graphConnections===key?'selected':''}>${g.name}</option>`).join('')}</select></div><p class="param-help">指定色数で解けるグラフを生成します。接続の多さを変えて制約の強さを比べられます。</p>`;
  if(state.type==='knapsack')settings+='<p class="param-help">最大10,000個。容量は総重量の35%。細かい品物はカーソルを重ねるかタップすると詳細を確認できます。</p>';
  if(state.type==='delivery')settings+=`<div class="delivery-rules"><strong>1,000件から50件を選択</strong><p>出発・到着は(400, 400)。各注文を受け取ってから届けます。移動時間はマンハッタン距離です。</p><a href="https://atcoder.jp/contests/ahc006/tasks/ahc006_a" target="_blank" rel="noopener noreferrer">AHC006の問題文 ↗</a></div><div class="field-row"><label for="deliveryInitialization">初期解</label><select id="deliveryInitialization" class="wide-select"><option value="nearby" ${state.deliveryInitialization==='nearby'?'selected':''}>中心近くの注文</option><option value="random" ${state.deliveryInitialization==='random'?'selected':''}>ランダムな注文</option></select></div><p class="param-help" id="deliveryDatasetLabel">${deliveryOrders?'読み込んだ入力を使用中':'公式と同じ生成条件の独自シード'}</p><div class="delivery-actions"><button id="deliveryImportBtn" type="button">入力を読み込む</button><button id="deliveryInputExport" type="button">入力を保存</button><button id="deliveryOutputBtn" type="button">解を保存（AtCoder形式）</button></div><p class="param-help">学習用の実行です。公式の2秒制限・全ケースの採点は再現しません。</p>`;
  $('problemSettings').innerHTML=settings;$('seedInput').value=state.seed;
  $('limitInput').min=ITERATION_LIMITS.min;$('limitInput').max=ITERATION_LIMITS.max;$('limitInput').value=state.limit;
  $('iterationPresets').innerHTML=ITERATION_LIMITS.presets.map(n=>`<option value="${n}" label="${fmt(n,0)} 回"></option>`).join('');
  $('compareMethod').innerHTML=available.filter(([k])=>k!==state.method).map(([k,m])=>`<option value="${k}" ${k===state.compareMethod?'selected':''}>${m.short} · ${m.name}</option>`).join('');
  $('compareToggle').checked=state.compare;$('compareSettings').hidden=!state.compare;$('compareLegendWrap').hidden=!state.compare;$('compareLegend').textContent=METHODS[state.compareMethod].name;
  $('experimentNote').textContent=state.compare?'同じ問題・乱数シードで比較しています。1ステップの評価回数は手法ごとに異なるため、速度や性能の厳密な順位ではありません。':'小さな変化を重ねながら探索します。最良解は、これまでに見つけた一番よい解です。';
  if(state.type==='knapsack')$('experimentNote').textContent+=' 品物はカーソルを重ねるかタップして詳細を確認できます。';
  if(state.type==='function'&&state.functionLayout==='shifted')$('experimentNote').textContent+=' 地形の向きと最小点の位置は乱数シードで変わります。';
  if(state.type==='delivery')$('experimentNote').textContent+=' 受取・配達地点に触れると注文と訪問順を確認できます。背景の点は未選択の注文です。';
  $('canvasWrap').classList.toggle('knapsack',state.type==='knapsack');$('canvasWrap').classList.toggle('delivery',state.type==='delivery');
  for(const id of ['deliverySummary','deliveryPickupLegend','deliveryDropLegend','deliveryOfficeLegend'])$(id).hidden=state.type!=='delivery';
  $('canvasHint').hidden=state.type!=='tsp';
  $('primaryLegend').textContent={tsp:'最良の巡回路',function:'最良の位置',knapsack:'選択した品物',coloring:'彩色した頂点',delivery:'最良の配送経路'}[state.type];
  $('secondaryLegend').textContent={tsp:'現在の巡回路',function:'探索中の粒子',knapsack:'選択していない品物',coloring:'同色でつながる辺',delivery:'現在の経路'}[state.type];
  $('secondaryLegendWrap').hidden=false;
}
function value(v){return state.type==='knapsack'?-v:v;}
function updateMetrics(){
  const b=value(sim.bestScore),c=value(sim.currentScore),initial=value(sim.initial);
  $('bestValue').textContent=scoreText(b);$('currentValue').textContent=scoreText(c);$('iterationValue').textContent=fmt(sim.iteration,0);$('evaluationValue').textContent=fmt(sim.evaluations,0);$('iterationMax').textContent=`/ ${fmt(state.limit,0)}`;
  for(const id of ['bestValue','currentValue','iterationValue','evaluationValue'])$(id).classList.toggle('long-number',$(id).textContent.length>=9);
  const improvement=state.type==='knapsack'?b-initial:initial-b;
  $('improvement').textContent=initial!==0?`${state.type==='knapsack'?'↑':'↓'} ${(Math.max(0,improvement)/Math.abs(initial)*100).toFixed(1)}%`:improvement>0?`+${fmt(improvement)}`:'';
  if(comparison)$('compareScore').textContent=`最良値 ${scoreText(value(comparison.bestScore))} · ${fmt(comparison.evaluations,0)} 回評価`;
  $('canvasBadge').textContent={tsp:`${state.size} CITIES`,function:FUNCTIONS[state.variant].name.toUpperCase(),knapsack:`${fmt(state.size,0)} ITEMS`,coloring:`${state.size} NODES / ${state.colors} COLORS`,delivery:'50 / 1,000 ORDERS'}[state.type];
  $('canvasSubBadge').textContent={tsp:'EUCLIDEAN DISTANCE · CLOSED TOUR',function:state.functionLayout==='shifted'?'SHIFTED + ROTATED · MINIMUM = 0':'CLASSIC LANDSCAPE · MINIMUM = 0',knapsack:`CAPACITY ${problem.capacity} · MAXIMIZE VALUE`,coloring:`${problem.edges?.length} EDGES · MINIMIZE CONFLICTS`,delivery:'MANHATTAN DISTANCE · AHC006'}[state.type];
  if(state.type==='delivery'){$('deliveryScore').textContent=fmt(deliveryScore(sim.bestScore),0);$('deliveryOrderCount').textContent=`${deliveryOrderIds(sim.best).length} / 1,000`;$('deliveryValidity').textContent=isDeliveryRoute(problem,sim.best)?'受取 → 配達を順守':'順序を確認してください';}
  updateRunButton();
}
function canvasSize(canvas,context){const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);const w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}context.setTransform(dpr,0,0,dpr,0,0);return [r.width,r.height];}
function roundedRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
function circle(c,x,y,r,fill,stroke,width=1){c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function grid(c,w,h){c.fillStyle='#f6f9f7';c.fillRect(0,0,w,h);c.fillStyle='#dbe5de';for(let x=18;x<w;x+=22)for(let y=18;y<h;y+=22)c.fillRect(x,y,1,1);}
function plotPoint(point,w,h){return [30+point[0]*(w-60),26+point[1]*(h-85)];}
function route(c,solution,w,h,color,width,dash=[]){c.beginPath();solution.forEach((id,i)=>{const [x,y]=plotPoint(problem.points[id],w,h);i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.setLineDash(dash);c.stroke();c.setLineDash([]);}
function drawTSP(w,h){
  grid(ctx,w,h);
  if(state.ghost&&state.view==='best')route(ctx,sim.current,w,h,'#aebfb650',1,[3,4]);
  if(comparison)route(ctx,comparison.best,w,h,'#9279c28c',1.3,[4,4]);
  const solution=state.view==='best'?sim.best:sim.current;
  ctx.save();ctx.shadowBlur=7;ctx.shadowColor='#2d947c19';route(ctx,solution,w,h,'#198970',1.9);ctx.restore();
  problem.points.forEach((p,i)=>{const [x,y]=plotPoint(p,w,h);circle(ctx,x,y,5.4,'#fff');circle(ctx,x,y,3,'#278d75');if(i===solution[0])circle(ctx,x,y,8.5,null,'#3e9c7e55',1.3);if(state.size<=55){ctx.font='8px "DM Sans", sans-serif';ctx.fillStyle='#6e8b7a';ctx.fillText(String(i+1).padStart(2,'0'),x+8,y-7);}});
}
function heatmap(){
  if(heatmapCache)return heatmapCache;
  const f=problem.f,n=200,c=document.createElement('canvas');c.width=n;c.height=n;const cx=c.getContext('2d'),img=cx.createImageData(n,n),samples=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++)samples.push(Math.log1p(Math.max(0,f((i/(n-1)*2-1)*problem.range,(1-j/(n-1)*2)*problem.range))));
  const sorted=[...samples].sort((a,b)=>a-b),max=sorted[Math.floor(sorted.length*.97)]||1;
  samples.forEach((v,k)=>{const t=clamp(v/max,0,1);img.data[k*4]=Math.round(42+198*t);img.data[k*4+1]=Math.round(115+129*t);img.data[k*4+2]=Math.round(100+132*t);img.data[k*4+3]=255;});cx.putImageData(img,0,0);
  // Marching squares contours, sampled from the actual objective function.
  const gridN=40,vals=Array.from({length:gridN+1},(_,y)=>Array.from({length:gridN+1},(_,x)=>Math.log1p(Math.max(0,f((x/gridN*2-1)*problem.range,(1-y/gridN*2)*problem.range)))));
  cx.lineWidth=.45;cx.strokeStyle='#436b5a3b';
  for(let level=max/12;level<max;level+=max/12){cx.beginPath();for(let y=0;y<gridN;y++)for(let x=0;x<gridN;x++){const corners=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],v=corners.map(([a,b])=>vals[b][a]),cross=[];for(let e=0;e<4;e++){const next=(e+1)%4;if((v[e]<level)!==(v[next]<level)){const t=(level-v[e])/(v[next]-v[e]);cross.push([(corners[e][0]+t*(corners[next][0]-corners[e][0]))/gridN*n,(corners[e][1]+t*(corners[next][1]-corners[e][1]))/gridN*n]);}}for(let j=0;j+1<cross.length;j+=2){cx.moveTo(...cross[j]);cx.lineTo(...cross[j+1]);}}cx.stroke();}
  heatmapCache=c;return c;
}
function drawFunction(w,h){
  const pad=24,tw=w-48,th=h-76,r=problem.range;
  ctx.fillStyle='#f6f9f7';ctx.fillRect(0,0,w,h);ctx.drawImage(heatmap(),pad,16,tw,th);
  const point=([x,y])=>[pad+(x/r+1)/2*tw,16+(1-y/r)/2*th];
  ctx.strokeStyle='#5e7d6a22';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(pad+tw/2,16);ctx.lineTo(pad+tw/2,16+th);ctx.moveTo(pad,16+th/2);ctx.lineTo(pad+tw,16+th/2);ctx.stroke();
  ctx.font='8px "DM Sans", sans-serif';ctx.fillStyle='#6d897b';ctx.fillText(fmt(-r,1),pad,30+th);ctx.fillText('0',pad+tw/2-2,30+th);ctx.fillText(fmt(r,1),pad+tw-17,30+th);ctx.fillText('x',w-12,30+th);ctx.fillText('y',9,19);
  const opt=point(problem.optimum);ctx.strokeStyle='#385e4f';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(opt[0]-5,opt[1]);ctx.lineTo(opt[0]+5,opt[1]);ctx.moveTo(opt[0],opt[1]-5);ctx.lineTo(opt[0],opt[1]+5);ctx.stroke();
  if(state.ghost){ctx.beginPath();sim.trail.forEach((p,i)=>{const [x,y]=point(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.lineWidth=1;ctx.strokeStyle='#326b5b55';ctx.stroke();for(const a of sim.population){const [x,y]=point(a.x);circle(ctx,x,y,3.1,'#ffffffc9','#43886f',.7);}}
  if(comparison){const [x,y]=point(comparison.best);circle(ctx,x,y,6,'#9278ca','#fff',1.7);}
  const [x,y]=point(state.view==='best'?sim.best:sim.current);circle(ctx,x,y,11,null,'#19897055',2);circle(ctx,x,y,5,'#15836d','#fff',2);
  if(sim.iteration===0&&sim.population.length===0){ctx.font='10px "Noto Sans JP", sans-serif';ctx.fillStyle='#5d776a';ctx.fillText('＋ 既知の最小点',pad+10,34);}
}
function drawKnapsack(w,h){
  grid(ctx,w,h);const solution=state.view==='best'?sim.best:sim.current;
  itemLayout=knapsackLayout(state.size,w,h);const {columns:cols,gap,cellWidth:tw,cellHeight:th,top,left}=itemLayout;
  const detailed=tw>=27&&th>=26;let weight=0,selectedCount=0;
  problem.items.forEach((item,i)=>{const x=left+(i%cols)*(tw+gap),y=top+Math.floor(i/cols)*(th+gap),selected=solution[i];if(selected){weight+=item.weight;selectedCount++;}
    if(detailed){roundedRect(ctx,x,y,tw,th,Math.min(5,tw*.12,th*.12));ctx.fillStyle=selected?'#e1f0e8':'#fff';ctx.fill();ctx.strokeStyle=selected?'#8dbda6':'#dfe7e1';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=selected?'#25795d':'#a2b0a7';ctx.font=`500 ${Math.min(13,tw*.24)}px "DM Sans", sans-serif`;ctx.textAlign='center';ctx.fillText(`${item.value}`,x+tw/2,y+th*.43);
      ctx.font=`${Math.min(8,tw*.18)}px "DM Sans", sans-serif`;ctx.fillStyle=selected?'#7aa48d':'#b1bcb5';ctx.fillText(`${item.weight} kg`,x+tw/2,y+th*.76);if(selected&&tw>39){ctx.font='8px sans-serif';ctx.fillStyle='#5a9d7d';ctx.fillText('✓',x+tw-8,y+10);}
    }else{ctx.fillStyle=selected?'#288f70':'#dce7df';ctx.fillRect(x,y,tw,th);}
  });ctx.textAlign='left';
  const barY=h-65;roundedRect(ctx,23,barY,w-46,5,3);ctx.fillStyle='#e3eae4';ctx.fill();roundedRect(ctx,23,barY,(w-46)*weight/problem.capacity,5,3);ctx.fillStyle='#288f70';ctx.fill();
  ctx.font='9px "DM Sans", sans-serif';ctx.fillStyle='#658776';const weightText=`重量 ${fmt(weight,0)} / ${fmt(problem.capacity,0)} kg`,countText=`${fmt(selectedCount,0)} 点を選択`;
  const countY=ctx.measureText(weightText).width+ctx.measureText(countText).width+12>w-46?barY+18:barY-9;
  ctx.fillText(weightText,23,barY-9);ctx.textAlign='right';ctx.fillText(countText,w-23,countY);ctx.textAlign='left';updateItemTooltip();
}
function updateItemTooltip(){
  if(state.type!=='knapsack'||inspectedItem<0)return;
  const item=problem.items[inspectedItem],solution=state.view==='best'?sim.best:sim.current;
  const text=`品物 #${fmt(inspectedItem+1,0)} · 価値 ${item.value} · 重量 ${item.weight} kg · ${solution[inspectedItem]?'選択中':'未選択'}`;
  if($('itemTooltip').textContent!==text)$('itemTooltip').textContent=text;
}
function inspectKnapsack(e){
  if(state.type!=='knapsack'||!itemLayout)return;const r=scene.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  inspectedItem=knapsackItemAt(itemLayout,x,y);const tooltip=$('itemTooltip');tooltip.hidden=inspectedItem<0;if(inspectedItem<0)return;
  updateItemTooltip();tooltip.style.left=`${clamp(x+12,10,Math.max(10,r.width-tooltip.offsetWidth-10))}px`;tooltip.style.top=`${clamp(y-tooltip.offsetHeight-10,10,Math.max(10,r.height-tooltip.offsetHeight-10))}px`;
}
function updateDeliveryTooltip(){
  if(state.type!=='delivery'||deliveryFocus<0)return;
  const order=problem.orders[deliveryFocus],route=state.view==='best'?sim.best:sim.current,pickupAt=route.indexOf(deliveryFocus*2),dropAt=route.indexOf(deliveryFocus*2+1);
  const text=`注文 #${deliveryFocus+1} · 受取 (${order.pickup.join(', ')}) → 配達 (${order.drop.join(', ')}) · ${pickupAt>=0?`選択中：${pickupAt+1}番目 → ${dropAt+1}番目`:'未選択'}`;
  if($('itemTooltip').textContent!==text)$('itemTooltip').textContent=text;
}
function inspectDelivery(e){
  if(state.type!=='delivery')return;const r=scene.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  const next=deliveryHitTest(problem,deliveryGeometry(r.width,r.height),x,y),changed=next!==deliveryFocus;deliveryFocus=next;
  const tooltip=$('itemTooltip');tooltip.hidden=next<0;if(changed)draw();if(next<0)return;
  updateDeliveryTooltip();tooltip.style.left=`${clamp(x+12,10,Math.max(10,r.width-tooltip.offsetWidth-10))}px`;tooltip.style.top=`${clamp(y-tooltip.offsetHeight-10,10,Math.max(10,r.height-tooltip.offsetHeight-10))}px`;
}
function downloadText(filename,text){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('ファイルを保存しました');}
function showDeliveryImport(){showDialog(`<h2 class="dialog-title">AHC006の入力を読み込む</h2><p class="dialog-description">1,000件の注文を「受取x 受取y 配達x 配達y」の形式で貼り付けるか、TXTファイルを選んでください。</p><label class="delivery-file-label">TXTファイル <input id="deliveryInputFile" type="file" accept=".txt,text/plain"></label><textarea id="deliveryInputText" class="delivery-input-text" maxlength="100000" aria-label="AHC006の入力データ" placeholder="406 19 347 786&#10;4 689 659 189&#10;…（1,000件）"></textarea><p id="deliveryInputError" class="delivery-input-error" role="alert"></p><button id="applyDeliveryInput" class="run-button" type="button">この入力で探索する</button><p class="param-help">入力はブラウザー内で処理します。読み込んだ入力は再読み込みで消えるため、必要に応じて「入力を保存」で残してください。乱数シードは探索に使用します。</p>`);}
const nodeColors=['#479e83','#9d89c3','#d3aa62','#d48674','#6a9ec0','#b0939f'];
function drawColoring(w,h){
  grid(ctx,w,h);const solution=state.view==='best'?sim.best:sim.current;
  const pts=problem.points.map(p=>[w/2+(p[0]-.5)*Math.min(w-56,h-73),h/2-15+(p[1]-.5)*Math.min(w-56,h-73)]);
  const spacing=2*Math.PI*.38*Math.min(w-56,h-73)/problem.size,nodeRadius=clamp(spacing*.36,1.7,8),showLabels=nodeRadius>=6&&problem.size<100;
  for(const [a,b] of problem.edges){const conflict=solution[a]===solution[b];ctx.beginPath();ctx.moveTo(...pts[a]);ctx.lineTo(...pts[b]);ctx.strokeStyle=conflict?'#c969606f':'#c3d0c570';ctx.lineWidth=conflict?2:1;ctx.stroke();}
  pts.forEach(([x,y],i)=>{if(nodeRadius>=4)circle(ctx,x,y,nodeRadius+2,'#fff');circle(ctx,x,y,nodeRadius,nodeColors[solution[i]]);if(showLabels){ctx.font='8px "DM Sans", sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(String(i+1),x,y+2.8);}});ctx.textAlign='left';
}
function draw(){if(!sim)return;const [w,h]=canvasSize(scene,ctx);if(!w||!h)return;ctx.clearRect(0,0,w,h);if(state.type==='delivery'){drawDelivery(ctx,w,h,problem,state.view==='best'?sim.best:sim.current,{current:sim.current,ghost:state.ghost&&state.view==='best',focus:deliveryFocus});updateDeliveryTooltip();return;}({tsp:drawTSP,function:drawFunction,knapsack:drawKnapsack,coloring:drawColoring}[state.type])(w,h);}
function drawChart(){
  if(!sim)return;const [w,h]=canvasSize(chart,chartCtx),c=chartCtx;if(!w||!h)return;c.clearRect(0,0,w,h);
  const left=42,right=9,top=8,bottom=22,pw=w-left-right,ph=h-top-bottom;
  const axis=iterationAxis(sim.iteration,state.chartXScale,pw);
  const records=[sim.history,...(comparison?[comparison.history]:[])],histories=records.map(hist=>hist.filter(a=>axis.position(a.iteration)!==null));
  const visible=histories.flatMap(hist=>hist.map(a=>value(a.best))),values=records.flatMap(hist=>hist.map(a=>value(a.best)));let lo=Math.min(...values),hi=Math.max(...values);if(hi-lo<1e-9){const d=Math.max(1,Math.abs(hi)*.15);lo-=d*.4;hi+=d*.6;}else {const pad=(hi-lo)*.12;lo-=pad;hi+=pad;}
  const xy=a=>[left+axis.position(a.iteration)*pw,top+(hi-value(a.best))/(hi-lo)*ph];
  c.font='8px "DM Sans", sans-serif';c.lineWidth=.7;
  for(let i=0;i<4;i++){const y=top+i/3*ph;c.strokeStyle='#edf0f0';c.beginPath();c.moveTo(left,y);c.lineTo(w-right,y);c.stroke();c.fillStyle='#a6b2b5';c.textAlign='right';const label=hi-(hi-lo)*i/3;c.fillText(Math.abs(label)>=1000?`${(label/1000).toFixed(1)}k`:fmt(label,Math.abs(label)<10?2:1),left-9,y+3);}
  for(const tick of axis.ticks){const x=left+tick.position*pw;c.fillStyle='#aab4b8';c.textAlign=tick.position===0?'left':tick.position===1?'right':'center';c.fillText(tick.label,x,h-5);if(state.chartXScale==='log'){c.strokeStyle='#edf0f0';c.beginPath();c.moveTo(x,top);c.lineTo(x,top+ph);c.stroke();}}
  if(!visible.length){c.textAlign='center';c.fillStyle='#a2b0aa';c.fillText('1反復目から表示します',left+pw/2,top+ph/2);}
  histories.forEach((hist,index)=>{if(!hist.length)return;const color=index?'#9981cd':'#198970';c.beginPath();hist.forEach((a,i)=>{const [x,y]=xy(a);i?c.lineTo(x,y):c.moveTo(x,y);});if(hist.length===1){const [x,y]=xy(hist[0]);c.lineTo(x+1,y);}c.strokeStyle=color;c.lineWidth=index?1.5:1.9;c.setLineDash(index?[4,3]:[]);c.stroke();c.setLineDash([]);
    if(!index){const last=xy(hist.at(-1)),first=xy(hist[0]);c.lineTo(last[0],top+ph);c.lineTo(first[0],top+ph);c.closePath();const gradient=c.createLinearGradient(0,top,0,top+ph);gradient.addColorStop(0,'#19897013');gradient.addColorStop(1,'#19897002');c.fillStyle=gradient;c.fill();circle(c,last[0],last[1],3,'#198970','#fff',1.5);}});c.textAlign='left';
}
function advance(){if(sim.iteration>=state.limit)return;sim.step();comparison?.step();if(sim.iteration>=state.limit){pause();updateMetrics();toast('反復上限に到達しました。結果を保存したり、設定を変えて再実験できます。');}}
function toggleRun(){if(state.running){pause();updateMetrics();draw();drawChart();return;}if(sim.iteration>=state.limit)reset();state.running=true;lastTime=performance.now();accumulator=0;updateRunButton();}
function frame(time){
  if(state.running&&!document.hidden){const delta=Math.min((time-lastTime)/1000,.12);if(state.speed==='fast')accumulator=5000;else accumulator=Math.min(5000,accumulator+delta*30*state.speed);let count=0;const start=performance.now();while(accumulator>=1&&state.running&&count<5000&&performance.now()-start<10){advance();accumulator--;count++;}if(count){if(time-lastDrawTime>=33||!state.running){draw();drawChart();lastDrawTime=time;}if(time-lastMetricTime>80){updateMetrics();lastMetricTime=time;}}}
  lastTime=time;requestAnimationFrame(frame);
}
function showDialog(html){$('dialogContent').innerHTML=html;$('infoDialog').showModal();}
function methodGuide(method=null){
  const entries=method?[[method,METHODS[method]]]:Object.entries(METHODS);
  showDialog(`<h2 class="dialog-title">${method?METHODS[method].name:'探索のアイデアを知る。'}</h2><p class="dialog-description">${method?'パラメーターは、探索のふるまいを変える小さな実験装置です。':'同じ問題でも、たどり着き方はさまざま。手法ごとの考え方を見比べてみましょう。'}</p><div class="${method?'':'guide-grid'}">${entries.map(([key,m])=>`<article class="guide-card"><h3>${icon(m.icon)} ${m.name}<span>${m.short}</span></h3><p>${m.description}</p><div class="guide-detail">${m.detail}</div><div class="guide-tags">${m.problems.map(p=>`<span>${PROBLEMS[p].name}</span>`).join('')}</div><button data-try-method="${key}">この手法で実験する ${icon('arrow')}</button></article>`).join('')}</div><p class="dialog-description" style="font-size:9px;margin-top:18px;margin-bottom:0">山登り法は比較用の局所探索です。実装は学習向けの基本形であり、最良解が大域的な最適解であるとは限りません。</p>`);
}
function about(){showDialog('<h2 class="dialog-title">好奇心のための、最適化実験室。</h2><p class="dialog-description">Heuristic Lab は、メタヒューリスティクスの探索過程を手で触りながら学べるサイトです。すべての計算をブラウザー内で行い、アカウントや計算サーバーは不要です。</p><ul class="about-list"><li>5種類の問題、6種類の探索手法。AHC006のフードデリバリーにも対応しています。関数最適化では4つのテスト関数を選べます。</li><li>同じ乱数シードと設定なら同じ探索を再現できます。実行中の設定変更は結果にも反映されます。</li><li>巡回路の距離は、画面上の正規化座標による無単位のユークリッド距離です。</li><li>比較は同じ問題とシードで実行します。1反復の計算量は手法で異なり、性能順位を保証するものではありません。</li><li>グラフ彩色は指定色数で解けるグラフを生成。ナップサックは重量超過を修復してから評価します。</li><li>設定はこの端末のブラウザーに保存されます。結果はJSONでダウンロードできます。</li><li>画面に表示するのは最良の発見済み解です。TSP等の厳密最適性を証明する機能はありません。</li></ul>');}
function shortcuts(){showDialog(`<h2 class="dialog-title">手を止めずに、探索する。</h2><p class="dialog-description">入力欄を操作していないときに使えます。</p>${[['Space','実行 / 一時停止'],['→','1ステップ進める'],['R','同じ問題でリセット'],['N','新しい問題を生成'],['?','このヘルプを開く'],['Esc','ダイアログを閉じる']].map(([k,v])=>`<div class="shortcut-row"><span>${v}</span><kbd>${k}</kbd></div>`).join('')}`);}
function exportResults(){
  const {f,...p}=problem;
  const data={format:'heuristic-lab-v1',exportedAt:new Date().toISOString(),problem:p,settings:{...state,running:undefined},primary:sim.snapshot(),comparison:comparison?.snapshot()||null,...(state.type==='delivery'?{officialFormulaScore:deliveryScore(sim.bestScore),atcoderOutput:formatDeliveryOutput(problem,sim.best)}:{}),notes:'Scores are minimized; knapsack scores are negative values. History is bounded to 2400 samples, preserving initial/latest points and early/logarithmic checkpoints. Logarithmic charts omit iteration zero; the export retains it. Parameters may have been adjusted during the run.'};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`heuristic-lab-${state.type}-${state.method}-seed${state.seed}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('実験結果をJSONで保存しました');
}

$('problemList').addEventListener('click',e=>{const btn=e.target.closest('[data-problem]');if(btn)changeProblem(btn.dataset.problem);});
$('methodList').addEventListener('click',e=>{const btn=e.target.closest('[data-method]');if(btn)changeMethod(btn.dataset.method);});
$('parameters').addEventListener('input',e=>{
  const key=e.target.dataset.key;if(!key||e.target.value==='')return;
  const param=parametersFor(state.method,state.type).find(a=>a[0]===key);let v=clamp(Number(e.target.value),param[2],param[3]);if(!Number.isFinite(v))return;if(key==='population')v=Math.round(v);
  state.params[key]=v;sim.params[key]=v;
  const range=$(`range-${key}`),input=$(`value-${key}`);range.value=v;range.style.setProperty('--fill',`${(v-param[2])/(param[3]-param[2])*100}%`);if(e.target!==input)input.value=v;persist();
});
$('parameters').addEventListener('change',e=>{const key=e.target.dataset.key;if(key)$(`value-${key}`).value=state.params[key];});
$('problemSettings').addEventListener('input',e=>{if(e.target.id==='sizeRange'){if($('sizeInput'))$('sizeInput').value=e.target.value;else $('sizeValue').textContent=e.target.value;e.target.style.setProperty('--fill',`${(e.target.value-PROBLEMS[state.type].min)/(PROBLEMS[state.type].max-PROBLEMS[state.type].min)*100}%`);}});
function setProblemSize(value){const p=PROBLEMS[state.type],n=Number(value);state.size=Number.isFinite(n)&&value!==''?clamp(Math.round(n),p.min,p.max):state.size;renderUI();reset({newProblem:true});}
$('problemSettings').addEventListener('change',e=>{if(e.target.id==='sizeRange'||e.target.id==='sizeInput'){setProblemSize(e.target.value);return;}if(e.target.id==='functionSelect')state.variant=e.target.value;else if(e.target.id==='colorsSelect')state.colors=Number(e.target.value);else if(e.target.id==='functionLayout')state.functionLayout=e.target.value;else if(e.target.id==='graphConnections')state.graphConnections=e.target.value;else if(e.target.id==='deliveryInitialization')state.deliveryInitialization=e.target.value;else return;renderUI();reset({newProblem:true});});
$('problemSettings').addEventListener('click',e=>{const button=e.target.closest('[data-size]');if(button)setProblemSize(button.dataset.size);if(e.target.closest('#deliveryImportBtn'))showDeliveryImport();if(e.target.closest('#deliveryInputExport'))downloadText('ahc006-input.txt',formatDeliveryInput(problem));if(e.target.closest('#deliveryOutputBtn'))downloadText('ahc006-output.txt',formatDeliveryOutput(problem,sim.best));});
$('problemSettings').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='sizeInput'){e.preventDefault();setProblemSize(e.target.value);}});
$('seedInput').addEventListener('change',e=>{state.seed=clamp(Math.round(Number(e.target.value)||0),0,999999);e.target.value=state.seed;reset({newProblem:true});});
function setIterationLimit(value){const n=Number(value);if(value!==''&&Number.isFinite(n))state.limit=clamp(Math.round(n),ITERATION_LIMITS.min,ITERATION_LIMITS.max);$('limitInput').value=state.limit;if(sim.iteration>=state.limit)pause();updateMetrics();if(!state.running){draw();drawChart();}persist();}
$('limitInput').addEventListener('change',e=>setIterationLimit(e.target.value));
$('limitInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();setIterationLimit(e.target.value);e.target.blur();}});
$('speed').addEventListener('change',e=>{state.speed=e.target.value==='fast'?'fast':Number(e.target.value);speedCustomized=true;accumulator=0;});
$('chartXScale').addEventListener('change',e=>{state.chartXScale=e.target.value==='log'?'log':'linear';syncChartAxis();drawChart();persist();});
$('runBtn').addEventListener('click',toggleRun);
$('quickRun').addEventListener('click',toggleRun);
$('stepBtn').addEventListener('click',()=>{advance();updateMetrics();draw();drawChart();});
$('resetBtn').addEventListener('click',()=>{reset();toast('同じ問題・シードで探索をリセットしました');});
$('newProblem').addEventListener('click',()=>{state.seed=(state.seed+1)%1000000;$('seedInput').value=state.seed;if(state.type==='delivery'){deliveryOrders=null;renderUI();}reset({newProblem:true});toast(`新しい問題を生成しました · Seed ${state.seed}`);});
$('resetParams').addEventListener('click',()=>{state.params=defaults(state.method,state.type);sim.params={...state.params};renderUI();persist();toast('手法のパラメーターを既定値に戻しました');});
$('compareToggle').addEventListener('change',e=>{state.compare=e.target.checked;renderUI();reset();toast(state.compare?'2つの手法を同じ問題で比較します':'比較を終了しました');});
$('compareMethod').addEventListener('change',e=>{state.compareMethod=e.target.value;reset();renderUI();toast('比較する手法を変更し、探索をリセットしました');});
$('showGhost').addEventListener('change',e=>{state.ghost=e.target.checked;draw();});
function setView(view){state.view=view;for(const [id,v] of [['bestView','best'],['currentView','current']]){$(id).classList.toggle('selected',view===v);$(id).setAttribute('aria-pressed',view===v);}draw();}
$('bestView').addEventListener('click',()=>setView('best'));$('currentView').addEventListener('click',()=>setView('current'));
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('visualPanel').requestFullscreen();}catch{toast('この環境では全画面表示を利用できません');}});
$('exportBtn').addEventListener('click',exportResults);
for(const id of ['guideNav','sideGuide'])$(id).addEventListener('click',()=>methodGuide());
for(const id of ['methodInfo','insightBtn'])$(id).addEventListener('click',()=>methodGuide(state.method));
$('aboutNav').addEventListener('click',about);$('shortcutBtn').addEventListener('click',shortcuts);
$('labNav').addEventListener('click',()=>{if($('infoDialog').open)$('infoDialog').close();window.scrollTo({top:0,behavior:'smooth'});});
$('menuBtn').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
$('closeDialog').addEventListener('click',()=>$('infoDialog').close());
$('dialogContent').addEventListener('click',e=>{
  if(!e.target.closest('#applyDeliveryInput'))return;
  try{const orders=parseDeliveryInput($('deliveryInputText').value);deliveryOrders=orders;renderUI();reset({newProblem:true});$('infoDialog').close();toast('1,000件の入力を読み込みました');}
  catch(error){$('deliveryInputError').textContent=error.message;}
});
$('dialogContent').addEventListener('change',async e=>{
  if(e.target.id!=='deliveryInputFile'||!e.target.files[0])return;
  const file=e.target.files[0];if(file.size>100000){$('deliveryInputError').textContent='入力ファイルは100,000バイト以内にしてください。';return;}
  try{const text=await file.text();if($('deliveryInputText')){$('deliveryInputText').value=text;$('deliveryInputError').textContent='';}}catch{if($('deliveryInputError'))$('deliveryInputError').textContent='ファイルを読み込めませんでした。';}
});
$('infoDialog').addEventListener('click',e=>{if(e.target===$('infoDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}const btn=e.target.closest('[data-try-method]');if(btn){const m=btn.dataset.tryMethod;if(!METHODS[m].problems.includes(state.type))changeProblem(METHODS[m].problems[0]);changeMethod(m);$('infoDialog').close();toast(`${METHODS[m].name}を選択しました`);}});
document.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea,button')||$('infoDialog').open)return;if(e.code==='Space'){e.preventDefault();toggleRun();}else if(e.key==='ArrowRight'&&!state.running){e.preventDefault();$('stepBtn').click();}else if(e.key.toLowerCase()==='r')$('resetBtn').click();else if(e.key.toLowerCase()==='n')$('newProblem').click();else if(e.key==='?')shortcuts();});
scene.addEventListener('pointerdown',e=>{
  if(state.type!=='tsp'||state.running)return;const r=scene.getBoundingClientRect();let nearest=-1,dist=18;
  problem.points.forEach((p,i)=>{const [x,y]=plotPoint(p,r.width,r.height),d=Math.hypot(x-(e.clientX-r.left),y-(e.clientY-r.top));if(d<dist){dist=d;nearest=i;}});
  if(nearest>=0){dragged=nearest;scene.setPointerCapture(e.pointerId);scene.style.cursor='grabbing';}
});
scene.addEventListener('pointermove',e=>{if(dragged<0)return;const r=scene.getBoundingClientRect();problem.points[dragged]=[clamp((e.clientX-r.left-30)/(r.width-60),.02,.98),clamp((e.clientY-r.top-26)/(r.height-85),.02,.98)];draw();});
function finishDrag(){if(dragged<0)return;dragged=-1;scene.style.cursor='';problem.dist=problem.points.map(a=>problem.points.map(b=>Math.hypot(a[0]-b[0],a[1]-b[1])));reset();toast('都市の位置を更新し、探索をリセットしました');}
scene.addEventListener('pointerup',finishDrag);scene.addEventListener('pointercancel',finishDrag);
scene.addEventListener('pointerdown',inspectKnapsack);
scene.addEventListener('pointerdown',inspectDelivery);
scene.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){inspectKnapsack(e);inspectDelivery(e);}});
scene.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){const changed=deliveryFocus>=0;inspectedItem=-1;deliveryFocus=-1;$('itemTooltip').hidden=true;if(changed)draw();}});
document.addEventListener('visibilitychange',()=>{lastTime=performance.now();accumulator=0;});
const observer=new ResizeObserver(()=>{draw();drawChart();});observer.observe($('canvasWrap'));observer.observe(chart.parentElement);
applyProblemPace();ensureComparison();renderUI();reset({newProblem:true});requestAnimationFrame(frame);
