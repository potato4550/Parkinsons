#!/usr/bin/env python3
"""Train a small control-vs-patient classifier on per-region grey-matter values and report HONEST cross-validated accuracy.
Usage: python scripts/train_scan_classifier.py web/public/data/scan_group_effects_matrix.npz
Writes web/public/data/scan_classifier.json. Each person has one scan, so stratified CV is person-safe.
Caveat: groups may differ in age/sex; this model does not remove that, so treat results as exploratory."""
import json, sys, numpy as np
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
import covariates
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import RepeatedStratifiedKFold, cross_val_predict, StratifiedKFold
from sklearn.metrics import roc_auc_score, balanced_accuracy_score
d = np.load(sys.argv[1], allow_pickle=True); Y, G = d['Y'], d['group'].astype(int)
if min((G == 0).sum(), (G == 1).sum()) < 8: sys.exit('Need at least 8 scans per group for a meaningful classifier.')
cm = covariates.fit(Y, G, d['age'].astype(float), d['sex'].astype(float))  # age/sex model fitted on controls only
Z = covariates.zscores(cm, Y, d['age'].astype(float), d['sex'].astype(float))
mu, sd = Z.mean(0), np.maximum(Z.std(0), 1e-6); X = (Z - mu) / sd
clf = lambda: LogisticRegression(C=0.01, max_iter=2000, class_weight='balanced')
aucs, bals = [], []
for rep in range(10):
    p = cross_val_predict(clf(), X, G, cv=StratifiedKFold(5, shuffle=True, random_state=rep), method='predict_proba')[:, 1]
    aucs.append(roc_auc_score(G, p)); bals.append(balanced_accuracy_score(G, p > 0.5))
rng = np.random.default_rng(0); null = []
for _ in range(100):
    g = rng.permutation(G)
    p = cross_val_predict(clf(), X, g, cv=StratifiedKFold(5, shuffle=True, random_state=0), method='predict_proba')[:, 1]
    null.append(roc_auc_score(g, p))
auc = float(np.mean(aucs)); perm_p = float((np.sum(np.array(null) >= auc) + 1) / (len(null) + 1))
m = clf().fit(X, G)
out = {'schema_version': '1', 'n_control': int((G == 0).sum()), 'n_patient': int((G == 1).sum()),
       'adjusted_for': 'age and sex (fitted on controls)', 'cv_auc': auc, 'cv_balanced_accuracy': float(np.mean(bals)), 'permutation_p': perm_p,
       'mean': mu.tolist(), 'sd': sd.tolist(), 'coef': m.coef_[0].tolist(), 'intercept': float(m.intercept_[0])}
dst = Path(__file__).resolve().parents[1] / 'web/public/data/scan_classifier.json'; dst.write_text(json.dumps(out))
print(f"CV AUC {auc:.2f} (permutation p={perm_p:.2f}), balanced accuracy {np.mean(bals):.2f}, n={len(G)}. Wrote {dst}")
if auc < 0.6 or perm_p > 0.05: print('NOTE: not clearly better than chance; the app will say so.')
