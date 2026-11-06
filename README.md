# From Genetic Risk to Spatial Brain Vulnerability

This repository supports a research pipeline testing whether disease-associated
genes are expressed unusually strongly in specific regions of the healthy human
brain. Stages 1–2 acquire the Allen Human Brain Atlas (AHBA) adult human
microarray data and build a documented healthy-brain region × gene reference.

## Current contents

- `notebooks/01_download_ahba.ipynb`: documented, executable AHBA download and QC
- `data/ahba/`: raw AHBA files downloaded by `abagen` (not tracked by Git)
- `data/processed/ahba_metadata_summary.csv`: concise donor/file inventory
- `data/processed/ahba_provenance.md`: source, assumptions, and package versions
- `results/figures/`: sampling coverage and donor sample-count plots
- `src/stage_02_preprocess.py`: reproducible AAL3 regional-expression workflow
- `data/processed/brain_region_gene_expression.csv`: final region × gene matrix
- `data/processed/region_metadata.csv`: all atlas parcels and coverage status
- `data/processed/gene_metadata.csv`: output-gene/probe mapping information
- `data/intermediate/donor_*_expression.csv`: generated donor-level regional
  matrices (kept local because they total about 151 MB)
- `reports/stage_02_methods.md` and `stage_02_qc.md`: exact methods and QC
- `.github/workflows/ci.yml`: reproducibility and artifact-integrity checks
- `src/stage_03_parkinson_gwas.py`: ontology-backed Parkinson GWAS Catalog
  retrieval, study ranking, association QC, and provisional locus grouping
- `data/gwas/parkinson_*.csv`: Stage 3 candidate studies, selected-study
  associations, provisional loci, mapped candidate genes, and summary-statistics
  metadata
- `reports/stage_03_*.md`: exact API audit, methods, and GWAS QC findings
- `src/stage_04_parkinson_l2g.py`: current Open Targets Platform credible-set
  and Locus-to-Gene retrieval, thresholding, comparison, and AHBA symbol coverage
- `data/genes/parkinson_*.csv`: full L2G evidence plus broad, stringent, and
  continuous-weight gene sets
- `reports/stage_04_*.md`: Open Targets release/query details, methods, caveats,
  and Stage 4 quality control
- `src/stage_05_parkinson_spatial_signal.py`: broad, stringent, and L2G-weighted
  Parkinson-associated regional expression profiles with donor robustness and a
  separately labelled gene-standardized sensitivity analysis
- `data/results/parkinson_regional_raw_scores.csv`: observed regional scores on
  the preserved Stage 2 normalization scale
- `results/brain_maps/stage_05_parkinson_*.png`: anatomically aligned AAL3 maps
  using one shared display scale
- `reports/stage_05_methods.md`: exact score definitions, matching audit,
  donor analysis, interpretation boundaries, and limitations
- `src/stage_06_parkinson_enrichment.py`: 10,000-set matched permutation tests
  for broad, stringent, and L2G-weighted regional profiles
- `data/results/parkinson_regional_enrichment.csv`: primary weighted gene-set
  null statistics, empirical p-values, BH-FDR values, and effect sizes
- `data/results/stage_06_permutation_parameters.json`: exact matching,
  sampling, weighting, batching, seed, and multiplicity parameters
- `reports/stage_06_gene_set_bias_assessment.md`, `stage_06_interpretation.md`,
  and `stage_06_performance.md`: matching QC, interpretation boundaries, and
  runtime/memory details
- `src/stage_07_spatial_robustness.py`: AAL3 volumetric adjacency, Moran's I,
  spatially constrained surrogate maps, regional robustness, and sensitivity plots
- `data/results/parkinson_spatial_*.csv`: Stage 7 autocorrelation, global spatial,
  regional robustness, and gene-set sensitivity results
- `reports/stage_07_*.md`: spatial representation, pre-specified robustness rule,
  results, limitations, and interpretation boundaries
- `src/stage_08_independent_validation.py`: pinned ENIGMA-PD download,
  explicit Desikan-Killiany/FreeSurfer-to-AAL3 crosswalk, correlations, controls,
  leave-one-region-out analysis, and anatomical comparison maps
- `data/validation/`: candidate audit, frozen selection record, raw ENIGMA-PD
  summary statistics, anatomical mapping, processed validation vectors, and provenance
- `data/results/parkinson_independent_validation.csv`: primary, sensitivity,
  confound-control, and spatial-null validation statistics
- `reports/stage_08_*.md`: frozen discovery definition, cited source review,
  independence qualification, null result, and interpretation boundaries
- `src/stage_09_biological_interpretation.py`: frozen-gene-set GO, Reactome,
  WikiPathways, ranked L2G, human-brain cell-type, and regional-driver analyses
- `data/results/stage_09_*.csv`: identifier audit, enrichment statistics,
  regional contributors, sensitivity analyses, and supported evidence table
- `reports/stage_09_*.md`: pre-specified region rule, complete methods,
  negative-result handling, and careful biological interpretation
