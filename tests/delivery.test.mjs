import test from 'node:test';
import assert from 'node:assert/strict';
import {createProblem,Simulation,random,objective} from '../dist/engine.mjs';
import {manhattan,parseDeliveryInput,makeDeliveryProblem,isDeliveryRoute,deliveryDistance,deliveryScore,deliveryNeighbor,deliveryCandidate,deliveryCrossover,deliveryOrderIds,insertDeliveryPair,formatDeliveryInput,formatDeliveryOutput} from '../dist/delivery.mjs';
import {deliveryGeometry,deliveryPoint,deliveryHitTest} from '../dist/delivery-view.mjs';

function independentDistance(p,route){let total=0,previous=[400,400];for(const node of route){const point=p.points[node];total+=Math.abs(previous[0]-point[0])+Math.abs(previous[1]-point[1]);previous=point;}return total+Math.abs(previous[0]-400)+Math.abs(previous[1]-400);}
function checkOfficialOutput(p,text){
  const [line1,line2]=text.trim().split('\n'),first=line1.split(/\s+/).map(Number),second=line2.split(/\s+/).map(Number);
  assert.equal(first[0],50);const ids=first.slice(1);assert.equal(ids.length,50);assert.equal(new Set(ids).size,50);assert.ok(ids.every(i=>i>=1&&i<=1000));
  const n=second[0],coords=second.slice(1);assert.equal(coords.length,n*2);const stops=Array.from({length:n},(_,i)=>coords.slice(i*2,i*2+2));
  assert.deepEqual(stops[0],[400,400]);assert.deepEqual(stops.at(-1),[400,400]);assert.ok(coords.every(v=>Number.isInteger(v)&&v>=0&&v<=800));
  for(const id of ids){const order=p.orders[id-1],pickup=stops.findIndex(a=>a[0]===order.pickup[0]&&a[1]===order.pickup[1]);assert.ok(pickup>=0);assert.ok(stops.some((a,i)=>i>pickup&&a[0]===order.drop[0]&&a[1]===order.drop[1]));}
  return stops.slice(1).reduce((sum,a,i)=>sum+Math.abs(a[0]-stops[i][0])+Math.abs(a[1]-stops[i][1]),0);
}

test('AHC006 generation, Manhattan metric and official scoring formula',()=>{
  assert.equal(manhattan([0,0],[3,4]),7);assert.equal(deliveryScore(9000),10000);assert.equal(deliveryScore(0),100000);
  for(const seed of [0,7,42]){const p=createProblem('delivery',1000,seed);assert.equal(p.orders.length,1000);assert.equal(p.targetCount,50);assert.deepEqual(p.depot,[400,400]);assert.ok(p.orders.every(o=>[...o.pickup,...o.drop].every(v=>Number.isInteger(v)&&v>=0&&v<=800)&&manhattan(o.pickup,o.drop)>=100));assert.deepEqual(p.orders,createProblem('delivery',1000,seed).orders);}
});

test('AHC006 input round trip and validation respect the input specification',()=>{
  const p=createProblem('delivery',1000,42),text=formatDeliveryInput(p);assert.deepEqual(parseDeliveryInput(text),p.orders);
  const close=p.orders.map(o=>({pickup:o.pickup.slice(),drop:o.drop.slice()}));close[0]={pickup:[0,0],drop:[1,1]};
  assert.deepEqual(parseDeliveryInput(close.map(o=>[...o.pickup,...o.drop].join(' ')).join('\n'))[0],close[0]);
  const imported=createProblem('delivery',1000,9,'rastrigin',3,{deliveryOrders:parseDeliveryInput(text)});assert.equal(imported.datasetSource,'imported');assert.deepEqual(imported.orders,p.orders);
  for(const bad of ['',text.split('\n').slice(1).join('\n'),text.replace(/^\d+/,'801'),text.replace(/^\d+/,'-1'),text.replace(/^\d+/,'1.5'),['1 1 1 1',...text.trim().split('\n').slice(1)].join('\n')])assert.throws(()=>parseDeliveryInput(bad));
});

