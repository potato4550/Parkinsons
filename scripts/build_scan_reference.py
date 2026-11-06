#!/usr/bin/env python3
"""Build web/public/data/scan_reference.json (per-region control mean/sd) from the *_matrix.npz that
scan_group_map.py writes. Usage: python scripts/build_scan_reference.py web/public/data/scan_group_effects_matrix.npz"""
import json, sys, numpy as np
from pathlib import Path
src = Path(sys.argv[1]); d = np.load(src, allow_pickle=True)
Y, G = d['Y'], d['group']; C = Y[G == 0]
if len(C) < 5: sys.exit('Need at least 5 control scans.')
out = {'schema_version': '1', 'n_control': int(len(C)), 'region_ids': list(range(1, Y.shape[1] + 1)),
       'mean': C.mean(0).tolist(), 'sd': np.maximum(C.std(0, ddof=1), 1e-6).tolist()}
dst = Path(__file__).resolve().parents[1] / 'web/public/data/scan_reference.json'
dst.write_text(json.dumps(out)); print('wrote', dst, 'from', len(C), 'controls')
