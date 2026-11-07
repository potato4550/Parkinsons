#!/usr/bin/env python3
"""Rough regional grey-matter comparison of T1 MRI scans: controls vs patients -> web layer JSON.

Pipeline per scan: crude brain mask -> 3-class k-means tissue split -> affine registration to the MNI152
template -> AAL3 atlas moved into the scan -> grey-matter volume per AAL3 region, divided by total brain volume.
Across people: for every region, grey-matter fraction ~ group + age + sex (ordinary least squares), BH-FDR.

This is a RESEARCH-GRADE APPROXIMATION, not FreeSurfer or FastSurfer: affine-only registration, intensity-based
tissue split, crude skull stripping. Use it to look at group differences in YOUR scans, never to diagnose a person.

Usage:
  python scripts/scan_group_map.py --bids DATASET_DIR --out web/public/data/scan_group_effects.json \
      --control Control --patient PD-NC,PD-MCI [--workers 4]
Needs: pip install SimpleITK nibabel numpy scipy scikit-learn nilearn pandas
DATASET_DIR is a BIDS folder: participants.tsv (participant_id, group, age, sex) and sub-*/anat/*T1w.nii.gz.
"""
import argparse, datetime, glob, json, os, sys
import numpy as np, pandas as pd, nibabel as nib, SimpleITK as sitk
from scipy import stats
from sklearn.cluster import KMeans

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATLAS = os.path.join(ROOT, "data/atlases/aal_3v2/AAL3/AAL3v1.nii.gz")
REGIONS = os.path.join(ROOT, "data/processed/region_metadata.csv")

def template_image():
    from nilearn import datasets
    t = datasets.load_mni152_template(resolution=2)
    return sitk_from_nib(t)

def sitk_from_nib(img):
    import tempfile
    with tempfile.TemporaryDirectory() as td:  # works on Windows, macOS and Linux
        tmp = os.path.join(td, "img.nii.gz")
        nib.save(img, tmp); return sitk.ReadImage(tmp, sitk.sitkFloat32)

def crude_brain_mask(img):
    """Threshold + largest component + hole fill. Rough: images that are already skull-stripped work best."""
    sm = sitk.SmoothingRecursiveGaussian(img, 1.5)
    thr = sitk.OtsuThreshold(sm, 0, 1)
    thr = sitk.BinaryMorphologicalOpening(thr, [3, 3, 3])
    cc = sitk.RelabelComponent(sitk.ConnectedComponent(thr))
    m = cc == 1
    m = sitk.BinaryFillhole(m)
    return sitk.Cast(m, sitk.sitkUInt8)

def process(path, template, atlas_sitk):
    img = sitk.ReadImage(path, sitk.sitkFloat32)
    # work at 2 mm isotropic
    size = [int(round(sz * sp / 2.0)) for sz, sp in zip(img.GetSize(), img.GetSpacing())]
    rs = sitk.Resample(img, size, sitk.Transform(), sitk.sitkLinear, img.GetOrigin(), (2, 2, 2), img.GetDirection(), 0.0)
    mask = crude_brain_mask(rs)
    arr = sitk.GetArrayFromImage(rs); m = sitk.GetArrayFromImage(mask).astype(bool)
    vals = arr[m]
    if vals.size < 20000: raise RuntimeError("brain mask too small; scan may not be a T1 head image")
    # 3-class tissue split (CSF < GM < WM in T1)
    km = KMeans(3, n_init=3, random_state=0).fit(vals.reshape(-1, 1))
    order = np.argsort(km.cluster_centers_.ravel()); gm_label = order[1]
    lab = np.zeros(arr.shape, np.uint8); lab[m] = km.predict(vals.reshape(-1, 1)) == gm_label
    gm = sitk.GetImageFromArray(lab.astype(np.float32)); gm.CopyInformation(rs)
    brain = sitk.Mask(rs, mask)
    # affine registration brain -> template (mutual information)
    init = sitk.CenteredTransformInitializer(template, brain, sitk.AffineTransform(3), sitk.CenteredTransformInitializerFilter.MOMENTS)
    R = sitk.ImageRegistrationMethod(); R.SetMetricAsMattesMutualInformation(32); R.SetMetricSamplingStrategy(R.RANDOM); R.SetMetricSamplingPercentage(0.2, 1)
    R.SetInterpolator(sitk.sitkLinear); R.SetOptimizerAsGradientDescent(1.0, 150, convergenceMinimumValue=1e-6, convergenceWindowSize=10)
    R.SetOptimizerScalesFromPhysicalShift(); R.SetShrinkFactorsPerLevel([4, 2, 1]); R.SetSmoothingSigmasPerLevel([2, 1, 0]); R.SetInitialTransform(init, inPlace=False)
    tx = R.Execute(template, brain)
    # atlas -> scan space (inverse of template->scan mapping)
    inv = tx.GetInverse()
    atl = sitk.Resample(atlas_sitk, rs, inv, sitk.sitkNearestNeighbor, 0, sitk.sitkUInt16)
    a = sitk.GetArrayFromImage(atl)
    g = lab.astype(bool)
    ids = np.arange(1, 167)
    gm_vox = np.bincount(a[g & (a > 0)], minlength=167)[1:167].astype(float)
    reg_vox = np.bincount(a[a > 0], minlength=167)[1:167].astype(float)
    brain_vox = float(m.sum())
    return gm_vox / brain_vox, reg_vox / brain_vox, brain_vox * 8.0

