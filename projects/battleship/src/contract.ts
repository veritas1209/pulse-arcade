import type {ShipParts} from './parts';
export type ShipKind = 'carrier' | 'battleship' | 'destroyer';
export type ActionMode = 'move' | 'attack' | 'recon' | 'repair' | 'sonar' | 'torpedo';
export interface Cell { x: number; z: number }
export interface Placement extends Cell { id:string; heading?:number }
export interface DamageMark { x:number; z:number; seed:number; y?:number; normal?:[number,number,number] }
export interface ShipView extends Cell {
 id: string; kind: ShipKind; team: number; heading: number;
 hp: number; maxHp: number; ap: number; maxAp: number;
 attacked: boolean; moved: boolean; sunk: boolean;
 damageMarks?: DamageMark[];
 extinguishedMarkCount?: number;
 parts?:ShipParts;
 sonared?:boolean;torpedoed?:boolean;scouted?:boolean;repaired?:boolean;repairCharges?:number;damageControl?:boolean;lastTurnDamage?:number;
}
export interface ReconView { center: Cell; team: number; carrierId: string; expiresAt: number }
export interface SonarView { shipId:string;team:number;center:Cell;expiresAt:number }
export interface TorpedoView extends Cell { id:string;team:number;target?:Cell;route?:Cell[];heading:number }
export interface Shot extends Cell {
 by: number; sequence: number; hit: boolean; damage: number;
 blocked: boolean; halved: boolean; source?: Cell; shipId?: string; sunk?: boolean;
 localHit?: Cell;projectileId?:string;approachFrom?:Cell;
 kind?:'airstrike'|'missile'|'shell'|'torpedo';interceptedBy?:Cell;targetBefore?:ShipView;targetAfter?:ShipView;sourceShip?:ShipView;
}
export interface QueuedAttack {id:string;shipId:string;kind:'airstrike'|'missile'|'shell'|'torpedo';target:Cell;localHit?:Cell}
export interface BattleCommand { type: 'move'|'attack'|'recon'|'repair'|'sonar'|'torpedo'|'end'; shipId?: string; target?: Cell; localHit?:Cell }
export interface ViewState {
 phase: 'setup'|'waiting'|'battle'|'finished'; you: number; turn: number;
 round: number; turnNumber: number; winner: number|null;
 own: ShipView[]; revealed: ShipView[]; islands: Cell[]; visibleCells: Cell[];
 recon: ReconView[]; ready: [boolean,boolean]; connected: [boolean,boolean];
 revision: number; lastShot?: Shot; shots?:Shot[]; sonar?:SonarView[]; torpedoes?:TorpedoView[];
 combatPhase?:'action'|'attack';queuedAttacks?:QueuedAttack[];attackProgress?:{completed:number;total:number};resolutionStep?:number;
}
export interface SceneState {
 you: number; turn: number; own: ShipView[]; revealed: ShipView[];
 islands: Cell[]; visibleCells: Cell[]; recon: ReconView[];
 sonar?:SonarView[];torpedoes?:TorpedoView[];selectedId?: string; selectedCell?: Cell; targetCell?: Cell; reachable?: Cell[]; action?: ActionMode; deploymentCells?: Cell[];lastKnown?:Cell[];
}
export interface NavalScene {
 getFleetGeometry(ship:ShipView,low:boolean):import('three').BufferGeometry;
 getFleetAssets():Record<ShipKind,import('./naval/fleet').FleetAsset>;
 setState(state: SceneState): void;
 impact(shot: Shot, ship?: ShipView,reconCenter?:Cell): void;
 home(): void; deploymentView(team:number):void; focus(cell: Cell,follow?:boolean): void; resize(): void;
 update(delta: number, elapsed: number): void; render(): void; dispose(): void;
 project(cell: Cell): { x: number; y: number };
 cameraBearing():number;
 diagnostics(): Record<string, unknown>;
 visualShip(id:string):ShipView|undefined;
 clearEffects(resetFleet?:boolean):void;presentationBusy():boolean;actionBusy():boolean;isShipMoving(id:string):boolean;movingShipIds():string[];finishAttackPresentation():void;
}
