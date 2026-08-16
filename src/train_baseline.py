"""Task 3 - Splits + baseline classifiers.

    python src/train_baseline.py
"""

import os, sys, time
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report
import joblib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from features import batch_normalize, FEAT_DIM

NPZ = "data/processed/alphabet_landmarks.npz"
OUT = "models"


def random_split(n, seed=42):
    rng = np.random.default_rng(seed)
    idx = rng.permutation(n)
    a, b = int(0.70 * n), int(0.85 * n)
    return idx[:a], idx[a:b], idx[b:]


def block_split(y, frame_idx):
    """Contiguous chunks per class. Consecutive frames are near-duplicates,
    so a random split leaks the test set into training. This doesn't."""
    tr, va, te = [], [], []
    for cls in np.unique(y):
        w = np.where(y == cls)[0]
        w = w[np.argsort(frame_idx[w])]
        a, b = int(0.70 * len(w)), int(0.85 * len(w))
        tr += list(w[:a]); va += list(w[a:b]); te += list(w[b:])
    return np.array(tr), np.array(va), np.array(te)


def evaluate(name, model, Xtr, ytr, Xte, yte):
    t0 = time.time()
    model.fit(Xtr, ytr)
    acc = accuracy_score(yte, model.predict(Xte))
    print(f"  {name:<16} {acc:6.2%}   ({time.time()-t0:.0f}s)")
    return acc, model


def main():
    d = np.load(NPZ, allow_pickle=True)
    Xraw, y, frame_idx = d["X"], d["y"], d["frame_idx"]
    print(f"Loaded {Xraw.shape[0]} samples, {len(np.unique(y))} classes")

    print("Engineering features...")
    X = batch_normalize(Xraw)
    print(f"Feature matrix: {X.shape}  (expected N x {FEAT_DIM})\n")

    os.makedirs(OUT, exist_ok=True)
    results = {}

    for split_name, (tr, va, te) in [
        ("RANDOM", random_split(len(X))),
        ("BLOCK",  block_split(y, frame_idx)),
    ]:
        print(f"===== {split_name} SPLIT =====")
        print(f"  train={len(tr)}  val={len(va)}  test={len(te)}")
        models = {
            "RandomForest": RandomForestClassifier(
                n_estimators=300, n_jobs=-1, random_state=0),
            "MLP": make_pipeline(StandardScaler(), MLPClassifier(
                hidden_layer_sizes=(256, 128), max_iter=300,
                early_stopping=True, random_state=0)),
            "kNN(k=5)": make_pipeline(StandardScaler(),
                KNeighborsClassifier(n_neighbors=5, n_jobs=-1)),
        }
        best, best_acc, best_name = None, -1, ""
        for name, m in models.items():
            t0 = time.time()
            m.fit(X[tr], y[tr])
            val_acc = accuracy_score(y[va], m.predict(X[va]))
            test_acc = accuracy_score(y[te], m.predict(X[te]))
            print(f"  {name:<16} val {val_acc:6.2%}   test {test_acc:6.2%}   ({time.time()-t0:.0f}s)")
            results[(split_name, name)] = test_acc
            if val_acc > best_acc:            # select on val, report on test
                best, best_acc, best_name = m, val_acc, name

        if split_name == "BLOCK":
            joblib.dump(best, os.path.join(OUT, "alphabet_baseline.joblib"))
            print(f"\n  Saved best ({best_name}) -> models/alphabet_baseline.joblib")
            yp = best.predict(X[te])
            labels = sorted(np.unique(y))
            cm = confusion_matrix(y[te], yp, labels=labels)
            np.savetxt(os.path.join(OUT, "confusion_block.csv"), cm,
                       delimiter=",", fmt="%d")
            print("\n  Top confusions (true -> pred, count):")
            cmz = cm.copy(); np.fill_diagonal(cmz, 0)
            for i, j in zip(*np.unravel_index(
                    np.argsort(cmz, axis=None)[::-1][:12], cmz.shape)):
                if cmz[i, j]:
                    print(f"    {labels[i]} -> {labels[j]}: {cmz[i, j]}")
            print("\n" + classification_report(y[te], yp, zero_division=0))
        print()

    print("===== SUMMARY =====")
    for (s, m), a in results.items():
        print(f"  {s:<7} {m:<16} {a:6.2%}")
    print("\nThe RANDOM-vs-BLOCK gap is your leakage estimate.")


if __name__ == "__main__":
    main()