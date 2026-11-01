import test from 'node:test';
import assert from 'node:assert/strict';
import {createProblem,objective,Simulation,METHODS,FUNCTIONS,PROBLEMS,GRAPH_CONNECTIONS,ITERATION_LIMITS,random} from '../dist/engine.mjs';
import {knapsackLayout,knapsackItemAt} from '../dist/knapsack-view.mjs';
import {isDeliveryRoute} from '../dist/delivery.mjs';

test('known objective values and planted coloring',()=>{
  const tsp={type:'tsp',dist:[[0,1,Math.SQRT2,1],[1,0,1,Math.SQRT2],[Math.SQRT2,1,0,1],[1,Math.SQRT2,1,0]]};
  assert.equal(objective(tsp,[0,1,2,3]),4);
  const knapsack={type:'knapsack',capacity:5,items:[{weight:2,value:7},{weight:4,value:10}]};
  assert.equal(objective(knapsack,[1,0]),-7);assert.ok(objective(knapsack,[1,1])>0);
  for(const f of Object.values(FUNCTIONS))assert.ok(Math.abs(f.f(...f.optimum))<1e-10);
  for(let seed=0;seed<10;seed++){const p=createProblem('coloring',24,seed);assert.equal(objective(p,p.groups),0);}
});

for(const type of ['tsp','function','knapsack','coloring','delivery'])for(const [method,meta] of Object.entries(METHODS))if(meta.problems.includes(type)){
  test(`${type}/${method}: legal solutions, actual scores, monotonic best and deterministic replay`,()=>{
    const p=createProblem(type,type==='function'?2:type==='delivery'?1000:18,42),a=new Simulation(p,method,{},42),b=new Simulation(p,method,{},42);
    let best=a.bestScore;
    for(let i=0;i<160;i++){
      a.step();b.step();assert.ok(a.bestScore<=best+1e-10);best=a.bestScore;
      assert.ok(Number.isFinite(best));assert.equal(a.currentScore,objective(p,a.current));assert.equal(best,objective(p,a.best));
      for(const x of [a.best,a.current,...a.population.map(v=>v.x)]){
        if(type==='tsp'){assert.equal(x.length,p.size);assert.deepEqual([...x].sort((a,b)=>a-b),Array.from({length:p.size},(_,i)=>i));}
        if(type==='function')assert.ok(x.every(v=>Number.isFinite(v)&&Math.abs(v)<=p.range));
        if(type==='knapsack'){assert.ok(x.every(v=>v===0||v===1));assert.ok(x.reduce((s,b,i)=>s+b*p.items[i].weight,0)<=p.capacity);}
        if(type==='coloring')assert.ok(x.every(v=>Number.isInteger(v)&&v>=0&&v<p.colors));
        if(type==='delivery')assert.ok(isDeliveryRoute(p,x));
      }
    }
    assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(a.iteration,160);assert.ok(a.evaluations>160);
  });
}

test('continuous optimizers find the known Sphere minimum',()=>{
  for(const method of ['pso','de','ga','sa','hill']){
    const sim=new Simulation(createProblem('function',2,14,'sphere'),method,{},14);
    for(let i=0;i<1200;i++)sim.step();
    assert.ok(sim.bestScore<.02,`${method}: ${sim.bestScore}`);
  }
});

test('live population changes and extreme supported parameter values stay valid',()=>{
  for(const method of ['ga','de','pso']){
    const sim=new Simulation(createProblem('function',2,7),method,{},7);
    sim.params.population=10;sim.step();assert.equal(sim.population.length,10);
    sim.params.population=100;sim.step();assert.equal(sim.population.length,100);
    for(const [key,,min,max] of METHODS[method].params){sim.params[key]=max;sim.step();sim.params[key]=min;sim.step();}
    assert.ok(Number.isFinite(sim.bestScore));
  }
});

test('seeded RNG, data generation, evaluation count, and unsupported combinations',()=>{
  const a=random(0),b=random(0);for(let i=0;i<50;i++)assert.equal(a(),b());
  assert.deepEqual(createProblem('tsp',20,42),createProblem('tsp',20,42));
  assert.notDeepEqual(createProblem('tsp',20,42).points,createProblem('tsp',20,43).points);
  const sim=new Simulation(createProblem('tsp',10,42),'sa');assert.equal(sim.evaluations,1);sim.step();assert.equal(sim.evaluations,2);
  assert.throws(()=>new Simulation(createProblem('tsp',10,42),'pso'));
});

for(const method of ['sa','ga','hill'])test(`10,000-item knapsack/${method}: capacity and value remain correct`,()=>{
  const p=createProblem('knapsack',PROBLEMS.knapsack.max,42),sim=new Simulation(p,method,{},42);
  let best=sim.bestScore;
  for(let i=0;i<40;i++){sim.step();assert.ok(sim.bestScore<=best);best=sim.bestScore;}
  for(const solution of [sim.best,sim.current,...sim.population.map(a=>a.x)]){
    assert.equal(solution.length,10000);assert.ok(solution.every(bit=>bit===0||bit===1));
    const totals=solution.reduce((a,bit,i)=>({weight:a.weight+bit*p.items[i].weight,value:a.value+bit*p.items[i].value}),{weight:0,value:0});
    assert.ok(totals.weight<=p.capacity);assert.equal(objective(p,solution),-totals.value);
  }
});

