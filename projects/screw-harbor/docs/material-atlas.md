# Procedural surface atlas

Authored for Screw Harbor as deterministic, offline procedural art. No external images, logos, text, baked lighting, perspective, or screw imagery are present. The color atlas is deliberately neutral for runtime tinting; roughness and normals carry the close-range material response.

The 2048×1024 atlas contains eight 512×512 periodic cells in this fixed row-major order: oak planks, brushed steel plates, limestone blocks, marine painted metal, aged copper, ceramic roof tiles, woven fabric, and non-slip steel deck. `surface-atlas.json` is the machine-readable mapping and records hashes and sizes.

Run `python scripts/generate-material-atlas.py` from any directory to regenerate the maps and the review contact sheet.
