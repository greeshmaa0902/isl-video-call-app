"""Task 6 - Signer-independent training on the Mendeley ISL alphabet data.

Split by AGE GROUP, not randomly: train on adults + teenagers, test on kids.
Test signers never appear in training, so the number means something.

    python src/train_mendeley.py
    python src/train_mendeley.py --no-mirror     # ablation
"""

import argparse, os, sys, time
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmarks import mirror_vector
from features import batch_normalize

NPZ = os.path.join("data", "processed", "mendeley_landmarks.npz")
OUT = "models"
TEST_AGE = "kid"


def augment(Xraw, y):
    """Mirror on RAW landmarks -- features.py normalisation is not linear,
    so mirroring afterwards would not be equivalent."""
    Xm = np.stack([mirror_vector(v) for v in Xraw])
    return np.concatenate([Xraw, Xm]), np.concatenate([y, y])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-mirror", action="store_true")
    args = ap.parse_args()

    d = np.load(NPZ, allow_pickle=True)
    Xraw, y, age = d["X"], d["y"], d["age"]
    print(f"Loaded {len(Xraw)} samples, {len(set(y.tolist()))} classes")

    te_mask = age == TEST_AGE
    Xtr_raw, ytr = Xraw[~te_mask], y[~te_mask]
    Xte_raw, yte = Xraw[te_mask], y[te_mask]
    print(f"Train (adult+teen): {len(Xtr_raw)}")
    print(f"Test  ({TEST_AGE}): {len(Xte_raw)}\n")

    if not args.no_mirror:
        before = len(Xtr_raw)
        Xtr_raw, ytr = augment(Xtr_raw, ytr)
        print(f"Mirror augmentation: {before} -> {len(Xtr_raw)}")

    print("Engineering features...")
    Xtr = batch_normalize(Xtr_raw)
    Xte = batch_normalize(Xte_raw)
    print(f"  train {Xtr.shape}   test {Xte.shape}\n")

    os.makedirs(OUT, exist_ok=True)
    models = {
        "RandomForest": RandomForestClassifier(
            n_estimators=300, n_jobs=-1, random_state=0),
        "MLP": make_pipeline(StandardScaler(), MLPClassifier(
            hidden_layer_sizes=(512, 256), max_iter=400,
            early_stopping=True, random_state=0)),
    }

    best, best_acc, best_name = None, -1.0, ""
    print("===== SIGNER-INDEPENDENT RESULTS (test = kids) =====")
    for name, m in models.items():
        t0 = time.time()
        m.fit(Xtr, ytr)
        acc = accuracy_score(yte, m.predict(Xte))
        print(f"  {name:<14} {acc:6.2%}   ({time.time()-t0:.0f}s)")
        if acc > best_acc:
            best, best_acc, best_name = m, acc, name

    tag = "nomirror" if args.no_mirror else "mirror"
    path = os.path.join(OUT, f"mendeley_{tag}.joblib")
    joblib.dump(best, path)
    print(f"\nSaved best ({best_name}) -> {path}")

    yp = best.predict(Xte)
    labels = sorted(set(y.tolist()))
    cm = confusion_matrix(yte, yp, labels=labels)
    np.savetxt(os.path.join(OUT, f"confusion_{tag}.csv"), cm, delimiter=",", fmt="%d")

    print("\nTop confusions (true -> pred, count):")
    cmz = cm.copy()
    np.fill_diagonal(cmz, 0)
    order = np.argsort(cmz, axis=None)[::-1][:12]
    for i, j in zip(*np.unravel_index(order, cmz.shape)):
        if cmz[i, j]:
            print(f"  {labels[i]} -> {labels[j]}: {cmz[i, j]}")

    print("\n" + classification_report(yte, yp, zero_division=0))


if __name__ == "__main__":
    main()