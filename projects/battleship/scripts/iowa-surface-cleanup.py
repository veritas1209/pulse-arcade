"""Remove coincident source faces, preserving authored exterior UV corners.

SketchUp-style exports store front/back materials as reversed coplanar triangles.
The game renders a single DoubleSide material, so those source pairs depth-fight.
Do not offset surfaces or change their source positions, normals or UVs.
"""
import numpy as np

PACKED = np.dtype([('p', '<i2', (3,)), ('n', 'i1', (3,)),
                   ('c', 'u1', (3,)), ('part', '<u2'),
                   ('uv', '<f4', (2,)), ('tile', '<u2')])


def clean_iowa_surfaces(raw, parts):
    faces = np.frombuffer(raw, dtype=PACKED).reshape(-1, 3)
    keep = np.ones(len(faces), dtype=bool)
    grouped, position_groups = {}, {}
    for i, face in enumerate(faces):
        position = tuple(sorted(tuple(int(v) for v in p) for p in face['p']))
        grouped.setdefault((int(face['part'][0]), position), []).append(i)
        position_groups.setdefault(position, []).append(i)

    def priority(i):
        face = faces[i]
        tile = int(face['tile'][0])
        return (tile == 8, tile != 65535, int(face['n'][:, 1].sum()), -i)

    paired = 0
    for indices in grouped.values():
        if len(indices) < 2:
            continue
        chosen = max(indices, key=priority)
        for i in indices:
            if i != chosen:
                keep[i] = False
                paired += 1

    structural_overlap = 0
    for indices in position_groups.values():
        remaining = [i for i in indices if keep[i]]
        wood = [i for i in remaining if int(faces[i]['tile'][0]) == 8]
        if not wood:
            continue
        # Some main-deck back faces belong to a separate structural source node.
        # Only discard exact untextured structural copies of the wood surface;
        # weapon/sensor membership and distinct source surfaces stay intact.
        for i in remaining:
            part = parts[int(faces[i]['part'][0])]
            structural = any(f'-{role}-' in part['id']
                             for role in ('hull', 'structure', 'superstructure'))
            if int(faces[i]['tile'][0]) == 65535 and structural:
                keep[i] = False
                structural_overlap += 1

    clean = faces[keep]
    before_parts, after_parts = set(faces['part'].ravel()), set(clean['part'].ravel())
    assert before_parts == after_parts, 'Cleanup must not remove a whole attachment'
    assert np.array_equal(faces['p'].reshape(-1, 3).min(0), clean['p'].reshape(-1, 3).min(0))
    assert np.array_equal(faces['p'].reshape(-1, 3).max(0), clean['p'].reshape(-1, 3).max(0))
    # Every surviving triangle is an unmodified, byte-identical source triangle.
    return clean.tobytes(), dict(beforeTriangles=len(faces), afterTriangles=len(clean),
        removedPairedFaces=paired, removedStructuralDeckBackFaces=structural_overlap,
        sourceCornersUnchanged=True, boundsUnchanged=True, partsUnchanged=True)
