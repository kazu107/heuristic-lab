const TYPES=new Set(['tsp','function','knapsack','coloring','delivery']);
const METHODS=new Set(['sa','ga','pso','aco','de','hill']);
function validScore(type,score){if(!Number.isFinite(score))return false;if(type==='function')return score>=-1e-10;if(type==='knapsack')return Number.isInteger(score)&&score<=0;if(type==='coloring'||type==='delivery')return Number.isInteger(score)&&score>=0;return score>=0;}

export function describeRecordProblem(p){
  const common={version:1,type:p.type,seed:p.seed};
  if(p.type==='tsp')return {...common,size:p.size,points:p.points};
  if(p.type==='function')return {...common,variant:p.variant,range:p.range,layout:p.functionLayout,formula:p.baseFormula||p.formula,transform:p.coordinateTransform||null};
  if(p.type==='knapsack')return {...common,size:p.size,capacity:p.capacity,items:p.items};
  if(p.type==='coloring')return {...common,size:p.size,colors:p.colors,connections:p.graphConnections,edges:p.edges};
  if(p.type==='delivery')return {...common,targetCount:p.targetCount,depot:p.depot,orders:p.orders};
  throw new Error('Unknown record problem');
}

export function recordProblemSummary(p){
  if(p.type==='tsp')return `${p.size}都市${p.datasetSource==='edited'?' · 編集済み':''}`;
  if(p.type==='function')return `${p.name} · ${p.functionLayout==='classic'?'元の配置':'シードで配置を変化'}`;
  if(p.type==='knapsack')return `${p.size.toLocaleString('en-US')}個 · 容量${p.capacity}`;
  if(p.type==='coloring')return `${p.size}頂点 · ${p.colors}色 · 接続:${({sparse:'少なめ',standard:'標準',dense:'多め'})[p.graphConnections]}`;
  return 'AHC006 · 1,000件から50件';
}

export async function identifyRecordProblem(p,cryptoProvider=globalThis.crypto){
  const bytes=new TextEncoder().encode(JSON.stringify(describeRecordProblem(p)));
  const info={type:p.type,seed:p.seed,summary:recordProblemSummary(p)};
  const digest=await cryptoProvider.subtle.digest('SHA-256',bytes);
  const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return {id:`best-v1/${info.type}/${info.seed}/${hash}`,...info,dataId:hash.slice(0,8)};
}

export function validBestRecord(r){
  return !!r&&r.version===1&&typeof r.id==='string'&&r.id.startsWith(`best-v1/${r.type}/${r.seed}/`)
    &&TYPES.has(r.type)&&Number.isInteger(r.seed)&&validScore(r.type,r.score)&&METHODS.has(r.method)
    &&typeof r.summary==='string'&&typeof r.dataId==='string'&&Number.isFinite(Date.parse(r.updatedAt))
    &&Number.isInteger(r.iteration)&&r.iteration>=0&&Number.isInteger(r.evaluations)&&r.evaluations>=1
    &&(r.initialization==null||['nearby','random'].includes(r.initialization))
    &&r.params&&typeof r.params==='object'&&!Array.isArray(r.params)&&Object.values(r.params).every(Number.isFinite);
}

// Internal scores are always minimized, including negative knapsack values.
export function chooseBestRecord(identity,candidate,previous){
  if(!Number.isFinite(candidate.score)||!METHODS.has(candidate.method))throw new Error('Invalid record candidate');
  if(validBestRecord(previous)&&previous.id===identity.id&&previous.score<=candidate.score)return previous;
  const record={version:1,...identity,score:candidate.score,method:candidate.method,params:{...candidate.params},iteration:candidate.iteration,evaluations:candidate.evaluations,updatedAt:candidate.updatedAt||new Date().toISOString(),initialization:candidate.initialization||null};
  if(!validBestRecord(record))throw new Error('Invalid record metadata');
  return record;
}

export class BestRecordBook {
  constructor(onUpdate=()=>{}){
    this.onUpdate=onUpdate;this.identities=new WeakMap();this.buffers=new WeakMap();
    this.ready=new Promise((resolve,reject)=>{
      if(!globalThis.indexedDB){reject(new Error('記録用ストレージを利用できません。'));return;}
      const request=indexedDB.open('heuristic-lab-best-records',1);
      request.onupgradeneeded=()=>{request.result.createObjectStore('records',{keyPath:'id'});};
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
    });
    this.ready.catch(()=>{});
    this.channel=typeof window!=='undefined'&&globalThis.BroadcastChannel?new BroadcastChannel('heuristic-lab-best-records'):null;
    if(this.channel)this.channel.onmessage=async event=>{if(typeof event.data?.id!=='string')return;try{const record=await this.getById(event.data.id);if(record)this.onUpdate({record});}catch{}};
  }
  identity(problem){if(!this.identities.has(problem))this.identities.set(problem,identifyRecordProblem(problem));return this.identities.get(problem);}
  async getById(id){const db=await this.ready;return new Promise((resolve,reject)=>{const request=db.transaction('records','readonly').objectStore('records').get(id);request.onsuccess=()=>resolve(validBestRecord(request.result)?request.result:null);request.onerror=()=>reject(request.error);});}
  async list(){const db=await this.ready;return new Promise((resolve,reject)=>{const request=db.transaction('records','readonly').objectStore('records').getAll();request.onsuccess=()=>resolve(request.result.filter(validBestRecord).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));request.onerror=()=>reject(request.error);});}
  async write(identity,candidate){
    const db=await this.ready;
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('records','readwrite'),store=transaction.objectStore('records'),request=store.get(identity.id);let record,changed=false;
      request.onsuccess=()=>{try{record=chooseBestRecord(identity,candidate,request.result);changed=record!==request.result;if(changed)store.put(record);}catch(error){transaction.abort();reject(error);}};
      transaction.oncomplete=()=>resolve({record,changed});transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||new Error('記録の保存を中断しました。'));
    });
  }
  consider(problem,sim){
    if(!Number.isFinite(sim.bestScore))return;
    let buffer=this.buffers.get(problem);
    if(!buffer){buffer={problem,minimum:Infinity,pending:null,working:false};this.buffers.set(problem,buffer);}
    if(sim.bestScore>=buffer.minimum)return;
    buffer.minimum=sim.bestScore;
    buffer.pending={score:sim.bestScore,method:sim.method,params:{...sim.params},iteration:sim.iteration,evaluations:sim.evaluations,updatedAt:new Date().toISOString(),initialization:problem.initialization||null};
    this.onUpdate({problem,pending:true});
    if(!buffer.working)this.drain(buffer);
  }
  async drain(buffer){
    buffer.working=true;let candidate;
    try{
      const identity=await this.identity(buffer.problem);
      while(buffer.pending){candidate=buffer.pending;buffer.pending=null;const result=await this.write(identity,candidate);this.onUpdate({problem:buffer.problem,record:result.record,pending:!!buffer.pending});if(result.changed)this.channel?.postMessage({id:identity.id});}
    }catch(error){this.onUpdate({problem:buffer.problem,error});}
    finally{buffer.working=false;}
  }
}
