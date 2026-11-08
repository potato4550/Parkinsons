# MRI features: quick run guide
One-time: `pip install fastapi uvicorn python-multipart numpy pandas scipy scikit-learn SimpleITK nibabel nilearn statsmodels openneuro-py`, then `cd web && npm ci`.

Build the reference (one time; drop --max-per-group for the full, better run):
```
python -c "import openneuro; openneuro.download(dataset='ds005892', target_dir='../ds005892', include=['participants.tsv', 'sub-*/anat/*T1w*'])"
python scripts/scan_group_map.py --bids ../ds005892 --out web/public/data/scan_group_effects.json --control Control --patient PD-NC,PD-MCI
python scripts/build_scan_reference.py web/public/data/scan_group_effects_matrix.npz
python scripts/train_scan_classifier.py web/public/data/scan_group_effects_matrix.npz
```
Run: double-click `start.bat` (or run the two commands in `start.bat` yourself), then open http://localhost:5173.

The classifier prints its cross-validated AUC; if it is near 0.5 the app says to ignore it. Research demo only, not a diagnosis.

Credits and licences: built on GENE2BRAIN (check its licence), the Allen Human Brain Atlas data, AAL3, and OpenNeuro dataset ds005892 (check its licence before redistributing derived files).

## Newer additions
- Genes for every region: `python scripts/build_region_top_genes.py` (already run; output `web/public/data/region_top_genes.json` is committed). Score = L2G gene weight x (expression in region minus mean across regions). Candidates only, not causes.
- Age/sex adjustment: `build_scan_reference.py` and `train_scan_classifier.py` fit an age+sex model on controls only. Enter age and sex in the upload box if known; unknown values fall back to the control average. Rerun both scripts after pulling this change.
- Results: all-regions table and "Download results (CSV)" in the upload box.
