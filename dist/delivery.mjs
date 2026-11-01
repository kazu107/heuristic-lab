export const DELIVERY_RULES = Object.freeze({orderCount:1000,targetCount:50,coordinateMax:800,depot:[400,400]});
export const manhattan = (a,b) => Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);

export function generateDeliveryOrders(rng) {
  return Array.from({length:DELIVERY_RULES.orderCount},()=>{
    let pickup,drop;
    do{pickup=[Math.floor(rng()*801),Math.floor(rng()*801)];drop=[Math.floor(rng()*801),Math.floor(rng()*801)];}while(manhattan(pickup,drop)<100);
    return {pickup,drop};
  });
}

export function parseDeliveryInput(text) {
  if(typeof text!=='string'||text.length>100000)throw new Error('入力は100,000文字以内にしてください。');
  const tokens=text.trim()?text.trim().split(/\s+/):[];
  if(tokens.length!==4000)throw new Error(`1,000件 × 4整数の入力が必要です（現在 ${tokens.length.toLocaleString('en-US')} 個）。`);
  const values=tokens.map((token,i)=>{
    if(!/^\d+$/.test(token)||!Number.isInteger(Number(token))||Number(token)>800)throw new Error(`注文 ${Math.floor(i/4)+1} の座標は0〜800の整数にしてください。`);
    return Number(token);
  });
  return Array.from({length:1000},(_,i)=>{
    const [a,b,c,d]=values.slice(i*4,i*4+4);
    if(a===c&&b===d)throw new Error(`注文 ${i+1} の受取場所と配達先が同じです。`);
    return {pickup:[a,b],drop:[c,d]};
  });
}

export function makeDeliveryProblem(orders,seed=42,initialization='nearby',source='generated') {
  if(orders.length!==1000)throw new Error('AHC006では注文数は1,000件です。');
  const copied=orders.map((o,i)=>{
    const values=[...o.pickup,...o.drop];
    if(values.length!==4||values.some(v=>!Number.isInteger(v)||v<0||v>800)||manhattan(o.pickup,o.drop)===0)throw new Error(`注文 ${i+1} の座標が不正です。`);
    return {pickup:o.pickup.slice(),drop:o.drop.slice()};
  });
  const p={type:'delivery',size:1000,seed,targetCount:50,depot:[400,400],orders:copied,initialization:initialization==='random'?'random':'nearby',datasetSource:source};
  p.points=copied.flatMap(o=>[o.pickup,o.drop]);
  p.orderCost=copied.map(o=>manhattan(p.depot,o.pickup)+manhattan(o.pickup,o.drop)+manhattan(o.drop,p.depot));
  p.rankedOrders=Array.from({length:1000},(_,i)=>i).sort((a,b)=>p.orderCost[a]-p.orderCost[b]||a-b);
  return p;
}

export function isDeliveryRoute(p,route) {
  if(!Array.isArray(route)||route.length!==p.targetCount*2)return false;
  const status=new Map();
  for(const node of route){
    if(!Number.isInteger(node)||node<0||node>=p.orders.length*2)return false;
    const order=Math.floor(node/2);
    if(node%2===0){if(status.has(order))return false;status.set(order,1);}
    else{if(status.get(order)!==1)return false;status.set(order,2);}
  }
  return status.size===p.targetCount&&[...status.values()].every(value=>value===2);
}

export function deliveryDistance(p,route) {
  if(!isDeliveryRoute(p,route))return Infinity;
  let total=0,previous=p.depot;
  for(const node of route){const point=p.points[node];total+=manhattan(previous,point);previous=point;}
  return total+manhattan(previous,p.depot);
}
export const deliveryScore = time => Math.round(100000000/(1000+time));
export const deliveryOrderIds = route => route.filter(node=>node%2===0).map(node=>node/2);

function shuffled(array,rng){const out=array.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}

function greedyRoute(p,selected,rng,preferred=null) {
  const available=selected.map(id=>id*2),route=[];let previous=-1,point=p.depot;
  while(available.length){
    let best=0,bestKey=Infinity;const preferredNext=preferred?.get(previous);
    for(let j=0;j<available.length;j++){
      const node=available[j],distance=manhattan(point,p.points[node]);
      const key=distance*(preferredNext?.has(node) ? .8 : 1)+rng()*4;
      if(key<bestKey){bestKey=key;best=j;}
    }
    const node=available[best];available[best]=available[available.length-1];available.pop();
    route.push(node);if(node%2===0)available.push(node+1);previous=node;point=p.points[node];
  }
  return route;
}

export function deliveryCandidate(p,rng) {
  const selected=p.initialization==='random'
    ?shuffled(p.rankedOrders,rng).slice(0,50)
    :p.rankedOrders.slice(0,300).map(id=>({id,key:p.orderCost[id]+rng()*250})).sort((a,b)=>a.key-b.key||a.id-b.id).slice(0,50).map(a=>a.id);
  return greedyRoute(p,selected,rng);
}

