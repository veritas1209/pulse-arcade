#!/usr/bin/env python3
"""Generate the Screw Harbor procedural PBR surface atlas.

Every 512 px cell is periodic in X and Y.  The atlas is deliberately neutral so
the game shader can tint it with the authored screw and object palette.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SEED = 2765
CELL = 512
COLS, ROWS = 4, 2
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "materials"
ARTIFACTS = ROOT / "artifacts" / "materials"

MATERIALS = [
    "oak-planks",
    "brushed-steel-plates",
    "limestone-blocks",
    "marine-painted-metal",
    "aged-copper",
    "ceramic-roof-tiles",
    "woven-fabric",
    "non-slip-steel-deck",
]


def periodic_noise(rng: np.random.Generator, size: int, octaves: tuple[tuple[int, float], ...]) -> np.ndarray:
    """Band-limited periodic value noise, normalized to -1..1."""
    result = np.zeros((size, size), np.float32)
    yy, xx = np.mgrid[0:size, 0:size]
    for grid, amplitude in octaves:
        lattice = rng.normal(size=(grid, grid)).astype(np.float32)
        # Periodic bilinear interpolation of the wrapping lattice.
        gx = xx * grid / size
        gy = yy * grid / size
        x0 = np.floor(gx).astype(np.int32) % grid
        y0 = np.floor(gy).astype(np.int32) % grid
        x1 = (x0 + 1) % grid
        y1 = (y0 + 1) % grid
        tx = gx - np.floor(gx)
        ty = gy - np.floor(gy)
        tx = tx * tx * (3.0 - 2.0 * tx)
        ty = ty * ty * (3.0 - 2.0 * ty)
        result += amplitude * (
            lattice[y0, x0] * (1 - tx) * (1 - ty)
            + lattice[y0, x1] * tx * (1 - ty)
            + lattice[y1, x0] * (1 - tx) * ty
            + lattice[y1, x1] * tx * ty
        )
    result -= result.mean()
    result /= max(float(np.max(np.abs(result))), 1e-6)
    return result


def pdist(v: np.ndarray, center: float, period: float) -> np.ndarray:
    return np.abs((v - center + period * 0.5) % period - period * 0.5)


def normalize(v: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(v, [0.4, 99.6])
    return np.clip((v - lo) / max(hi - lo, 1e-6), 0, 1)


def tile_maps(index: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    s = CELL
    y, x = np.mgrid[0:s, 0:s].astype(np.float32)
    u, v = x / s, y / s
    fine = periodic_noise(rng, s, ((8, 0.32), (20, 0.23), (48, 0.15), (96, 0.08)))
    broad = periodic_noise(rng, s, ((3, 0.75), (7, 0.28)))

    if index == 0:  # quarter-sawn oak planks, horizontal boards
        plank = np.floor(v * 4)
        warp = 7 * periodic_noise(rng, s, ((2, 1.0), (5, 0.25)))
        grain = np.sin((v * 88 + warp / s * 12 + 2 * np.sin(u * 2 * np.pi)) * np.pi)
        grain += 0.42 * np.sin((v * 182 + warp / s * 25) * np.pi)
        seams = np.exp(-(pdist(y, 0, s / 4) / 2.0) ** 2)
        # Periodic knots with repeated copies implicit through wrapped distance.
        knots = np.zeros_like(u)
        for cx, cy in [(0.20, 0.15), (0.72, 0.63)]:
            dx, dy = pdist(u, cx, 1.0), pdist(v, cy, 1.0)
            r = np.sqrt((dx * 2.2) ** 2 + (dy * 9.0) ** 2)
            knots += np.exp(-(r / 0.12) ** 2) * np.cos(r * 115)
        height = 0.50 + 0.055 * grain + 0.045 * fine + 0.09 * knots - 0.28 * seams
        color = 0.67 + 0.10 * grain + 0.055 * broad - 0.25 * seams + plank * 0.012
        rough = 0.61 + 0.09 * fine + 0.12 * seams - 0.045 * grain

    elif index == 1:  # brushed steel sheets, hairline scratches and faint welds
        brush = periodic_noise(rng, s, ((4, 0.12), (18, 0.20), (100, 0.68)))
        brush = (brush + np.roll(brush, 1, 1) + np.roll(brush, 2, 1)) / 3
        plate = np.maximum(np.exp(-(pdist(x, 0, s / 2) / 2.3) ** 2), np.exp(-(pdist(y, 0, s / 2) / 2.3) ** 2))
        scratches = np.zeros_like(u)
        for yy0, amp in [(0.13, 0.55), (0.37, 0.35), (0.77, 0.45)]:
            scratches += amp * np.exp(-(pdist(v, yy0, 1.0) / 0.0018) ** 2)
        weld = plate * (0.45 + 0.55 * np.sin((x + y) * 0.42) ** 2)
        height = 0.50 + 0.035 * brush - 0.12 * scratches + 0.065 * weld
        color = 0.71 + 0.035 * brush - 0.055 * scratches - 0.04 * plate
        rough = 0.43 + 0.085 * fine + 0.10 * scratches + 0.08 * weld

    elif index == 2:  # limestone ashlar blocks and mineral grains
        row = np.floor(v * 4).astype(np.int32)
        hy = np.exp(-(pdist(y, 0, s / 4) / 2.2) ** 2)
        shifted_x = (x + (row % 2) * s / 4) % s
        vx = np.exp(-(pdist(shifted_x, 0, s / 2) / 2.0) ** 2)
        joints = np.maximum(hy, vx)
        speck = periodic_noise(rng, s, ((24, 0.25), (70, 0.45), (128, 0.30)))
        pores = np.clip(-(fine + 0.38), 0, 1) ** 2
        height = 0.52 + 0.07 * broad + 0.035 * speck - 0.27 * joints - 0.08 * pores
        color = 0.76 + 0.065 * broad + 0.035 * speck - 0.19 * joints - 0.04 * pores
        rough = 0.76 + 0.07 * fine + 0.10 * joints + 0.06 * pores

    elif index == 3:  # powder-coated marine metal, restrained orange-peel
        px = np.exp(-(pdist(x, 0, s / 2) / 1.8) ** 2)
        py = np.exp(-(pdist(y, 0, s / 2) / 1.8) ** 2)
        joint = np.maximum(px, py)
        peel = periodic_noise(rng, s, ((40, 0.38), (90, 0.42), (150, 0.20)))
        scuff = np.clip(fine - 0.45, 0, 1)
        height = 0.50 + 0.030 * peel - 0.22 * joint - 0.035 * scuff
        color = 0.73 + 0.025 * peel - 0.16 * joint - 0.055 * scuff
        rough = 0.56 + 0.055 * peel + 0.14 * scuff + 0.08 * joint

    elif index == 4:  # aged copper: fine patina and gently hammered sheet
        hammer = periodic_noise(rng, s, ((12, 0.55), (28, 0.30), (64, 0.15)))
        patina = periodic_noise(rng, s, ((5, 0.62), (14, 0.25), (35, 0.13)))
        freckles = np.clip(fine - 0.25, 0, 1)
        height = 0.50 + 0.07 * hammer + 0.022 * fine
        color = 0.64 + 0.085 * patina + 0.035 * hammer - 0.035 * freckles
        rough = 0.58 + 0.13 * patina + 0.06 * fine + 0.045 * freckles

    elif index == 5:  # matte ceramic roof tiles, periodic overlapping courses
        cols = 8
        rows = 6
        row = np.floor(v * rows).astype(np.int32)
        shifted = (u * cols + (row % 2) * 0.5) % 1.0
        ridge = np.cos((shifted - 0.5) * np.pi) ** 2
        horizontal = np.exp(-(pdist(v, 0, 1 / rows) / 0.007) ** 2)
        vertical = np.exp(-(pdist(shifted, 0, 1) / 0.025) ** 2)
        joints = np.maximum(horizontal, vertical * (1 - horizontal))
        height = 0.47 + 0.13 * ridge + 0.025 * fine - 0.22 * joints
        color = 0.70 + 0.055 * ridge + 0.025 * broad - 0.17 * joints
        rough = 0.72 + 0.055 * fine + 0.09 * joints

    elif index == 6:  # close woven canvas
        warp = np.sin(u * 2 * np.pi * 64) ** 10
        weft = np.sin(v * 2 * np.pi * 56) ** 10
        over = np.where(((np.floor(u * 64) + np.floor(v * 56)) % 2) == 0, warp, weft)
        under = np.where(((np.floor(u * 64) + np.floor(v * 56)) % 2) == 0, weft, warp)
        weave = over - 0.42 * under
        height = 0.48 + 0.15 * weave + 0.025 * fine
        color = 0.66 + 0.10 * weave + 0.035 * broad
        rough = 0.86 + 0.045 * fine - 0.035 * weave

    else:  # non-slip deck plate: raised diagonal lozenges and panel seams
        a = ((x + y) % 64) - 32
        b = ((x - y) % 64) - 32
        tread = np.exp(-((a / 12) ** 2 + (b / 3.0) ** 2))
        tread += np.exp(-((b / 12) ** 2 + (a / 3.0) ** 2))
        panel = np.maximum(np.exp(-(pdist(x, 0, s / 2) / 2.2) ** 2), np.exp(-(pdist(y, 0, s / 2) / 2.2) ** 2))
        height = 0.45 + 0.23 * tread + 0.025 * fine - 0.13 * panel
        color = 0.68 + 0.09 * tread + 0.025 * fine - 0.10 * panel
        rough = 0.62 + 0.10 * fine + 0.06 * tread + 0.10 * panel

    color = np.clip(color, 0.23, 0.92)
    rough = np.clip(rough, 0.22, 0.96)
    return color.astype(np.float32), rough.astype(np.float32), height.astype(np.float32)


def normal_from_height(height: np.ndarray, strength: float = 3.4) -> np.ndarray:
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    n = np.dstack((-dx, -dy, np.ones_like(height)))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return np.clip((n * 0.5 + 0.5) * 255 + 0.5, 0, 255).astype(np.uint8)


def u8_gray(a: np.ndarray) -> np.ndarray:
    return np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_contact_sheet(color: Image.Image, rough: Image.Image, normal: Image.Image) -> None:
    scale = 0.27
    thumb_size = (round(color.width * scale), round(color.height * scale))
    margin, header = 28, 52
    sheet = Image.new("RGB", (thumb_size[0], header * 3 + thumb_size[1] * 3), (24, 27, 31))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for i, (title, source) in enumerate((("ALBEDO / TINT BASE", color), ("ROUGHNESS", rough.convert("RGB")), ("NORMAL", normal))):
        top = i * (header + thumb_size[1])
        draw.text((margin, top + 18), title, fill=(230, 234, 238), font=font)
        sheet.paste(source.resize(thumb_size, Image.Resampling.LANCZOS), (0, top + header))
        if i == 0:
            for cell_i, name in enumerate(MATERIALS):
                cx = (cell_i % COLS) * (thumb_size[0] / COLS) + 7
                cy = top + header + (cell_i // COLS) * (thumb_size[1] / ROWS) + 7
                label = f"{cell_i} {name}"
                box = draw.textbbox((0, 0), label, font=font)
                draw.rectangle((cx - 3, cy - 3, cx + box[2] + 3, cy + box[3] + 3), fill=(12, 14, 17))
                draw.text((cx, cy), label, fill=(244, 247, 250), font=font)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    sheet.save(ARTIFACTS / "contact-sheet.png", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    color_atlas = np.zeros((CELL * ROWS, CELL * COLS), np.uint8)
    rough_atlas = np.zeros_like(color_atlas)
    normal_atlas = np.zeros((CELL * ROWS, CELL * COLS, 3), np.uint8)

    for index in range(8):
        color, rough, height = tile_maps(index, rng)
        row, col = divmod(index, COLS)
        ys, xs = slice(row * CELL, (row + 1) * CELL), slice(col * CELL, (col + 1) * CELL)
        color_atlas[ys, xs] = u8_gray(color)
        rough_atlas[ys, xs] = u8_gray(rough)
        normal_atlas[ys, xs] = normal_from_height(height)

    color_img = Image.fromarray(color_atlas)
    rough_img = Image.fromarray(rough_atlas)
    normal_img = Image.fromarray(normal_atlas)
    files = {
        "color": OUT / "surface-color.webp",
        "roughness": OUT / "surface-roughness.webp",
        "normal": OUT / "surface-normal.webp",
    }
    color_img.save(files["color"], "WEBP", quality=90, method=6)
    rough_img.save(files["roughness"], "WEBP", lossless=True, method=6)
    normal_img.save(files["normal"], "WEBP", lossless=True, method=6)
    save_contact_sheet(color_img.convert("RGB"), rough_img, normal_img)

    manifest = {
        "generator": "scripts/generate-material-atlas.py",
        "seed": SEED,
        "atlas": {"width": CELL * COLS, "height": CELL * ROWS, "columns": COLS, "rows": ROWS, "cellSize": CELL},
        "uvIndexRule": "index = row * 4 + column; origin is top-left",
        "materials": [{"index": i, "row": i // COLS, "column": i % COLS, "name": name} for i, name in enumerate(MATERIALS)],
        "files": {},
        "notes": [
            "All cells are periodic in U and V; shader-side half-texel tile clamping is still required for atlas mip safety.",
            "Color is neutral grayscale to preserve runtime vertex-color tinting.",
            "Normal RGB uses tangent convention +X right, +Y up, +Z outward.",
        ],
    }
    for role, path in files.items():
        manifest["files"][role] = {"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}
    manifest_path = OUT / "surface-atlas.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    readme = """# Procedural surface atlas\n\nAuthored for Screw Harbor as deterministic, offline procedural art. No external images, logos, text, baked lighting, perspective, or screw imagery are present. The color atlas is deliberately neutral for runtime tinting; roughness and normals carry the close-range material response.\n\nThe 2048×1024 atlas contains eight 512×512 periodic cells in this fixed row-major order: oak planks, brushed steel plates, limestone blocks, marine painted metal, aged copper, ceramic roof tiles, woven fabric, and non-slip steel deck. `surface-atlas.json` is the machine-readable mapping and records hashes and sizes.\n\nRun `python scripts/generate-material-atlas.py` from any directory to regenerate the maps and the review contact sheet.\n"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")
    review_readme = """# Material atlas review artifact\n\n`contact-sheet.png` is a generated visual-QA sheet for the three runtime maps. The material source is wholly procedural NumPy/Pillow code in `scripts/generate-material-atlas.py`; no external or generated-image source was used. This asset task authored the atlases and review sheet only. Game shader projection, UV cell selection, vertex-color tinting, and runtime integration are owned by the main implementation.\n"""
    (ARTIFACTS / "README.md").write_text(review_readme, encoding="utf-8")
    total = sum(p.stat().st_size for p in files.values())
    print(f"Generated 8-cell atlas; compressed maps total {total / 1024:.1f} KiB")
    for role, path in files.items():
        print(f"{role:10s} {path.name:26s} {path.stat().st_size:8d} {sha256(path)[:16]}")


if __name__ == "__main__":
    main()
