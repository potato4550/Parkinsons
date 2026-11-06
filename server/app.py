"""Local MRI upload server. Run from repo root:  uvicorn server.app:app --port 8000
Rough, research-only: compares one T1 scan with a control reference and reports pattern similarity."""
import json, shutil, sys, tempfile
from pathlib import Path
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import scan_group_map as sgm  # noqa: E402
import nibabel as nib  # noqa: E402

DATA = ROOT / 'web/public/data'
app = FastAPI(title='MRI pattern-match (rough)')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'], allow_methods=['*'], allow_headers=['*'])
_cache = {}

def load():
    if not _cache:
        ref = DATA / 'scan_reference.json'
        if not ref.exists():
            raise HTTPException(400, 'scan_reference.json is missing. Run scripts/scan_group_map.py then scripts/build_scan_reference.py first.')
        _cache['ref'] = json.loads(ref.read_text())
        _cache['pat'] = json.loads((DATA / 'typical_patterns.json').read_text())['patterns']
        _cache['template'] = sgm.template_image()
        _cache['atlas'] = sgm.sitk_from_nib(nib.load(sgm.ATLAS))
    return _cache

def corr(a, b):
    if a.std() < 1e-9 or b.std() < 1e-9: return 0.0
    return float(np.corrcoef(a, b)[0, 1])

@app.get('/health')
def health(): return {'ok': True}

@app.post('/analyze')
async def analyze(file: UploadFile = File(...)):
    c = load()
    suffix = '.nii.gz' if (file.filename or '').endswith('.gz') else '.nii'
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / f'scan{suffix}'
        with open(p, 'wb') as f: shutil.copyfileobj(file.file, f)
        try:
            frac, _, _ = sgm.process(str(p), c['template'], c['atlas'])
        except Exception as e:
            raise HTTPException(422, f'Could not process this scan: {e}')
    ref = c['ref']; mean = np.array(ref['mean']); sd = np.array(ref['sd']); ids = ref['region_ids']
    z = (frac - mean) / sd
    loss = np.clip(-z, 0, None)
    sims = {}
    for name in ('parkinson', 'alzheimer'):
        pv = np.array([c['pat'][name].get(str(i), 0.0) for i in ids])
        sims[name] = corr(-z, pv)
    abn = float((z < -2).mean())  # share of regions >2 SD below controls
    if abn < 0.05 and max(sims.values()) < 0.2:
        guess, conf = 'normal-like', 'low'
    else:
        guess = max(sims, key=sims.get); conf = 'low'
    return {'guess': guess, 'confidence': conf, 'similarity': sims, 'share_regions_below_2sd': abn,
            'regions': [{'region_id': i, 'z': float(zz)} for i, zz in zip(ids, z)],
            'caveat': 'Rough pattern similarity from one scan, rough pipeline, tested only on synthetic data. Not a diagnosis.'}
