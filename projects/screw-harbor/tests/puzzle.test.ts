import { expect, test } from '@playwright/test';
import { Puzzle, assignColors, type ScrewColor, type ScrewSpec } from '../src/puzzle';

function batched(colors: ScrewColor[], layer = 0): ScrewSpec[] {
  let serial = 0;
  return colors.flatMap((color, batch) =>
    Array.from({ length: 3 }, () => ({
      id: `s-${serial++}`,
      partId: `part-${batch}`,
      color,
      layer,
    })),
  );
}

function generatedParts(total: number): Array<{ id: string; layer: number; screws: string[] }> {
  const parts = [];
  let remaining = total;
  let part = 0;
  while (remaining > 0) {
    const count = Math.min(2 + (part % 2), remaining);
    parts.push({
      id: `part-${part}`,
      layer: part % 9,
      screws: Array.from({ length: count }, (_, index) => `s-${part}-${index}`),
    });
    remaining -= count;
    part += 1;
  }
  return parts;
}

test.describe('AD puzzle rules', () => {
  test('any remaining screw can be removed regardless of layer or color', () => {
    const specs = batched(['coral', 'gold', 'mint']);
    specs[8].layer = 99;
    const puzzle = new Puzzle(specs, 2);
    expect(puzzle.canRemove(specs[8].id)).toBe(true);
    const result = puzzle.remove(specs[8].id);
    expect(result.ok).toBe(true);
    expect(puzzle.removed.has(specs[8].id)).toBe(true);
    expect(puzzle.buffer).toEqual(['mint']);
    expect(puzzle.remaining).toBe(8);
  });

  test('buffered colors drain recursively as their boxes enter the two-box window', () => {
    const specs = batched(['coral', 'gold', 'mint', 'blue']);
    const puzzle = new Puzzle(specs, 2);
    const mint = specs.filter((screw) => screw.color === 'mint').slice(0, 2);
    for (const screw of mint) expect(puzzle.remove(screw.id).ok).toBe(true);
    expect(puzzle.buffer).toEqual(['mint', 'mint']);
    for (const screw of specs.filter((screw) => screw.color === 'coral')) puzzle.remove(screw.id);
    expect(puzzle.buffer).toEqual([]);
    expect(puzzle.boxes.find((box) => box.color === 'mint')?.count).toBe(2);
    expect(puzzle.completedBoxes).toBe(1);
  });

  test('filling the limited buffer loses and prevents further removals', () => {
    const specs = batched(['coral', 'gold', 'mint', 'blue', 'violet']);
    const puzzle = new Puzzle(specs, 3);
    const risky = specs.filter((screw) => screw.color === 'mint' || screw.color === 'blue');
    for (const screw of risky.slice(0, 5)) expect(puzzle.remove(screw.id).ok).toBe(true);
    expect(puzzle.buffer).toHaveLength(5);
    expect(puzzle.status).toBe('lost');
    expect(puzzle.canRemove(specs[0].id)).toBe(false);
    expect(puzzle.remove(specs[0].id)).toEqual({ ok: false, reason: 'puzzle-lost' });
  });

  test('partReleased fires only when every screw in that part is gone', () => {
    const specs = batched(['coral', 'gold']);
    const puzzle = new Puzzle(specs, 1);
    expect(puzzle.remove(specs[0].id).partReleased).toBeUndefined();
    expect(puzzle.remove(specs[1].id).partReleased).toBeUndefined();
    expect(puzzle.remove(specs[2].id).partReleased).toBe('part-0');
  });

  for (const total of [150, 360]) {
    test(`authored exterior-to-interior witness wins a ${total}-screw stage`, () => {
      const parts = generatedParts(total);
      const first = assignColors(parts, 4, 910_000 + total);
      const again = assignColors(parts, 4, 910_000 + total);
      expect(again).toEqual(first);
      expect(first).toHaveLength(total);
      expect(new Set(first.map((screw) => screw.color)).size).toBe(5);
      expect(first.map((screw) => screw.id)).toEqual(parts.flatMap((part) => part.screws));
      const puzzle = new Puzzle(first, 4);
      for (const screw of first) {
        const result = puzzle.remove(screw.id);
        expect(result.ok, `witness failed at move ${puzzle.moves + 1}`).toBe(true);
      }
      expect(puzzle.status).toBe('won');
      expect(puzzle.remaining).toBe(0);
      expect(puzzle.buffer).toEqual([]);
      expect(puzzle.completedBoxes).toBe(Math.ceil(total / 3));
    });
  }

  test('a final partial box drains and wins without padding screws', () => {
    const specs = assignColors(generatedParts(151), 3, 151);
    const puzzle = new Puzzle(specs, 3);
    for (const screw of specs) puzzle.remove(screw.id);
    expect(puzzle.status).toBe('won');
    expect(puzzle.completedBoxes).toBe(51);
  });
});
