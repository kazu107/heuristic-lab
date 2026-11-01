export function deliveryGeometry(width,height){const span=Math.max(1,Math.min(width-92,height-100));return {left:(width-span)/2,top:20,span};}
export function deliveryPoint(point,g){return [g.left+point[0]/800*g.span,g.top+(800-point[1])/800*g.span];}
export function deliveryHitTest(p,g,x,y,radius=9){let best=-1,distance=radius;for(let i=0;i<p.points.length;i++){const [px,py]=deliveryPoint(p.points[i],g),d=Math.hypot(px-x,py-y);if(d<distance){best=i;distance=d;}}return best<0?-1:Math.floor(best/2);}

function dot(c,x,y,r,fill,stroke){c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1.2;c.stroke();}}
function path(c,p,route,g,color,width,dashed=false){
  const points=[p.depot,...route.map(node=>p.points[node]),p.depot].map(point=>deliveryPoint(point,g));
  c.beginPath();c.moveTo(...points[0]);
  for(let i=1;i<points.length;i++){const [x,y]=points[i],[px,py]=points[i-1];if(i%2)c.lineTo(x,py);else c.lineTo(px,y);c.lineTo(x,y);}
  c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.setLineDash(dashed?[3,4]:[]);c.stroke();c.setLineDash([]);
}

export function drawDelivery(c,width,height,p,route,{current=null,ghost=false,focus=-1}={}){
  const g=deliveryGeometry(width,height);
  c.fillStyle='#f6f9f7';c.fillRect(0,0,width,height);
  c.font='8px "DM Sans", sans-serif';c.fillStyle='#8ca496';c.lineWidth=.6;
  for(let value=0;value<=800;value+=100){const [x,y]=deliveryPoint([value,value],g);c.strokeStyle='#dce7df';c.beginPath();c.moveTo(x,g.top);c.lineTo(x,g.top+g.span);c.moveTo(g.left,y);c.lineTo(g.left+g.span,y);c.stroke();if(value%200===0){c.textAlign='center';c.fillText(String(value),x,g.top+g.span+14);c.textAlign='right';c.fillText(String(value),g.left-7,y+3);}}
  c.strokeStyle='#c9d9ce';c.strokeRect(g.left,g.top,g.span,g.span);c.textAlign='left';
  for(const point of p.points){const [x,y]=deliveryPoint(point,g);dot(c,x,y,1.1,'#849e9145');}
  if(ghost&&current)path(c,p,current,g,'#9eafa84f',1,true);
  path(c,p,route,g,'#198970b8',1.7);
  const marker=Math.max(2.4,Math.min(4,g.span/125));
  for(const node of route){const [x,y]=deliveryPoint(p.points[node],g);dot(c,x,y,marker+1.2,'#fff');if(node%2===0)dot(c,x,y,marker,'#288f70');else{c.fillStyle='#d29450';c.fillRect(x-marker,y-marker,marker*2,marker*2);}}
  if(focus>=0&&p.orders[focus]){
    const [px,py]=deliveryPoint(p.orders[focus].pickup,g),[dx,dy]=deliveryPoint(p.orders[focus].drop,g);
    c.setLineDash([4,4]);c.beginPath();c.moveTo(px,py);c.lineTo(dx,dy);c.strokeStyle='#8d76bf';c.lineWidth=1.3;c.stroke();c.setLineDash([]);
    dot(c,px,py,marker+5,null,'#8d76bf');dot(c,dx,dy,marker+5,null,'#8d76bf');
    c.fillStyle='#755f9c';c.font='10px "DM Sans", sans-serif';c.fillText(`#${focus+1}`,px+8,py-8);
  }
  const [ox,oy]=deliveryPoint(p.depot,g);c.save();c.translate(ox,oy);c.rotate(Math.PI/4);c.fillStyle='#537aab';c.strokeStyle='#fff';c.lineWidth=2;c.fillRect(-5,-5,10,10);c.strokeRect(-5,-5,10,10);c.restore();
  c.fillStyle='#5277a1';c.font='8px "DM Sans", sans-serif';c.fillText('OFFICE',ox+11,oy-10);
  return g;
}
