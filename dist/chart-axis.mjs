export function iterationTickLabel(value){
  if(value>=1000000)return `${+(value/1000000).toFixed(2)}M`;
  if(value>=1000)return `${+(value/1000).toFixed(2)}k`;
  return String(value);
}

export function iterationAxis(iterations,mode='linear',width=500){
  const logarithmic=mode==='log',start=logarithmic?1:0,end=Math.max(logarithmic?10:100,Number.isFinite(iterations)?Math.floor(iterations):0);
  const position=value=>!Number.isFinite(value)||value<start||value>end?null:logarithmic?Math.log10(value)/Math.log10(end):value/end;
  const tick=(value,major=true)=>({value,position:position(value),label:iterationTickLabel(value),major});
  if(!logarithmic)return {start,end,mode:'linear',position,ticks:[...new Set(Array.from({length:5},(_,i)=>Math.round(end*i/4)))].map(value=>tick(value))};
  const majors=[];for(let value=1;value<=end;value*=10)majors.push(tick(value));
  const labelWidth=t=>t.label.length*4.5+2;
  const fits=(a,b)=>Math.abs(a.position-b.position)*width>=(labelWidth(a)+labelWidth(b))/2+8;
  let ticks=majors;
  for(let stride=1;stride<majors.length;stride++){
    ticks=majors.filter((_,i)=>i%stride===0||i===majors.length-1);
    if(ticks.every((t,i)=>i===0||fits(t,ticks[i-1])))break;
  }
  const extras=[];for(let power=1;power<=end;power*=10)for(const factor of [2,5])if(power*factor<=end)extras.push(tick(power*factor,false));
  if(!majors.some(t=>t.value===end))extras.push(tick(end,false));
  for(const t of extras)if(!ticks.some(other=>other.value===t.value)&&ticks.every(other=>fits(t,other)))ticks.push(t);
  ticks.sort((a,b)=>a.value-b.value);
  return {start,end,mode:'log',position,ticks};
}
