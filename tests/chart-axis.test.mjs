import test from 'node:test';
import assert from 'node:assert/strict';
import {iterationAxis} from '../dist/chart-axis.mjs';

test('linear iteration axis preserves zero and proportional distances',()=>{
  const axis=iterationAxis(2000,'linear',600);
  assert.equal(axis.position(0),0);assert.equal(axis.position(500),.25);assert.equal(axis.position(2000),1);
  assert.equal(axis.position(-1),null);assert.equal(axis.position(Infinity),null);
  assert.deepEqual(axis.ticks.map(t=>t.value),[0,500,1000,1500,2000]);
});

test('logarithmic iteration axis spaces decades equally and excludes zero',()=>{
  const axis=iterationAxis(1000000,'log',600),positions=[1,10,100,1000,10000,100000,1000000].map(n=>axis.position(n));
  assert.equal(axis.position(0),null);assert.equal(positions[0],0);assert.equal(positions.at(-1),1);
  for(let i=1;i<positions.length;i++)assert.ok(Math.abs(positions[i]-positions[i-1]-1/6)<1e-12);
  assert.ok(Math.abs(axis.position(100)-1/3)<1e-12);
});

test('logarithmic ticks remain ordered, finite and separated at small and large scales',()=>{
  for(const iterations of [0,1,10,100,2000,1000000])for(const width of [150,240,700]){
    const axis=iterationAxis(iterations,'log',width);
    assert.equal(axis.ticks[0].value,1);assert.ok(axis.end>=10);
    assert.ok(axis.ticks.every(t=>Number.isFinite(t.position)&&t.position>=0&&t.position<=1&&t.value>0));
    assert.ok(axis.ticks.every((t,i)=>i===0||t.value>axis.ticks[i-1].value));
    for(let i=1;i<axis.ticks.length;i++){const a=axis.ticks[i-1],b=axis.ticks[i],minimum=(a.label.length*4.5+b.label.length*4.5+4)/2+8;assert.ok((b.position-a.position)*width>=minimum-.001);}
  }
});