// Optimal legal insertion of one pickup/drop pair into a fixed route, in O(route length).
export function insertDeliveryPair(p,route,order) {
  const n=route.length,pickup=p.orders[order].pickup,drop=p.orders[order].drop;
  const pickupDelta=[],dropDelta=[],suffixIndex=Array(n+2).fill(-1);
  for(let i=0;i<=n;i++){
    const before=i===0?p.depot:p.points[route[i-1]],after=i===n?p.depot:p.points[route[i]];
    pickupDelta[i]=manhattan(before,pickup)+manhattan(pickup,after)-manhattan(before,after);
    dropDelta[i]=manhattan(before,drop)+manhattan(drop,after)-manhattan(before,after);
  }
  for(let i=n;i>=0;i--){const next=suffixIndex[i+1];suffixIndex[i]=next<0||dropDelta[i]<=dropDelta[next]?i:next;}
  let best=Infinity,pickupAt=0,dropAt=0;
  for(let i=0;i<=n;i++){
    const before=i===0?p.depot:p.points[route[i-1]],after=i===n?p.depot:p.points[route[i]];
    const adjacent=manhattan(before,pickup)+manhattan(pickup,drop)+manhattan(drop,after)-manhattan(before,after);
    if(adjacent<best){best=adjacent;pickupAt=i;dropAt=i;}
    const j=suffixIndex[i+1];
    if(j>=0&&pickupDelta[i]+dropDelta[j]<best){best=pickupDelta[i]+dropDelta[j];pickupAt=i;dropAt=j;}
  }
  const out=route.slice();out.splice(pickupAt,0,order*2);out.splice(dropAt+1,0,order*2+1);return out;
}

function relocate(p,route,rng) {
  const out=route.slice(),from=Math.floor(rng()*out.length),[node]=out.splice(from,1);
  const partner=out.indexOf(node%2===0?node+1:node-1);
  const first=node%2===0?0:partner+1,last=node%2===0?partner:out.length;
  out.splice(first+Math.floor(rng()*(last-first+1)),0,node);return out;
}

export function deliveryNeighbor(p,route,rng,params={}) {
  const ids=deliveryOrderIds(route);
  if(rng()<(params.orderSwapRate??.3)){
    const removed=ids[Math.floor(rng()*ids.length)],selected=new Set(ids);
    const pool=Math.max(50,Math.min(1000,Math.round(params.candidatePool??250)));
    const candidates=(rng()<.85?p.rankedOrders.slice(0,pool):p.rankedOrders).filter(id=>!selected.has(id));
    const eligible=candidates.length?candidates:p.rankedOrders.filter(id=>!selected.has(id));
    const added=eligible[Math.floor(rng()*eligible.length)];
    return insertDeliveryPair(p,route.filter(node=>Math.floor(node/2)!==removed),added);
  }
  const move=rng();
  if(move<.2){const order=ids[Math.floor(rng()*ids.length)];return insertDeliveryPair(p,route.filter(node=>Math.floor(node/2)!==order),order);}
  if(move<.55){
    for(let attempt=0;attempt<6;attempt++){
      const a=Math.floor(rng()*(route.length-1)),b=Math.min(route.length-1,a+1+Math.floor(rng()*20)),seen=new Set();let valid=true;
      for(let i=a;i<=b;i++){const id=Math.floor(route[i]/2);if(seen.has(id)){valid=false;break;}seen.add(id);}
      if(valid){const out=route.slice();out.splice(a,b-a+1,...out.slice(a,b+1).reverse());return out;}
    }
  }
  return relocate(p,route,rng);
}

export function deliveryCrossover(p,a,b,rng) {
  const selected=shuffled([...new Set([...deliveryOrderIds(a),...deliveryOrderIds(b)])],rng).slice(0,50);
  const preferred=new Map();
  for(const route of [a,b]){let previous=-1;for(const node of route){if(!preferred.has(previous))preferred.set(previous,new Set());preferred.get(previous).add(node);previous=node;}}
  return greedyRoute(p,selected,rng,preferred);
}

export function formatDeliveryInput(p){return p.orders.map(o=>[...o.pickup,...o.drop].join(' ')).join('\n')+'\n';}
export function formatDeliveryOutput(p,route) {
  if(!isDeliveryRoute(p,route))throw new Error('受取・配達の順序または注文数が不正です。');
  const ids=deliveryOrderIds(route).sort((a,b)=>a-b).map(i=>i+1),points=[p.depot,...route.map(node=>p.points[node]),p.depot];
  return `50 ${ids.join(' ')}\n${points.length} ${points.flat().join(' ')}\n`;
}
