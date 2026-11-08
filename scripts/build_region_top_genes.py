#!/usr/bin/env python3
"""Write web/public/data/region_top_genes.json: for EVERY region and disease, the disease genes that are most
elevated in that region relative to the other regions, weighted by the gene's Open Targets L2G weight.
score = gene_weight * (expression_in_region - mean_expression_across_regions).
These are candidate genes expressed there in healthy brains, not proven causes of anything."""
import json, numpy as np, pandas as pd
from pathlib import Path
root = Path(__file__).resolve().parents[1]
expr = pd.read_csv(root / 'data/processed/brain_region_gene_expression.csv').set_index('region_id')
atlas = json.loads((root / 'web/public/data/multidisease_atlas.json').read_text())
out = {'schema_version': '1', 'method': 'gene_weight x (expression in region - mean across regions); top 5 per region',
       'caveat': 'Candidate genes most expressed in healthy brain regions; not proof of causality.', 'diseases': {}}
for d in atlas['diseases']:
    p = root / f"data/genes/multidisease/{d['disease_id']}_weighted.csv"
    if not p.exists(): continue
    w = pd.read_csv(p).drop_duplicates('gene').set_index('gene')['gene_weight']
    genes = [g for g in w.index if g in expr.columns]
    E = expr[genes]; spec = E - E.mean(0); score = spec * w[genes].values
    res = {}
    for rid in E.index:
        top = score.loc[rid].nlargest(5)
        res[str(int(rid))] = [{'gene': g, 'weight': round(float(w[g]), 3), 'expression': round(float(E.loc[rid, g]), 3), 'score': round(float(s), 4)} for g, s in top.items()]
    out['diseases'][d['disease_id']] = res
    print(d['disease_id'], len(genes), 'genes')
(root / 'web/public/data/region_top_genes.json').write_text(json.dumps(out, separators=(',', ':')))
