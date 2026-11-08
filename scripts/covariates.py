"""Age/sex adjustment shared by build_scan_reference.py, train_scan_classifier.py and server/app.py.
The model is fitted on CONTROLS only, so disease effects are not removed."""
import numpy as np

def design(age, sex, m):
    a = (np.asarray(age, float) - m['age_mean']) / m['age_sd']
    return np.column_stack([np.ones(len(a)), np.nan_to_num(a), np.asarray(sex, float)])

def fit(Y, G, age, sex):
    C = G == 0
    ok = ~np.isnan(age).any() and len(set(sex[C])) > 0
    m = {'age_mean': float(np.nanmean(age[C])) if ok else 0.0, 'age_sd': float(np.nanstd(age[C]) or 1.0) if ok else 1.0,
         'sex_mean': float(np.mean(sex[C]))}
    X = design(age if ok else np.zeros(len(age)), sex, m)
    beta, *_ = np.linalg.lstsq(X[C], Y[C], rcond=None)
    if not ok: beta[1] = 0.0
    res = Y[C] - X[C] @ beta; dof = max(1, C.sum() - X.shape[1])
    m['beta'] = beta.tolist(); m['resid_sd'] = np.maximum(np.sqrt((res ** 2).sum(0) / dof), 1e-6).tolist()
    return m

def zscores(m, Y, age, sex):
    Y = np.atleast_2d(Y); X = design(age, sex, m)
    return (Y - X @ np.array(m['beta'])) / np.array(m['resid_sd'])
