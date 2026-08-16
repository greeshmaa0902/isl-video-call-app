"""Task 9 - Fine-tune the Mendeley model on your own signing.

Mendeley supplies signer diversity; your webcam samples supply the sign
variants you actually use. Your samples are weighted heavily so the model
adopts your variant where the two disagree (M, C), while retaining
Mendeley's robustness everywhere else.

    python src/finetune.py
"""

import os, sys
import joblib, numpy as np
from sklearn.metrics import accuracy_score, classification_report
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmarks import mirror_vector
from features import batch_normalize

MEND = "data/processed/mendeley_landmarks.npz"
CALIB = "data/processed/webcam_calib.npz"
OUT = "models/finetuned.joblib"
REPLICAS = 8      # how many times to repeat your samples in training

m = np.load(MEND, allow_pickle=True)
c = np.load(CALIB, allow_pickle=True)
Xm, ym = m["X"], m["y"]
Xc, yc = c["X"], c["y"]
print(f"Mendeley {len(ym)}   yours {len(yc)}")

# Hold out 25% of YOUR samples as the test set -- the model must be judged
# on your signing, since that is the deployment condition.
Xc_tr, Xc_te, yc_tr, yc_te = train_test_split(
    Xc, yc, test_size=0.25, stratify=yc, random_state=0)

# Mirror-augment everything: essential for cross-convention robustness
# (worth 23 points cross-dataset in the Task 7 ablation).
def mirror_aug(X, y):
    Xm_ = np.stack([mirror_vector(v) for v in X])
    return np.concatenate([X, Xm_]), np.concatenate([y, y])

Xm_a, ym_a = mirror_aug(Xm, ym)
Xc_a, yc_a = mirror_aug(Xc_tr, yc_tr)

Xtr = np.concatenate([Xm_a] + [Xc_a] * REPLICAS)
ytr = np.concatenate([ym_a] + [yc_a] * REPLICAS)
print(f"Training set: {len(ytr)} (yours repeated {REPLICAS}x)")

Xtr_f = batch_normalize(Xtr)
Xte_f = batch_normalize(Xc_te)

model = make_pipeline(StandardScaler(), MLPClassifier(
    hidden_layer_sizes=(512, 256), max_iter=400,
    early_stopping=True, random_state=0))
model.fit(Xtr_f, ytr)

pred = model.predict(Xte_f)
print(f"\n===== ON YOUR HELD-OUT SIGNING =====")
print(f"Accuracy: {accuracy_score(yc_te, pred):.2%}\n")
print(classification_report(yc_te, pred, zero_division=0))

os.makedirs("models", exist_ok=True)
joblib.dump(model, OUT)
print(f"Saved -> {OUT}")