import type {ShipKind} from '../contract';
import {shipMarkPaths} from './ship-mark-paths';
export const FACTION_COLORS={ally:'#65a7ff',enemy:'#ff626c'} as const;
export interface FleetLabel {id:string;kind:ShipKind|'torpedo';name:string;hp:number;maxHp:number;friendly:boolean;selected?:boolean;hovered?:boolean;length:number}
/** CSS pixels, based on projected hull length; never render a banner larger than the close-up cap. */
export function fleetLabelLayout(projectedLength:number,viewportWidth:number,label:Pick<FleetLabel,'kind'|'selected'|'hovered'>){
 const torpedo=label.kind==='torpedo',compact=!torpedo&&projectedLength<110;
 if(compact){const width=Math.min(28,Math.max(18,14+projectedLength*.12));return{width,height:width,detailed:false,compact:true,mark:width-2,panel:0,gap:0,bar:0};}
 const desired=torpedo?76+projectedLength*.45:94+Math.sqrt(Math.max(0,projectedLength))*7;
 const width=Math.min(Math.max(torpedo?76:94,desired),torpedo?120:208,Math.max(76,viewportWidth*.38));
 const detailed=!torpedo&&width>=142,height=torpedo?26:width>=150?38:30;
 return{width,height,detailed,compact,mark:height-2,panel:torpedo?18:height>=38?21:17,gap:3,bar:height>=38?9:7};
}
export const healthCellFraction=(hp:number,maxHp:number,index:number)=>Math.max(0,Math.min(1,(maxHp>0?hp/maxHp:0)*10-index));
const iconCache=new Map<string,Path2D>();
function iconPath(source:string){let path=iconCache.get(source);if(!path){path=new Path2D(source);iconCache.set(source,path);}return path;}
const font='"Malgun Gothic", Arial, sans-serif';
function polygon(c:CanvasRenderingContext2D,points:number[][]){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
/** Matching 45-degree skew for both rows; text stays upright. Ten identical cells with exact partial health. */
export function paintFleetLabel(c:CanvasRenderingContext2D,label:FleetLabel,width:number,height:number,detailed:boolean){
 const torpedo=label.kind==='torpedo',mark=height-2,panel=torpedo?18:height>=38?21:17,bar=height>=38?9:7,gap=3,stack=torpedo?panel:panel+gap+bar;
 const compact=width===height||height===18;
 const team=label.friendly?FACTION_COLORS.ally:FACTION_COLORS.enemy;
 const x=mark*.5+4,y=(height-stack)*.5,bodyWidth=width-x-stack-1;
 c.fillStyle=team;polygon(c,[[mark/2,1],[mark,height/2],[mark/2,height-1],[0,height/2]]);c.fill();
 c.fillStyle='#0a1b29';polygon(c,[[mark/2,3],[mark-2,height/2],[mark/2,height-3],[2,height/2]]);c.fill();
 c.save();const iconSize=mark*.67;c.translate((mark-iconSize)/2,(height-iconSize)/2);c.scale(iconSize/(torpedo?32:512),iconSize/(torpedo?32:512));
 if(torpedo){c.strokeStyle=team;c.lineWidth=1.7;c.stroke(iconPath('M9 12h14l6 4-6 4H9Z M9 14 4 10v12l5-4 M4 16H1 M21 12v8'));}else{c.fillStyle=team;c.fill(iconPath(shipMarkPaths[label.kind as ShipKind]));}c.restore();
 if(compact)return;

 c.save();c.translate(x,y);c.transform(1,0,1,1,0,0);c.fillStyle='#0a1927';c.fillRect(0,0,bodyWidth,panel);c.fillStyle=team;c.fillRect(0,0,bodyWidth,1);
 if(!torpedo){const cellGap=width>=150?2:1.5,cell=(bodyWidth-9*cellGap)/10;for(let i=0;i<10;i++){const left=i*(cell+cellGap),top=panel+gap;c.fillStyle='#0b1926';c.fillRect(left,top,cell,bar);c.fillStyle='#54718c';c.fillRect(left,top,cell,.6);c.fillStyle=team;c.fillRect(left,top,cell*healthCellFraction(label.hp,label.maxHp,i),bar);}}
 c.restore();
 const textSize=width>=150?10:9,textY=y+panel/2;c.fillStyle='#f1f6fa';c.textBaseline='middle';c.font=`700 ${textSize}px ${font}`;
 const textX=x+panel/2+4,right=x+panel/2+bodyWidth-4;
 const name=label.name.replace(/\s+(\d+)$/,'$1');
 const value=`${Math.max(0,Math.ceil(label.hp))} / ${label.maxHp}`;
 c.font=`${textSize-1}px ${font}`;const valueWidth=detailed?c.measureText(value).width:0;
 c.font=`700 ${textSize}px ${font}`;const available=right-textX-(detailed?valueWidth+7:0);c.fillText(name,textX,textY,available);
 if(detailed){c.textAlign='right';c.font=`${textSize-1}px ${font}`;c.fillText(value,right,textY);c.textAlign='left';}
}
