export type ScrewColor = 'coral' | 'gold' | 'mint' | 'blue' | 'violet';

export const COLORS: readonly ScrewColor[] = ['coral', 'gold', 'mint', 'blue', 'violet'];

export interface ScrewSpec {
  id: string;
  partId: string;
  color: ScrewColor;
  /** Geometry metadata only. It never affects eligibility. */
  layer?: number;
}

export interface BoxState {
  color: ScrewColor;
  count: number;
  /** Three normally; only the final box may contain one or two screws. */
  target: number;
}

type BoxPlan = Pick<BoxState, 'color' | 'target'>;
const BOX_SIZE = 3;

export class Puzzle {
  readonly screws: ScrewSpec[];
  readonly removed = new Set<string>();
  buffer: ScrewColor[] = [];
  boxes: BoxState[] = [];
  queue: ScrewColor[] = [];
  status: 'playing' | 'won' | 'lost' = 'playing';
  moves = 0;
  completedBoxes = 0;

  private pending: BoxPlan[] = [];
  private readonly screwById = new Map<string, ScrewSpec>();

  constructor(screws: ScrewSpec[], difficulty: number) {
    void difficulty;
    this.screws = screws.map((screw) => ({ ...screw }));
    for (const screw of this.screws) {
      if (this.screwById.has(screw.id)) throw new Error(`Duplicate screw id: ${screw.id}`);
      this.screwById.set(screw.id, screw);
    }
    const plan = buildBoxPlan(this.screws);
    this.boxes = plan.slice(0, 2).map((box) => ({ ...box, count: 0 }));
    this.pending = plan.slice(2);
    this.syncQueue();
    if (this.screws.length === 0) this.status = 'won';
  }

  get remaining(): number {
    return this.screws.length - this.removed.size;
  }

  get bufferCapacity(): number {
    return 5;
  }

  canRemove(id: string): boolean {
    return this.status === 'playing' && this.screwById.has(id) && !this.removed.has(id);
  }

  remove(id: string): {
    ok: boolean;
    reason?: string;
    partReleased?: string;
    boxCompleted?: boolean;
  } {
    if (this.status !== 'playing') return { ok: false, reason: `puzzle-${this.status}` };
    const screw = this.screwById.get(id);
    if (!screw) return { ok: false, reason: 'unknown-screw' };
    if (this.removed.has(id)) return { ok: false, reason: 'already-removed' };

    const matchingBox = this.boxes.findIndex((box) => box.color === screw.color);
    if (matchingBox < 0 && this.buffer.length >= this.bufferCapacity) {
      return { ok: false, reason: 'buffer-full' };
    }

    this.removed.add(id);
    this.moves += 1;
    let boxCompleted = false;
    if (matchingBox >= 0) {
      this.boxes[matchingBox].count += 1;
      if (this.boxes[matchingBox].count === this.boxes[matchingBox].target) {
        this.completeBox(matchingBox);
        boxCompleted = true;
      }
    } else {
      this.buffer.push(screw.color);
    }

    boxCompleted = this.drainBuffer() || boxCompleted;
    if (this.remaining === 0 && this.buffer.length === 0) this.status = 'won';
    else if (this.buffer.length >= this.bufferCapacity) this.status = 'lost';

    const partReleased = this.screws
      .filter((candidate) => candidate.partId === screw.partId)
      .every((candidate) => this.removed.has(candidate.id))
      ? screw.partId
      : undefined;
    return {
      ok: true,
      ...(partReleased ? { partReleased } : {}),
      ...(boxCompleted ? { boxCompleted: true } : {}),
    };
  }

  private syncQueue(): void {
    this.queue = this.pending.map((box) => box.color);
  }

  private completeBox(index: number): void {
    this.completedBoxes += 1;
    const next = this.pending.shift();
    if (next) this.boxes[index] = { ...next, count: 0 };
    else this.boxes.splice(index, 1);
    this.syncQueue();
  }

  private drainBuffer(): boolean {
    let completed = false;
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (let boxIndex = 0; boxIndex < this.boxes.length; boxIndex += 1) {
        const bufferIndex = this.buffer.indexOf(this.boxes[boxIndex].color);
        if (bufferIndex < 0) continue;
        this.buffer.splice(bufferIndex, 1);
        this.boxes[boxIndex].count += 1;
        progressed = true;
        if (this.boxes[boxIndex].count === this.boxes[boxIndex].target) {
          this.completeBox(boxIndex);
          completed = true;
        }
        break;
      }
    }
    return completed;
  }
}

/**
 * Returns screws in the supplied authored part/screw order. Removing them in
 * this exact order is always a winning witness, so callers should pass parts
 * from exterior to interior even though the runtime permits every screw.
 */
export function assignColors(
  parts: { id: string; layer?: number; screws: unknown[] }[],
  difficulty: number,
  seed: number,
): ScrewSpec[] {
  const entries: Array<{ id: string; partId: string; layer?: number }> = [];
  const ids = new Set<string>();
  for (const part of parts) {
    part.screws.forEach((rawScrew, index) => {
      const id = screwId(rawScrew, part.id, index);
      if (ids.has(id)) throw new Error(`Duplicate screw id: ${id}`);
      ids.add(id);
      entries.push({ id, partId: part.id, ...(part.layer === undefined ? {} : { layer: part.layer }) });
    });
  }

  const batchCount = Math.ceil(entries.length / BOX_SIZE);
  const paletteSize = COLORS.length;
  const batchColors = scheduledColors(batchCount, paletteSize, seed, difficulty);
  return entries.map((entry, index) => ({
    ...entry,
    color: batchColors[Math.floor(index / BOX_SIZE)],
  }));
}

function buildBoxPlan(screws: ScrewSpec[]): BoxPlan[] {
  const plan: BoxPlan[] = [];
  for (let offset = 0; offset < screws.length; offset += BOX_SIZE) {
    const group = screws.slice(offset, offset + BOX_SIZE);
    const color = group[0].color;
    if (!group.every((screw) => screw.color === color)) {
      throw new Error('Screws must be ordered in monochrome box batches of up to three.');
    }
    plan.push({ color, target: group.length });
  }
  return plan;
}

function scheduledColors(
  batchCount: number,
  paletteSize: number,
  seed: number,
  difficulty: number,
): ScrewColor[] {
  const random = mulberry32((seed ^ (Math.floor(difficulty) * 0x9e3779b9)) >>> 0);
  const result: ScrewColor[] = [];
  while (result.length < batchCount) {
    const cycle = COLORS.slice(0, paletteSize);
    for (let index = cycle.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [cycle[index], cycle[swap]] = [cycle[swap], cycle[index]];
    }
    if (result.length > 0 && cycle[0] === result[result.length - 1] && cycle.length > 1) {
      [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    }
    result.push(...cycle.slice(0, batchCount - result.length));
  }
  return result;
}

function screwId(rawScrew: unknown, partId: string, index: number): string {
  if (typeof rawScrew === 'string' && rawScrew.length > 0) return rawScrew;
  if (typeof rawScrew === 'object' && rawScrew !== null && 'id' in rawScrew) {
    const id = (rawScrew as { id?: unknown }).id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return `${partId}-s${index + 1}`;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}
