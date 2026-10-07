import type {ActionMode,ShipKind} from './contract';
import type {PartId,PartState,ShipParts} from './parts';

export type ShipPartKey=PartId;
export type ShipPartState=PartState;
export interface PartBearingShip {
 kind:ShipKind;parts?:ShipParts;ap?:number;sunk?:boolean;
 attacked?:boolean;moved?:boolean;scouted?:boolean;sonared?:boolean;torpedoed?:boolean;
}
export interface RepairBearingShip extends PartBearingShip {
 hp:number;maxHp:number;ap:number;sunk:boolean;
 repaired?:boolean;repairCharges?:number;damageControl?:boolean;
}

const PARTS:ReadonlyArray<{key:ShipPartKey;label:string;short:string}>=[
 {key:'bridge',label:'함교',short:'함'},
 {key:'engine',label:'엔진',short:'엔'},
 {key:'weapon',label:'주무장',short:'무'},
 {key:'flightDeck',label:'비행갑판',short:'갑'},
 {key:'radar',label:'레이더',short:'레'},
 {key:'airDefense',label:'대공',short:'대'},
];

function stateOf(part:ShipPartState):'intact'|'damaged'|'destroyed'{
 return part.disabled||part.hp<=0?'destroyed':part.hp<part.maxHp?'damaged':'intact';
}

export function renderShipParts(container:HTMLElement,ship:PartBearingShip|undefined):void{
 container.replaceChildren();
 const available=PARTS.flatMap(meta=>{const part=ship?.parts?.[meta.key];return part?[{meta,part,state:stateOf(part)}]:[];});
 container.hidden=available.length===0;
 for(const {meta,part,state} of available){
  const chip=document.createElement('span'),label=document.createElement('span'),value=document.createElement('b');
  const status=state==='destroyed'?'파괴':state==='damaged'?`${Math.max(0,part.hp)}/${part.maxHp}`:'정상';
  chip.className='part-chip';chip.dataset.part=meta.key;chip.dataset.state=state;chip.title=`${meta.label} ${status}`;chip.setAttribute('aria-label',chip.title);
  label.className='part-label';label.dataset.short=meta.short;label.textContent=meta.label;value.dataset.shortState=state==='destroyed'?'파':state==='damaged'?'손':'정';value.textContent=status;chip.append(label,value);container.append(chip);
 }
}

export function blockedActionReason(ship:PartBearingShip|undefined,action:ActionMode):string|undefined{
 if(!ship)return '함선 선택';
 if(ship.sunk)return '침몰';
 if(action==='torpedo'&&ship.kind!=='destroyer')return '구축함 전용';
 if(action==='recon'&&ship.kind!=='carrier')return '항공모함 전용';
 const key:ShipPartKey|undefined=action==='move'?'engine':action==='attack'||action==='torpedo'?'weapon':action==='recon'?'flightDeck':action==='sonar'?'bridge':undefined;
 const part=key?ship.parts?.[key]:undefined;
 if(key&&part&&stateOf(part)==='destroyed')return key==='engine'?'엔진 파괴':key==='weapon'?'주무장 파괴':key==='bridge'?'함교 파괴':'비행갑판 파괴';
 const cost=action==='sonar'?2:action==='repair'?1:1;
 if(ship.ap!==undefined&&ship.ap<cost)return 'AP 부족';
 if(action==='attack'&&ship.attacked)return '이번 턴 공격 완료';
 if(action==='recon'&&ship.moved)return '이동 후 정찰 불가';
 if(action==='recon'&&ship.scouted)return '이번 턴 정찰 완료';
 if(action==='sonar'&&ship.sonared)return '이번 턴 소나 완료';
 if(action==='torpedo'&&ship.torpedoed)return '이번 턴 어뢰 완료';
 return undefined;
}

function hasRepairTarget(ship:RepairBearingShip):boolean{
 return ship.hp<ship.maxHp||Object.values(ship.parts??{}).some(part=>!!part&&part.hp>0&&part.hp<part.maxHp);
}

export function repairActionReason(ship:RepairBearingShip|undefined):string|undefined{
 if(!ship||ship.sunk)return '복구 불가';
 if(ship.repaired)return '이번 턴 복구 완료';
 if((ship.repairCharges??2)<=0)return '복구 자재 없음';
 if(ship.ap<1)return 'AP 부족';
 if(!hasRepairTarget(ship))return '손상 없음';
 return undefined;
}

export function renderRepairStatus(container:HTMLElement,ship:RepairBearingShip|undefined):void{
 container.hidden=ship?.repairCharges===undefined;
 if(container.hidden){container.textContent='';delete container.dataset.state;return;}
 const charges=Math.max(0,ship!.repairCharges??2),availability=charges?`복구 ${charges}`:'자재 없음';
 if(ship!.damageControl){container.textContent=`화재 억제 · ${availability}`;container.dataset.state='active';return;}
 if(ship!.hp<ship!.maxHp){
  const fire=Math.min(50,Math.max(5,Math.ceil((ship!.maxHp-ship!.hp)*.05)));
  container.textContent=`화재 -${fire}/턴 · ${availability}`;container.dataset.state='burning';return;
 }
 if(ship!.repaired){container.textContent=`복구 완료 · ${availability}`;container.dataset.state='spent';return;}
 container.textContent=availability;container.dataset.state=charges?'ready':'spent';
}
