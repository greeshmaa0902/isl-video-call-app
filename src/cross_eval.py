"""Task 7 - Cross-dataset evaluation of the Mendeley-trained model."""

import os, sys
import joblib, numpy as np
from sklearn.metrics import accuracy_score, classification_report

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from features import batch_normalize

MODEL = "models/mendeley_mirror.joblib"
SETS = [
    ("Original dataset (31k)", "data/processed/alphabet_landmarks.npz"),
    ("Your webcam (480)",      "data/processed/webcam_ood.npz"),
]

model = joblib.load(MODEL)
known = set(model.classes_.tolist())

for name, path in SETS:
    if not os.path.exists(path):
        print(f"{name}: not found\n"); continue
    d = np.load(path, allow_pickle=True)
    Xraw, y = d["X"], d["y"]
    keep = np.array([lab in known for lab in y])
    Xraw, y = Xraw[keep], y[keep]

    pred = model.predict(batch_normalize(Xraw))
    print(f"===== {name} =====")
    print(f"Samples : {len(y)}")
    print(f"Accuracy: {accuracy_score(y, pred):.2%}\n")
    print(classification_report(y, pred, zero_division=0))
    print()