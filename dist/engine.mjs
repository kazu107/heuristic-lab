// All objectives are minimized. Coordinates and distances are dimensionless.
export function random(seed = 42) {
  let n = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296;};
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const copy = x => x.slice();
const shuffle = (a, rng) => {for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const gaussian = r => Math.sqrt(-2 * Math.log(Math.max(1e-10,r()))) * Math.cos(2 * Math.PI * r());
export const FUNCTIONS = {
  rastrigin: {name:'Rastrigin', range:5.12, formula:'f(x, y) = 20 + x² + y² − 10(cos 2πx + cos 2πy)', f:(x,y)=>20+x*x+y*y-10*(Math.cos(2*Math.PI*x)+Math.cos(2*Math.PI*y)), optimum:[0,0]},
  ackley: {name:'Ackley',range:5,formula:'f(x, y) = −20e^(−0.2√((x²+y²)/2)) − e^((cos 2πx+cos 2πy)/2) + 20 + e',f:(x,y)=>-20*Math.exp(-.2*Math.sqrt((x*x+y*y)/2))-Math.exp((Math.cos(2*Math.PI*x)+Math.cos(2*Math.PI*y))/2)+20+Math.E,optimum:[0,0]},
  rosenbrock: {name:'Rosenbrock',range:2.5,formula:'f(x, y) = (1 − x)² + 100(y − x²)²', f:(x,y)=>(1-x)**2+100*(y-x*x)**2,optimum:[1,1]},
  sphere: {name:'Sphere',range:5,formula:'f(x, y) = x² + y²',f:(x,y)=>x*x+y*y,optimum:[0,0]}
};
export const METHODS = {
  sa:{name:'焼きなまし法',en:'Simulated Annealing',short:'SA',color:'#11856e',icon:'flame',problems:['tsp','function','knapsack','coloring'],description:'ときには悪い変化も受け入れ、局所解から抜け出す。温度を徐々に下げながら、よい解に絞り込みます。',detail:'改悪量 Δ と温度 T に対し、確率 exp(−Δ / T) で移動を受理します。温度が高いほど大胆に、低いほど慎重に探索します。',params:[['temperature','初期温度',.001,100,.001,.3],['cooling','冷却率',.9,.9999,.0001,.997],['stepSize','近傍の大きさ',.01,1,.01,.12]]},
  ga:{name:'遺伝的アルゴリズム',en:'Genetic Algorithm',short:'GA',color:'#8870d3',icon:'dna',problems:['tsp','function','knapsack','coloring'],description:'解の集団を育てる進化の探索。よい個体を選び、交叉と突然変異によって次の世代を作ります。',detail:'トーナメント選択・エリート保存を使用。巡回路には順序交叉、関数にはブレンド交叉、離散変数には一様交叉を適用します。',params:[['population','個体数',10,120,2,40],['mutation','突然変異率',0,1,.01,.2],['crossover','交叉率',0,1,.01,.85]]},
  pso:{name:'粒子群最適化',en:'Particle Swarm Optimization',short:'PSO',color:'#d08a35',icon:'swarm',problems:['function'],description:'粒子が経験と群れの情報を共有。自分の最良位置と群れの最良位置を手がかりに動きます。',detail:'v ← wv + c₁r₁(pbest − x) + c₂r₂(gbest − x)。探索範囲の境界では位置を制限し、速度を反転・減衰します。',params:[['population','粒子数',10,120,2,40],['inertia','慣性係数 w',.1,1.2,.01,.7],['cognitive','自己の重み c₁',0,3,.05,1.5],['social','群れの重み c₂',0,3,.05,1.5]]},
  aco:{name:'蟻コロニー最適化',en:'Ant Colony Optimization',short:'ACO',color:'#ce7661',icon:'ant',problems:['tsp'],description:'短い経路にフェロモンを残す蟻の群れ。よい経路の情報が蓄積し、次の探索を導きます。',detail:'Ant System 型の構築探索。辺の選択確率は τ^α × (1/d)^β に比例。各巡回後に蒸発し、全ての蟻が Q/L のフェロモンを残します。',params:[['population','蟻の数',10,100,2,30],['alpha','フェロモンの重み α',.1,4,.1,1],['beta','距離の重み β',.1,6,.1,3],['evaporation','蒸発率 ρ',.01,.9,.01,.25]]},
  de:{name:'差分進化法',en:'Differential Evolution',short:'DE',color:'#548dc6',icon:'branch',problems:['function'],description:'個体同士の差を、次の一歩に変える。集団の位置の差分から新しい候補を生み出します。',detail:'DE/rand/1/bin を使用。異なる3個体から a + F(b − c) を作り、二項交叉した候補が親以上なら置換します。',params:[['population','個体数',10,120,2,40],['differential','差分係数 F',.1,2,.05,.7],['crossover','交叉率 CR',0,1,.01,.9]]},
  hill:{name:'山登り法',en:'Hill Climbing',short:'HC',color:'#7a8a9b',icon:'mountain',problems:['tsp','function','knapsack','coloring'],description:'いまよりよい隣へ、一歩ずつ。改善する変化だけを受け入れる、シンプルな探索です。',detail:'ランダムな近傍を1つ生成し、目的値が改善したときに移動します。局所解では止まりやすいため、他の手法との比較にも向いています。',params:[['stepSize','近傍の大きさ',.01,1,.01,.12]]}
};
export const PROBLEMS = {
  tsp:{name:'巡回セールスマン',en:'Traveling Salesman',tag:'経路最適化',icon:'route',unit:'総移動距離',direction:'min',description:'すべての都市を一度ずつ訪れ、出発点に戻る。最も短い巡回路を探します。',sizeLabel:'都市数',min:10,max:100,step:5,size:40},
  function:{name:'関数最適化',en:'Function Optimization',tag:'連続最適化',icon:'landscape',unit:'目的関数値',direction:'min',description:'起伏のある地形を探索して、関数が最小になる座標を見つけます。',sizeLabel:null,size:2},
  knapsack:{name:'ナップサック',en:'0/1 Knapsack',tag:'組合せ最適化',icon:'bag',unit:'合計価値',direction:'max',description:'重さの制限の中で、価値の合計が最大になる品物の組合せを探します。',sizeLabel:'品物数',min:10,max:10000,step:1,size:30},
  coloring:{name:'グラフ彩色',en:'Graph Coloring',tag:'制約充足',icon:'network',unit:'色の衝突数',direction:'min',description:'隣り合う頂点が同じ色にならないように、指定した色数で塗り分けます。',sizeLabel:'頂点数',min:10,max:50,step:2,size:24}
};
export const ITERATION_LIMITS = {min:1,max:1000000,default:2000,presets:[500,2000,10000,100000,1000000]};
export function createProblem(type, size=PROBLEMS[type].size, seed=42, variant='rastrigin', colors=4) {
  const rng=random(seed), p={type,size,seed,variant,colors};
  if(type==='tsp') {
    p.points=Array.from({length:size},()=>[.05+.9*rng(),.05+.9*rng()]);
    p.dist=Array.from({length:size},(_,a)=>Array.from({length:size},(_,b)=>Math.hypot(p.points[a][0]-p.points[b][0],p.points[a][1]-p.points[b][1])));
  } else if(type==='function') Object.assign(p,FUNCTIONS[variant]);
  else if(type==='knapsack') {p.items=Array.from({length:size},()=>({weight:2+Math.floor(rng()*19),value:5+Math.floor(rng()*96)}));p.capacity=Math.round(p.items.reduce((s,i)=>s+i.weight,0)*.35);}
  else if(type==='coloring') {
    // A planted k-partite graph guarantees a feasible coloring with k colors.
    p.groups=shuffle(Array.from({length:size},(_,i)=>i%colors),rng);p.edges=[];
    for(let i=0;i<size;i++)for(let j=i+1;j<size;j++)if(p.groups[i]!==p.groups[j]&&rng()<.22)p.edges.push([i,j]);
    p.points=Array.from({length:size},(_,i)=>{const t=i/size*Math.PI*2;return [.5+.38*Math.cos(t),.5+.38*Math.sin(t)];});
  } else throw new Error('Unknown problem');
  return p;
}
export function objective(p,x) {
  if(p.type==='tsp')return x.reduce((s,a,i)=>s+p.dist[a][x[(i+1)%x.length]],0);
  if(p.type==='function')return p.f(x[0],x[1]);
  if(p.type==='knapsack'){let w=0,v=0;for(let i=0;i<x.length;i++)if(x[i]){w+=p.items[i].weight;v+=p.items[i].value;}return w>p.capacity?10000+(w-p.capacity)*100:-v;}
  return p.edges.reduce((s,[a,b])=>s+(x[a]===x[b]?1:0),0);
}
function repair(p,x,rng) {
  if(p.type==='function')return x.map(v=>clamp(v,-p.range,p.range));
  if(p.type==='knapsack') {
    let w=0;for(let i=0;i<x.length;i++)if(x[i])w+=p.items[i].weight;
    if(w<=p.capacity)return x;
    const selected=[];for(let i=0;i<x.length;i++)if(x[i])selected.push(i);
    // Draw without replacement only until feasible; avoid shuffling a large valid solution.
    while(w>p.capacity&&selected.length){const j=Math.floor(rng()*selected.length),i=selected[j];selected[j]=selected[selected.length-1];selected.pop();x[i]=0;w-=p.items[i].weight;}
  }
  return x;
}
function candidate(p,rng) {
  if(p.type==='tsp')return shuffle(Array.from({length:p.size},(_,i)=>i),rng);
  if(p.type==='function')return [(rng()*2-1)*p.range,(rng()*2-1)*p.range];
  return repair(p,Array.from({length:p.size},()=>p.type==='coloring'?Math.floor(rng()*p.colors):(rng()<.5?1:0)),rng);
}
function neighbor(p,x,rng,step=.12) {
  const y=copy(x);
  if(p.type==='tsp') {let a=Math.floor(rng()*y.length),b=Math.floor(rng()*y.length);if(a>b)[a,b]=[b,a];if(a===b)b=(b+1)%y.length;if(a>b)[a,b]=[b,a];y.splice(a,b-a+1,...y.slice(a,b+1).reverse());}
  else if(p.type==='function'){const d=Math.floor(rng()*2);y[d]+=gaussian(rng)*p.range*step;}
  else {const i=Math.floor(rng()*y.length);y[i]=p.type==='coloring'?(y[i]+1+Math.floor(rng()*(p.colors-1)))%p.colors:1-y[i];}
  return repair(p,y,rng);
}
function crossover(p,a,b,rng) {
  if(p.type==='tsp'){
    let l=Math.floor(rng()*a.length),r=Math.floor(rng()*a.length);if(l>r)[l,r]=[r,l];
    const out=Array(a.length).fill(-1),used=new Set(a.slice(l,r+1));for(let i=l;i<=r;i++)out[i]=a[i];
    let j=(r+1)%a.length;for(let t=1;t<=b.length;t++){const v=b[(r+t)%b.length];if(!used.has(v)){out[j]=v;j=(j+1)%a.length;}}return out;
  }
  if(p.type==='function')return repair(p,a.map((v,i)=>{const t=rng();return t*v+(1-t)*b[i];}),rng);
  return repair(p,a.map((v,i)=>rng()<.5?v:b[i]),rng);
}
export function defaults(method,type) {
  const params=Object.fromEntries(METHODS[method].params.map(a=>[a[0],a[5]]));
  if(method==='sa')params.temperature={tsp:.3,function:12,knapsack:30,coloring:3}[type];
  return params;
}
export class Simulation {
  constructor(problem,method,params={},seed=42){
    if(!METHODS[method]?.problems.includes(problem.type))throw new Error('Unsupported problem/method combination');
    this.problem=problem;this.method=method;this.params={...defaults(method,problem.type),...params};this.rng=random((Number(seed)+104729)>>>0);this.iteration=0;this.evaluations=0;this.accepted=0;this.bestScore=Infinity;this.history=[];this.historyStride=1;this.trail=[];
    this.current=candidate(problem,this.rng);this.currentScore=this.evaluate(this.current);this.initial=this.currentScore;
    this.population=[];
    if(['ga','pso','de'].includes(method))this.resizePopulation();
    if(method==='aco')this.pheromone=Array.from({length:problem.size},()=>Array(problem.size).fill(1));
    this.record();
  }
  evaluate(x){const score=objective(this.problem,x);this.evaluations++;if(score<this.bestScore){this.bestScore=score;this.best=copy(x);}return score;}
  resizePopulation(){const n=Math.max(4,Math.round(this.params.population));while(this.population.length<n){const x=candidate(this.problem,this.rng),score=this.evaluate(x);this.population.push({x,score,best:copy(x),bestScore:score,v:[0,0]});}if(this.population.length>n)this.population.sort((a,b)=>a.score-b.score).splice(n);}
  step(){
    const {problem:p,rng:r,params:q}=this;
    if(this.method==='sa'||this.method==='hill'){
      const x=neighbor(p,this.current,r,q.stepSize),s=this.evaluate(x),delta=s-this.currentScore;
      this.temperature=q.temperature*Math.pow(q.cooling,this.iteration);
      if(delta<=0||(this.method==='sa'&&r()<Math.exp(-delta/Math.max(1e-12,this.temperature)))){this.current=x;this.currentScore=s;this.accepted++;}
    } else if(this.method==='ga') {
      this.resizePopulation();const pop=this.population;
      const select=()=>{let a=pop[Math.floor(r()*pop.length)];for(let j=0;j<2;j++){const b=pop[Math.floor(r()*pop.length)];if(b.score<a.score)a=b;}return a.x;};
      const elite=pop.reduce((a,b)=>a.score<b.score?a:b),next=[{...elite,x:copy(elite.x)}];
      while(next.length<pop.length){const a=select();let x=r()<q.crossover?crossover(p,a,select(),r):copy(a);if(r()<q.mutation)x=neighbor(p,x,r,.15);next.push({x,score:this.evaluate(x)});}
      this.population=next;const a=next.reduce((a,b)=>a.score<b.score?a:b);this.current=copy(a.x);this.currentScore=a.score;
    } else if(this.method==='pso') {
      this.resizePopulation();const global=copy(this.best);
      for(const a of this.population){for(let d=0;d<2;d++){a.v[d]=clamp(q.inertia*a.v[d]+q.cognitive*r()*(a.best[d]-a.x[d])+q.social*r()*(global[d]-a.x[d]),-p.range*.5,p.range*.5);const v=a.x[d]+a.v[d];a.x[d]=clamp(v,-p.range,p.range);if(a.x[d]!==v)a.v[d]*=-.5;}
        a.score=this.evaluate(a.x);if(a.score<a.bestScore){a.bestScore=a.score;a.best=copy(a.x);}}
      const a=this.population.reduce((a,b)=>a.score<b.score?a:b);this.current=copy(a.x);this.currentScore=a.score;
    } else if(this.method==='de') {
      this.resizePopulation();const old=this.population.map(a=>({...a,x:copy(a.x)}));
      this.population=old.map((target,i)=>{const indices=shuffle(old.map((_,j)=>j).filter(j=>j!==i),r);const [a,b,c]=indices.map(j=>old[j].x),forced=Math.floor(r()*2);const x=repair(p,target.x.map((v,d)=>d===forced||r()<q.crossover?a[d]+q.differential*(b[d]-c[d]):v),r);const score=this.evaluate(x);return score<=target.score?{...target,x,score}:target;});
      const a=this.population.reduce((a,b)=>a.score<b.score?a:b);this.current=copy(a.x);this.currentScore=a.score;
    } else if(this.method==='aco') {
      const tours=[];
      for(let k=0;k<q.population;k++){
        const route=[Math.floor(r()*p.size)],remaining=new Set(Array.from({length:p.size},(_,i)=>i));remaining.delete(route[0]);
        while(remaining.size){const last=route[route.length-1],ids=[...remaining],weights=ids.map(j=>Math.pow(Math.max(1e-12,this.pheromone[last][j]),q.alpha)*Math.pow(1/Math.max(.001,p.dist[last][j]),q.beta));let v=r()*weights.reduce((a,b)=>a+b,0),j=0;while(j<ids.length-1&&v>weights[j])v-=weights[j++];route.push(ids[j]);remaining.delete(ids[j]);}
        const score=this.evaluate(route);tours.push({x:route,score});
      }
      for(let i=0;i<p.size;i++)for(let j=0;j<p.size;j++)this.pheromone[i][j]=Math.max(1e-8,this.pheromone[i][j]*(1-q.evaporation));
      for(const a of tours)for(let i=0;i<a.x.length;i++){const u=a.x[i],v=a.x[(i+1)%a.x.length],deposit=1/a.score;this.pheromone[u][v]+=deposit;this.pheromone[v][u]+=deposit;}
      this.population=tours;const a=tours.reduce((a,b)=>a.score<b.score?a:b);this.current=copy(a.x);this.currentScore=a.score;
    }
    this.iteration++;if(p.type==='function'){this.trail.push(copy(this.current));if(this.trail.length>120)this.trail.shift();}this.record();return this.bestScore;
  }
  record(){
    // Preserve samples across the whole run plus an always-current endpoint.
    const last=this.history.at(-1);if(last&&last.iteration%this.historyStride!==0)this.history.pop();
    this.history.push({iteration:this.iteration,evaluations:this.evaluations,best:this.bestScore,current:this.currentScore});
    if(this.history.length>2400){this.historyStride*=2;this.history=this.history.filter(h=>h.iteration%this.historyStride===0||h.iteration===this.iteration);}
  }
  snapshot(){return {method:this.method,params:{...this.params},iterations:this.iteration,evaluations:this.evaluations,bestScore:this.bestScore,bestSolution:copy(this.best),historySampleStride:this.historyStride,history:this.history.map(h=>({...h}))};}
}