def bh(p):
    p = np.asarray(p); n = len(p); o = np.argsort(p); r = p[o] * n / (np.arange(n) + 1)
    r = np.minimum.accumulate(r[::-1])[::-1]; out = np.empty(n); out[o] = np.minimum(r, 1); return out

def group_stats(Y, group, covars):
    """Y: subjects x regions grey-matter fraction. group: 0/1. covars: subjects x k."""
    X = np.column_stack([np.ones(len(group)), group, covars]); n, k = X.shape
    XtXi = np.linalg.pinv(X.T @ X); B = XtXi @ X.T @ Y; res = Y - X @ B
    s2 = (res ** 2).sum(0) / (n - k); se = np.sqrt(s2 * XtXi[1, 1])
    t = B[1] / np.where(se == 0, np.nan, se); p = 2 * stats.t.sf(np.abs(t), n - k)
    n1, n0 = int(group.sum()), int((1 - group).sum())
    d = t * np.sqrt(1 / n1 + 1 / n0)  # approximate adjusted Cohen's d
    return B[1], t, p, d

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bids", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--control", default="Control"); ap.add_argument("--patient", default="PD")
    ap.add_argument("--no-adjust-global", action="store_true", help="do not adjust for total grey-matter fraction"); ap.add_argument("--glob", default="sub-*/anat/*T1w.nii.gz"); ap.add_argument("--max-per-group", type=int, default=0)
    a = ap.parse_args()
    part = pd.read_csv(os.path.join(a.bids, "participants.tsv"), sep="\t")
    ctrl = set(a.control.split(",")); pat = set(a.patient.split(","))
    template = template_image(); atlas = sitk_from_nib(nib.load(ATLAS))
    rows = []
    for _, r in part.iterrows():
        g = 0 if r["group"] in ctrl else (1 if r["group"] in pat else None)
        if g is None: continue
        files = sorted(glob.glob(os.path.join(a.bids, r["participant_id"], a.glob.split("/", 1)[1])))
        if not files: print("no scan for", r["participant_id"], file=sys.stderr); continue
        rows.append((r, g, files[0]))
    if a.max_per_group:
        keep = []; cnt = {0: 0, 1: 0}
        for r, g, f in rows:
            if cnt[g] < a.max_per_group: keep.append((r, g, f)); cnt[g] += 1
        rows = keep
    Y, G, AGE, SEX, TIV, used = [], [], [], [], [], []
    for i, (r, g, f) in enumerate(rows):
        try:
            frac, regfrac, tiv = process(f, template, atlas)
        except Exception as e:
            print(f"skip {r['participant_id']}: {e}", file=sys.stderr); continue
        Y.append(frac); G.append(g); AGE.append(float(r.get("age", np.nan))); SEX.append(1.0 if str(r.get("sex", "")).upper().startswith("M") else 0.0)
        TIV.append(tiv); used.append(r["participant_id"]); print(f"[{i+1}/{len(rows)}] {r['participant_id']} ok", flush=True)
    Y = np.array(Y); G = np.array(G); AGE = np.array(AGE); SEX = np.array(SEX)
    if G.sum() < 5 or (1 - G).sum() < 5: sys.exit("Need at least 5 scans in each group.")
    cov = np.column_stack([(AGE - np.nanmean(AGE)) / (np.nanstd(AGE) or 1), SEX]) if not np.isnan(AGE).any() else SEX.reshape(-1, 1)
    np.savez(a.out.replace('.json', '_matrix.npz'), Y=Y, group=G, age=AGE, sex=SEX, ids=np.array(used))
    if not a.no_adjust_global: cov = np.column_stack([cov, Y.sum(1) - Y.sum(1).mean()])
    beta, t, p, d = group_stats(Y, G, cov)
    p = np.nan_to_num(p, nan=1.0); fdr = bh(p)
    meta = pd.read_csv(REGIONS).set_index("region_id")
    regs = []
    for j, rid in enumerate(range(1, 167)):
        c = Y[G == 0, j]; q = Y[G == 1, j]; mc = float(np.mean(c)) if len(c) else 0.0
        regs.append({"region_id": rid, "region_name": str(meta.loc[rid, "region_name"]) if rid in meta.index else str(rid),
                     "mean_control": mc, "mean_patient": float(np.mean(q)), "percent_difference": float(100 * (np.mean(q) - mc) / mc) if mc > 0 else 0.0,
                     "effect_d": float(d[j]) if np.isfinite(d[j]) else 0.0, "p": float(p[j]), "fdr_p": float(fdr[j])})
    out = {"schema_version": "1", "generated_on": datetime.date.today().isoformat(), "kind": "scan_group_effects",
           "n_control": int((1 - G).sum()), "n_patient": int(G.sum()), "covariates": ["age", "sex"] if not np.isnan(AGE).any() else ["sex"],
           "quality": "rough", "method": "affine-only registration, k-means tissue split, AAL3 grey-matter fraction; OLS group effect; BH-FDR",
           "caveat": "Group difference in these scans only. Not a diagnosis. Scanner, age and sex differences can look like disease effects.",
           "n_regions_fdr_below_0_05": int((fdr < 0.05).sum()), "regions": regs}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True); json.dump(out, open(a.out, "w"), indent=1)
    print(f"wrote {a.out}: {out['n_control']} controls, {out['n_patient']} patients, {out['n_regions_fdr_below_0_05']} regions with FDR<0.05")
if __name__ == "__main__": main()