test('one million steps preserve a bounded full-run history and exact endpoint',()=>{
  const sim=new Simulation(createProblem('function',2,42,'sphere'),'hill',{},42);
  for(let i=0;i<ITERATION_LIMITS.max;i++)sim.step();
  assert.equal(sim.iteration,1000000);assert.equal(sim.evaluations,1000001);
  assert.ok(sim.history.length<=2400);assert.equal(sim.history[0].iteration,0);
  assert.ok(sim.history.some(h=>h.iteration>0&&h.iteration<250000));
  assert.ok(sim.history.some(h=>h.iteration>400000&&h.iteration<600000));
  const endpoint=sim.history.at(-1);assert.equal(endpoint.iteration,1000000);assert.equal(endpoint.best,sim.bestScore);assert.equal(endpoint.evaluations,sim.evaluations);
  assert.ok(sim.history.every((h,i)=>i===0||h.iteration>sim.history[i-1].iteration));
  assert.ok(sim.history.every((h,i)=>i===0||h.best<=sim.history[i-1].best));
  sim.step();assert.equal(sim.history.at(-1).iteration,1000001);
});

test('dense item grids fit mobile and desktop and inspect every item correctly',()=>{
  for(const count of [10,30,70,500,1000,5000,10000])for(const [width,height] of [[250,270],[650,310],[1250,750]]){
    const layout=knapsackLayout(count,width,height);
    assert.ok(layout.cellWidth>0&&layout.cellHeight>0);
    assert.ok(layout.left+layout.columns*(layout.cellWidth+layout.gap)-layout.gap<=width-22.9);
    assert.ok(layout.top+layout.rows*(layout.cellHeight+layout.gap)-layout.gap<=height-88.9);
    for(let i=0;i<count;i++){
      const x=layout.left+(i%layout.columns)*(layout.cellWidth+layout.gap)+layout.cellWidth/2;
      const y=layout.top+Math.floor(i/layout.columns)*(layout.cellHeight+layout.gap)+layout.cellHeight/2;
      assert.equal(knapsackItemAt(layout,x,y),i);
    }
    assert.equal(knapsackItemAt(layout,0,0),-1);
    assert.equal(knapsackItemAt(layout,width,height),-1);
    assert.equal(knapsackItemAt(layout,layout.left+layout.cellWidth+layout.gap/2,layout.top+1),-1);
  }
});

test('shifted landscapes preserve the original function and its known minimum',()=>{
  for(const [variant,base] of Object.entries(FUNCTIONS))for(const seed of [0,7,42,123]){
    const p=createProblem('function',2,seed,variant);
    assert.equal(p.functionLayout,'shifted');assert.ok(Math.abs(objective(p,p.optimum))<1e-9);
    assert.ok(p.optimum.every(v=>Math.abs(v)<=p.range));
    const {angle,offset}=p.coordinateTransform,c=Math.cos(angle),s=Math.sin(angle),u=.3,v=-.4;
    const x=offset[0]+c*u-s*v,y=offset[1]+s*u+c*v;
    assert.ok(Math.abs(p.f(x,y)-base.f(u,v))<1e-8);
    const same=createProblem('function',2,seed,variant);assert.deepEqual(p.coordinateTransform,same.coordinateTransform);
    const classic=createProblem('function',2,seed,variant,3,{functionLayout:'classic'});
    assert.equal(classic.f(u,v),base.f(u,v));assert.deepEqual(classic.optimum,base.optimum);
  }
  assert.notDeepEqual(createProblem('function',2,7).coordinateTransform,createProblem('function',2,42).coordinateTransform);
});

test('graph connection levels add constraints without losing a feasible planted coloring',()=>{
  assert.equal(PROBLEMS.coloring.size,60);assert.equal(PROBLEMS.coloring.colors,3);
  for(const seed of [7,42,123]){
    let previous=new Set();
    for(const graphConnections of Object.keys(GRAPH_CONNECTIONS)){
      const p=createProblem('coloring',60,seed,'rastrigin',3,{graphConnections}),edges=new Set(p.edges.map(e=>e.join(',')));
      assert.equal(objective(p,p.groups),0);assert.ok([...previous].every(e=>edges.has(e)));
      assert.ok(edges.size>previous.size);assert.ok(p.edges.every(([a,b])=>a!==b&&p.groups[a]!==p.groups[b]));previous=edges;
    }
  }
  const large=createProblem('coloring',150,42);assert.equal(large.points.length,150);assert.equal(objective(large,large.groups),0);
});

test('function observation preset extends visible progress and still reaches the minimum',()=>{
  const current=new Simulation(createProblem('function',2,42,'rastrigin'),'pso',{},42);
  const legacy=new Simulation(createProblem('function',2,42,'rastrigin',3,{functionLayout:'classic'}),'pso',{population:40,inertia:.7,cognitive:1.5,social:1.5},42);
  const firstNearMinimum=sim=>{for(let i=0;i<2000;i++){sim.step();if(sim.bestScore<1e-3)return sim.iteration;}return Infinity;};
  const before=firstNearMinimum(legacy),after=firstNearMinimum(current);
  assert.ok(after>before+20);assert.ok(after<2000);
});

test('graph observation preset keeps searching beyond the introductory instance',()=>{
  const current=new Simulation(createProblem('coloring'),'ga',{},42);
  const legacy=new Simulation(createProblem('coloring',24,42,'rastrigin',4,{graphConnections:'sparse'}),'ga',{population:40,mutation:.2,crossover:.85},42);
  const firstFeasible=sim=>{for(let i=0;i<2000;i++){sim.step();if(sim.bestScore===0)return sim.iteration;}return Infinity;};
  const before=firstFeasible(legacy),after=firstFeasible(current);
  assert.ok(after>before+30);assert.ok(after<2000);
});
