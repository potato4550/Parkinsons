#!/usr/bin/env python3
"""Train a small control-vs-patient classifier on per-region grey-matter values and report HONEST cross-validated accuracy.
Usage: python scripts/train_scan_classifier.py web/public/data/scan_group_effects_matrix.npz
Writes web/public/data/scan_classifier.json. Each person has one scan, so stratified CV is person-safe.
Age/sex are adjusted with a model fitted on the training controls inside each CV fold. Results are still exploratory."""
import json, sys, numpy as np
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
import covariates
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import RepeatedStratifiedKFold, cross_val_predict, StratifiedKFold
from sklearn.metrics import roc_auc_score, balanced_accuracy_score
d = np.load(sys.argv[1], allow_pickle=True); Y, G = d['Y'], d['group'].astype(int)
if min((G == 0).sum(), (G == 1).sum()) < 8: sys.exit('Need at least 8 scans per group for a meaningful classifier.')
AGE, SEX = d['age'].astype(float), d['sex'].astype(float)
clf = lambda: LogisticRegression(C=0.01, max_iter=2000, class_weight='balanced')

def features(tr, te, g):
    """Age/sex model and standardisation are fitted on the TRAINING fold only (no leakage from test labels)."""
    cm = covariates.fit(Y[tr], g[tr], AGE[tr], SEX[tr])
    Ztr = covariates.zscores(cm, Y[tr], AGE[tr], SEX[tr]); Zte = covariates.zscores(cm, Y[te], AGE[te], SEX[te])
    mu_, sd_ = Ztr.mean(0), np.maximum(Ztr.std(0), 1e-6)
    return (Ztr - mu_) / sd_, (Zte - mu_) / sd_

def cv_scores(g, seed):
    p = np.zeros(len(g))
    for tr, te in StratifiedKFold(5, shuffle=True, random_state=seed).split(Y, g):
        Xtr, Xte = features(tr, te, g); p[te] = clf().fit(Xtr, g[tr]).predict_proba(Xte)[:, 1]
    return p

aucs, bals = [], []
for rep in range(10):
    p = cv_scores(G, rep); aucs.append(roc_auc_score(G, p)); bals.append(balanced_accuracy_score(G, p > 0.5))
rng = np.random.default_rng(0); null = []
for _ in range(100):
    g = rng.permutation(G); null.append(roc_auc_score(g, cv_scores(g, 0)))
auc = float(np.mean(aucs)); perm_p = float((np.sum(np.array(null) >= auc) + 1) / (len(null) + 1))
# final model on all data (what the app uses)
cm = covariates.fit(Y, G, AGE, SEX); Z = covariates.zscores(cm, Y, AGE, SEX)
mu, sd = Z.mean(0), np.maximum(Z.std(0), 1e-6); X = (Z - mu) / sd
m = clf().fit(X, G)
out = {'schema_version': '1', 'n_control': int((G == 0).sum()), 'n_patient': int((G == 1).sum()),
       'adjusted_for': 'age and sex (fitted on training controls inside each CV fold)', 'cv_auc': auc, 'cv_balanced_accuracy': float(np.mean(bals)), 'permutation_p': perm_p,
       'mean': mu.tolist(), 'sd': sd.tolist(), 'coef': m.coef_[0].tolist(), 'intercept': float(m.intercept_[0])}
dst = Path(__file__).resolve().parents[1] / 'web/public/data/scan_classifier.json'; dst.write_text(json.dumps(out))
print(f"CV AUC {auc:.2f} (permutation p={perm_p:.2f}), balanced accuracy {np.mean(bals):.2f}, n={len(G)}. Wrote {dst}")
if auc < 0.6 or perm_p > 0.05: print('NOTE: not clearly better than chance; the app will say so.')
