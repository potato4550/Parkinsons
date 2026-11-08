#!/usr/bin/env python3
"""Build web/public/data/scan_reference.json (per-region control mean/sd) from the *_matrix.npz that
scan_group_map.py writes. Usage: python scripts/build_scan_reference.py web/public/data/scan_group_effects_matrix.npz"""
import json, sys, numpy as np
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
import covariates
from pathlib import Path
src = Path(sys.argv[1]); d = np.load(src, allow_pickle=True)
Y, G = d['Y'], d['group']; C = Y[G == 0]
if len(C) < 5: sys.exit('Need at least 5 control scans.')
out = {'schema_version': '1', 'n_control': int(len(C)), 'region_ids': list(range(1, Y.shape[1] + 1)),
       'total_mean': float(C.sum(1).mean()), 'total_sd': float(max(C.sum(1).std(ddof=1), 1e-6)), 'mean': C.mean(0).tolist(), 'sd': np.maximum(C.std(0, ddof=1), 1e-6).tolist()}
out['cov_model'] = covariates.fit(Y, G, d['age'].astype(float), d['sex'].astype(float))
dst = Path(__file__).resolve().parents[1] / 'web/public/data/scan_reference.json'
dst.write_text(json.dumps(out)); print('wrote', dst, 'from', len(C), 'controls')
