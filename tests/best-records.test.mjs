import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createProblem,defaults} from '../dist/engine.mjs';
import {identifyRecordProblem,chooseBestRecord,validBestRecord} from '../dist/best-records.mjs';

const identify=p=>identifyRecordProblem(p,webcrypto);
const proposal=(score,method='sa')=>({score,method,params:{temperature:30,cooling:.999},iteration:100,evaluations:101,updatedAt:'2026-11-02T00:00:00.000Z'});

test('record identities are stable per problem and seed and ignore solver parameters',async()=>{
  for(const type of ['tsp','function','knapsack','coloring','delivery']){
    const a=await identify(createProblem(type,undefined,42)),b=await identify(createProblem(type,undefined,42)),other=await identify(createProblem(type,undefined,43));
    assert.equal(a.id,b.id);assert.notEqual(a.id,other.id);
    const p=createProblem(type,undefined,42);p.solverParams=defaults('sa',type);p.solverParams.temperature=999;
    assert.equal(a.id,(await identify(p)).id);
  }
});

test('record identities separate problem conditions and edited input data',async()=>{
  const tsp=createProblem('tsp',40,42),old=await identify(tsp);tsp.points[0][0]+=.001;
  assert.notEqual(old.id,(await identify(tsp)).id);assert.notEqual(old.id,(await identify(createProblem('tsp',45,42))).id);
  const f=await identify(createProblem('function',2,42,'rastrigin'));
  assert.notEqual(f.id,(await identify(createProblem('function',2,42,'sphere'))).id);
  assert.notEqual(f.id,(await identify(createProblem('function',2,42,'rastrigin',3,{functionLayout:'classic'}))).id);
  const knapsack=createProblem('knapsack',30,42),k=await identify(knapsack);knapsack.capacity++;
  assert.notEqual(k.id,(await identify(knapsack)).id);
  const graph=await identify(createProblem('coloring',60,42,'rastrigin',3));
  assert.notEqual(graph.id,(await identify(createProblem('coloring',60,42,'rastrigin',4))).id);
  assert.notEqual(graph.id,(await identify(createProblem('coloring',60,42,'rastrigin',3,{graphConnections:'sparse'}))).id);
});

test('AHC006 records share the same input across initializations but separate imported data',async()=>{
  const p=createProblem('delivery',1000,42),a=await identify(p);
  const imported=createProblem('delivery',1000,42,'rastrigin',3,{deliveryOrders:p.orders,deliveryInitialization:'random'});
  assert.equal(a.id,(await identify(imported)).id);
  imported.orders[0].pickup[0]++;
  assert.notEqual(a.id,(await identify(imported)).id);
});

test('only better raw scores replace a record; ties retain the original provenance',async()=>{
  const id=await identify(createProblem('knapsack',30,42));
  const first=chooseBestRecord(id,proposal(-100),null);
  const better=chooseBestRecord(id,proposal(-150,'ga'),first);
  assert.equal(better.score,-150);assert.equal(better.method,'ga');
  assert.strictEqual(chooseBestRecord(id,proposal(-120,'hill'),better),better);
  assert.strictEqual(chooseBestRecord(id,proposal(-150,'hill'),better),better);
  const otherId=await identify(createProblem('knapsack',30,43));
  assert.equal(chooseBestRecord(otherId,proposal(-90),better).score,-90);
});

test('record precision, metadata copies and corrupt-storage validation',async()=>{
  const id=await identify(createProblem('function',2,42,'sphere')),candidate=proposal(1e-9);
  const first=chooseBestRecord(id,candidate,null);candidate.params.temperature=900;
  assert.equal(first.params.temperature,30);assert.ok(validBestRecord(first));
  const better=chooseBestRecord(id,proposal(1e-12,'pso'),first);assert.equal(better.score,1e-12);
  assert.equal(validBestRecord({...first,score:'0'}),false);assert.equal(validBestRecord({...first,updatedAt:'invalid'}),false);
  assert.equal(validBestRecord({...first,method:'unknown'}),false);assert.equal(validBestRecord({...first,params:[]}),false);
  assert.equal(validBestRecord({...first,score:-1}),false);
  for(const score of [NaN,Infinity,-Infinity])assert.throws(()=>chooseBestRecord(id,proposal(score),first));
});