test('best pair insertion matches exhaustive legal insertion',()=>{
  const p=createProblem('delivery',1000,42),route=[0,2,1,4,3,5],order=7,actual=insertDeliveryPair(p,route,order);
  let best=Infinity;
  for(let pickup=0;pickup<=route.length;pickup++)for(let drop=pickup+1;drop<=route.length+1;drop++){const candidate=route.slice();candidate.splice(pickup,0,order*2);candidate.splice(drop,0,order*2+1);best=Math.min(best,independentDistance(p,candidate));}
  assert.equal(independentDistance(p,actual),best);assert.deepEqual(actual.filter(n=>Math.floor(n/2)!==order),route);assert.ok(actual.indexOf(order*2)<actual.indexOf(order*2+1));
});

test('candidate, crossover and every neighborhood preserve fifty complete ordered deliveries',()=>{
  for(const initialization of ['nearby','random']){
    const p=createProblem('delivery',1000,7,'rastrigin',3,{deliveryInitialization:initialization}),rng=random(91),a=deliveryCandidate(p,rng),b=deliveryCandidate(p,rng);
    assert.ok(isDeliveryRoute(p,a));assert.ok(isDeliveryRoute(p,b));const untouched=a.slice();
    for(let i=0;i<100;i++)assert.ok(isDeliveryRoute(p,deliveryCrossover(p,a,b,rng)));
    for(const rate of [0,.3,1])for(const pool of [50,250,1000]){let route=a.slice();for(let i=0;i<100;i++){const next=deliveryNeighbor(p,route,rng,{orderSwapRate:rate,candidatePool:pool});assert.ok(isDeliveryRoute(p,next));if(rate===0)assert.deepEqual(deliveryOrderIds(next).sort((a,b)=>a-b),deliveryOrderIds(route).sort((a,b)=>a-b));route=next;}}
    assert.deepEqual(a,untouched);
  }
});

test('invalid routes cannot receive an optimization score',()=>{
  const p=createProblem('delivery'),route=deliveryCandidate(p,random(7));assert.ok(isDeliveryRoute(p,route));
  const dropFirst=route.slice(),pickup=dropFirst.findIndex(n=>n%2===0),drop=dropFirst.indexOf(dropFirst[pickup]+1);[dropFirst[pickup],dropFirst[drop]]=[dropFirst[drop],dropFirst[pickup]];
  const duplicate=route.slice();duplicate[1]=duplicate[0];
  for(const invalid of [route.slice(1),dropFirst,duplicate,[...route.slice(0,-1),2000]]){assert.equal(isDeliveryRoute(p,invalid),false);assert.equal(objective(p,invalid),Infinity);assert.throws(()=>formatDeliveryOutput(p,invalid));}
});

test('exported route satisfies an independent checker for official input/output',()=>{
  const p=createProblem('delivery',1000,42),sim=new Simulation(p,'hill',{},42);for(let i=0;i<1200;i++)sim.step();
  const t=checkOfficialOutput(p,formatDeliveryOutput(p,sim.best));assert.equal(t,sim.bestScore);assert.equal(deliveryDistance(p,sim.best),t);assert.equal(deliveryScore(t),Math.floor(100000000/(1000+t)+.5));assert.ok(sim.bestScore<sim.initial);
  const repeated=makeDeliveryProblem(Array.from({length:1000},()=>({pickup:[399,400],drop:[400,401]}))),route=[...Array.from({length:50},(_,i)=>i*2),...Array.from({length:50},(_,i)=>i*2+1)];
  assert.ok(isDeliveryRoute(repeated,route));assert.equal(checkOfficialOutput(repeated,formatDeliveryOutput(repeated,route)),4);
});

test('delivery map preserves equal axis scales and locates order markers',()=>{
  const p={points:[[0,0],[800,800],[400,0],[0,800]]};
  for(const [width,height] of [[250,270],[650,310],[1250,750]]){const g=deliveryGeometry(width,height),a=deliveryPoint([0,0],g),b=deliveryPoint([800,800],g);assert.equal(b[0]-a[0],a[1]-b[1]);assert.ok(a[0]>=0&&b[0]<=width&&b[1]>=0&&a[1]<height);for(let node=0;node<p.points.length;node++){const [x,y]=deliveryPoint(p.points[node],g);assert.equal(deliveryHitTest(p,g,x,y,2),Math.floor(node/2));}assert.equal(deliveryHitTest(p,g,0,0,1),-1);}
});
