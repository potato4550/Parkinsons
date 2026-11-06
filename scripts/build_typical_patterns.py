#!/usr/bin/env python3
"""Write web/public/data/typical_patterns.json: ILLUSTRATIVE textbook patterns (0-1) per AAL3 region.
Alzheimer's: Braak & Braak 1991 (Acta Neuropathol 82:239) - medial temporal first, then temporal/parietal association cortex.
Parkinson's: Braak et al. 2003 (Neurobiol Aging 24:197) - brainstem/olfactory, then nigra/basal ganglia, later limbic/neocortex.
These are hand-assigned literature-based weights, NOT measured data and NOT derived from any patient scan."""
import json, re, pandas as pd
from pathlib import Path
root = Path(__file__).resolve().parents[1]
meta = pd.read_csv(root / 'data/processed/region_metadata.csv')

def score(name, rules, default=0.0):
    for pat, v in rules:
        if re.match(pat, name): return v
    return default

AD = [(r'ParaHippocampal',1.0),(r'Hippocampus',0.95),(r'Amygdala',0.7),(r'Temporal Pole',0.6),(r'Fusiform',0.6),
      (r'Temporal (Inf|Mid)',0.6),(r'Temporal Sup',0.4),(r'Precuneus',0.5),(r'Cingulate Post',0.5),(r'Angular',0.5),
      (r'Parietal Inf',0.45),(r'Frontal (Mid|Sup|Inf)',0.3),(r'Cingulate Mid|ACC|Insula|SupraMarginal|Frontal Med',0.25),
      (r'Parietal Sup|OFC|Rectus',0.2),(r'Occipital|Calcarine|Cuneus|Lingual|Precentral|Postcentral|Paracentral',0.1)]
PD = [(r'SN ',1.0),(r'LC ',0.85),(r'Raphe',0.75),(r'Olfactory',0.8),(r'Putamen',0.8),(r'VTA',0.6),(r'Caudate',0.5),
      (r'Pallidum',0.4),(r'N Acc',0.4),(r'Amygdala',0.4),(r'Red N',0.3),(r'Hippocampus|ParaHippocampal',0.3),
      (r'Insula|ACC|Cingulate|Temporal (Mid|Pole)',0.3),(r'Thal',0.2),(r'Frontal|Supp Motor|OFC|Parietal',0.2)]
out = {'schema_version':'1','kind':'illustrative_patterns','caveat':'Illustrative literature-based weights, not measured data.',
       'references':['Braak H, Braak E. Acta Neuropathol 1991;82:239-259','Braak H et al. Neurobiol Aging 2003;24:197-211'],
       'patterns':{'alzheimer':{}, 'parkinson':{}}}
for r in meta.itertuples():
    out['patterns']['alzheimer'][str(r.region_id)] = score(r.region_name, AD)
    out['patterns']['parkinson'][str(r.region_id)] = score(r.region_name, PD)
(root/'web/public/data/typical_patterns.json').write_text(json.dumps(out, indent=1))
print('ok', len(meta))