- `results/figures/stage_09_*.png`: pathway, cell-type, regional-driver,
  evidence-network, sensitivity, and integrated summary figures
- `config/disease_panel.yaml`: frozen 15-disease screen and inclusion decisions
- `src/stage_10_sources.py`: GWAS Catalog/Open Targets source audit and gene sets
- `src/stage_10_multidisease.py`: frozen Stage 5–7 methods applied to eligible diseases
- `src/stage_10_biology.py`: common-background pathway and HPA cell-marker analyses
- `src/stage_10_finalize.py`: cross-disease summaries, manifest, and final report
- `data/results/disease_region_*_matrix.csv`: comparable 10 disease × 138 AAL3 matrices
- `results/tables/gene2brain_master_disease_results.csv`: complete disease-level audit
- `reports/stage_10_final_summary.md`: findings, negative results, and limitations
- `results/figures/stage_10_*.png`: atlas, similarity, PCA, biology, and QC figures

Stage 10 screens 15 diseases and analyzes the 10 that pass the frozen genetic and
AHBA coverage gates. It reuses the Parkinson Stage 5–7 definitions, including
10,000 matched gene-set permutations and 10,000 spatial permutations, without
disease-specific tuning. Five diseases remain explicitly excluded or under review;
no substitute data or fabricated validation values are used. These are descriptive
research results, not clinical predictions or causal maps.

## Reproduce from a clean environment

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\\Scripts\\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
jupyter nbconvert --to notebook --execute --inplace \
  --ExecutePreprocessor.timeout=-1 notebooks/01_download_ahba.ipynb
python src/stage_02_preprocess.py
python src/stage_03_parkinson_gwas.py
python src/stage_04_parkinson_l2g.py
python src/stage_05_parkinson_spatial_signal.py
python src/stage_06_parkinson_enrichment.py
python src/stage_07_spatial_robustness.py
python src/stage_08_independent_validation.py
python src/stage_09_biological_interpretation.py
python scripts/prepare_web_data.py
python src/stage_10_sources.py
python src/stage_10_multidisease.py
python src/stage_10_biology.py
python scripts/build_multidisease_web_data.py
python scripts/build_anatomical_brain.py
python src/stage_10_finalize.py
python scripts/validate_web_data.py
python scripts/validate_brain_region_mapping.py
python -m unittest discover -s tests -v
```

The notebook resolves all paths relative to the repository and calls the
currently documented API:

```python
abagen.fetch_microarray(
    donors="all",
    data_dir=PROJECT_ROOT / "data" / "ahba",
    resume=True,
    convert=False,
)
```

The complete six-donor archive requires roughly 4 GB plus temporary download
space. Downloads can be resumed.

The CI suite intentionally does not redownload the approximately 4 GB AHBA
archive. It validates the notebook, source code, atlas definition, committed
regional matrix, metadata, and Stage 2–9 scientific artifacts. Stage 4 makes
targeted calls to the current Open Targets GraphQL API when explicitly rebuilt.
Stage 5 also uses the donor matrices generated by Stage 2 (kept local because they
total about 151 MB). CI validates the release-stamped committed results without
network access or large raw/intermediate downloads. It also validates the web data,
builds the production application, and runs desktop/mobile browser interactions. A
clean end-to-end data rebuild is performed with the commands above before scientific
releases.

## Interactive web visualization

The public React + TypeScript/WebGL application is in [`web/`](web/). It displays
validated Stage 6–10 values for 10 eligible diseases, shared-scale side-by-side
comparison, a region-first atlas, spatial sensitivity, available independent
validation, and biological explanations on parcel surfaces extracted directly from
the folded fsaverage6 pial cortex with AAL3v1 labels projected through official
registration-fusion coordinates; noncortical parcels remain separate AAL3-derived
surfaces. The same integer AAL3 IDs join the Stage 2 matrix and web records. The
frontend does not recompute scientific statistics. See [`web/README.md`](web/README.md)
and [`reports/web_brain_geometry_method.md`](reports/web_brain_geometry_method.md) for setup, provenance, region-ID
mapping, validation mode, and extension guidance.

```bash
cd web
npm install
npm run dev  # http://localhost:8000
npm test
npm run build
```

## Data source

The AHBA was created by the Allen Institute for Brain Science. Raw data are
retrieved from the Allen Brain Map well-known-file API by `abagen`; see the
generated provenance record for URLs, versions, and the access date.

## MRI upload (rough pattern match)
1. `pip install fastapi uvicorn python-multipart numpy pandas scipy scikit-learn SimpleITK nibabel nilearn statsmodels`
2. Run `scripts/scan_group_map.py` on controls + patients, then `python scripts/build_scan_reference.py web/public/data/scan_group_effects_matrix.npz`
3. `python -m uvicorn server.app:app --port 8000` (repo root) and `cd web && npm run dev`
4. Use "Upload an MRI" in the Explore section. Research demo only, not a diagnosis.
