// Shared geometry keeps dense rendering and mouse/touch inspection in agreement.
export function knapsackLayout(count,width,height) {
  const left=23,top=20,availableWidth=Math.max(1,width-46),availableHeight=Math.max(1,height-109);
  const columns=Math.max(1,Math.ceil(Math.sqrt(count*availableWidth/availableHeight)));
  const rows=Math.ceil(count/columns);
  const unit=Math.min(availableWidth/columns,availableHeight/rows);
  const gap=Math.min(6,unit*.12);
  const cellWidth=(availableWidth-gap*(columns-1))/columns;
  const cellHeight=Math.min(56,(availableHeight-gap*(rows-1))/rows);
  return {left,top,columns,rows,gap,cellWidth,cellHeight,count};
}

export function knapsackItemAt(layout,x,y) {
  const {left,top,columns,gap,cellWidth,cellHeight,count}=layout;
  if(x<left||y<top)return -1;
  const column=Math.floor((x-left)/(cellWidth+gap)),row=Math.floor((y-top)/(cellHeight+gap));
  if(column>=columns)return -1;
  const index=row*columns+column;
  if(index>=count||(x-left)%(cellWidth+gap)>cellWidth||(y-top)%(cellHeight+gap)>cellHeight)return -1;
  return index;
}
