"""Local MRI upload server. Run from repo root:  python -m uvicorn server.app:app --port 8000
Rough, research-only: compares one T1 scan with a control reference and reports pattern similarity."""
import base64, io, json, shutil, sys, tempfile
from pathlib import Path
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import scan_group_map as sgm  # noqa: E402
import covariates  # noqa: E402
import nibabel as nib  # noqa: E402

DATA = ROOT / 'web/public/data'
app = FastAPI(title='MRI pattern-match (rough)')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'], allow_methods=['*'], allow_headers=['*'])
_cache = {}

def read_json(name):
    p = DATA / name
    return json.loads(p.read_text()) if p.exists() else None

def load():
    if not _cache:
        ref = read_json('scan_reference.json')
        if ref is None:
            raise HTTPException(400, 'scan_reference.json is missing. Run scripts/scan_group_map.py then scripts/build_scan_reference.py first.')
        _cache['ref'] = ref
        _cache['pat'] = read_json('typical_patterns.json')['patterns']
        _cache['clf'] = read_json('scan_classifier.json')
        _cache['effects'] = read_json('scan_group_effects.json')
        _cache['template'] = sgm.template_image()
        _cache['atlas'] = sgm.sitk_from_nib(nib.load(sgm.ATLAS))
    return _cache

def corr(a, b):
    if a.std() < 1e-9 or b.std() < 1e-9: return 0.0
    return float(np.corrcoef(a, b)[0, 1])

def previews(path):
    """Three mid-slices (axial, coronal, sagittal) as base64 PNGs so the user can see what was uploaded."""
    from PIL import Image
    a = np.asarray(nib.as_closest_canonical(nib.load(path)).dataobj, dtype=np.float32)
    while a.ndim > 3: a = a[..., 0]
    lo, hi = np.percentile(a, [1, 99.5]); a = np.clip((a - lo) / max(hi - lo, 1e-6), 0, 1)
    out = []
    for sl in (a[:, :, a.shape[2] // 2], a[:, a.shape[1] // 2, :], a[a.shape[0] // 2, :, :]):
        im = Image.fromarray((np.rot90(sl) * 255).astype(np.uint8)).resize((200, 200)); buf = io.BytesIO(); im.save(buf, 'PNG')
        out.append('data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode())
    return out

def run(path, age=None, sex=None):
    c = load()
    try:
        frac, _, _ = sgm.process(path, c['template'], c['atlas'])
    except Exception as e:
        raise HTTPException(422, f'Could not process this scan: {e}')
    ref = c['ref']; ids = ref['region_ids']; cm = ref.get('cov_model')
    adjusted = []
    if cm:  # age/sex adjustment fitted on controls; unknown age/sex fall back to the control average
        a = age if age is not None else cm['age_mean']; s = (1.0 if sex == 'M' else 0.0) if sex in ('M', 'F') else cm['sex_mean']
        z = covariates.zscores(cm, frac, [a], [s])[0]
        adjusted = [n for n, v in (('age', age), ('sex', sex if sex in ('M', 'F') else None)) if v is not None]
    else:
        z = (frac - np.array(ref['mean'])) / np.array(ref['sd'])
    sims = {name: corr(-z, np.array([c['pat'][name].get(str(i), 0.0) for i in ids])) for name in ('parkinson', 'alzheimer')}
    if c['effects']:  # data-driven pattern learned from the user's own patient-vs-control scans
        eff = {r['region_id']: max(0.0, -r['effect_d']) for r in c['effects']['regions']}
        sims['data_driven'] = corr(-z, np.array([eff.get(i, 0.0) for i in ids]))
    abn = float((z < -2).mean())
    top = max(('parkinson', 'alzheimer'), key=lambda k: sims[k])
    guess = 'normal-like' if abn < 0.05 and sims[top] < 0.2 else top
    warnings = []
    if ref.get('n_control', 0) < 20: warnings.append(f"Reference uses only {ref.get('n_control')} control scans, so z-scores are noisy. Rerun the scan step without --max-per-group.")
    if 'total_mean' in ref:
        tz = (frac.sum() - ref['total_mean']) / ref['total_sd']
        if abs(tz) > 3: warnings.append(f'Total grey matter is {tz:+.1f} SD from controls; this may be a processing problem (bad brain mask or alignment), not biology.')
    if (np.abs(z) > 4).mean() > 0.3: warnings.append('Over 30% of regions are extreme (more than 4 SD). The scan probably did not align or segment well.')
    clf = None
    if c['clf']:
        m = c['clf']; x = (z - np.array(m['mean'])) / np.array(m['sd'])
        prob = 1 / (1 + np.exp(-(float(np.dot(x, m['coef'])) + m['intercept'])))
        clf = {'probability_patient_like': float(prob), 'cv_auc': m['cv_auc'], 'permutation_p': m['permutation_p'], 'n': m['n_control'] + m['n_patient'],
               'better_than_chance': bool(m['cv_auc'] >= 0.6 and m['permutation_p'] <= 0.05)}
    return {'guess': guess, 'confidence': 'low', 'similarity': sims, 'share_regions_below_2sd': abn, 'classifier': clf, 'adjusted_for': adjusted, 'warnings': warnings,
            'regions': [{'region_id': i, 'z': float(zz)} for i, zz in zip(ids, z)],
            'caveat': 'Rough pattern similarity from one scan, rough pipeline, tested only on synthetic data. Not a diagnosis.'}

@app.get('/health')
def health(): return {'ok': True}

@app.post('/analyze')
async def analyze(file: UploadFile = File(...), age: float | None = Form(None), sex: str | None = Form(None)):
    suffix = '.nii.gz' if (file.filename or '').endswith('.gz') else '.nii'
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / f'scan{suffix}'
        with open(p, 'wb') as f: shutil.copyfileobj(file.file, f)
        res = run(str(p), age, sex)
        try: res['previews'] = previews(str(p))
        except Exception: res['previews'] = []
    return res

@app.get('/analyze-sample')
def analyze_sample():
    from nilearn import datasets
    with tempfile.TemporaryDirectory() as td:
        p = str(Path(td) / 'sample.nii.gz'); nib.save(datasets.load_mni152_template(resolution=1), p)
        res = run(p); res['previews'] = previews(p); res['sample'] = True
    return res
