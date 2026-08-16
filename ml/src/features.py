"""Feature engineering for ISL landmark vectors.

Raw MediaPipe coords are image-relative: a sign made in the top-left of frame
produces a totally different vector from the same sign centre-frame. This module
removes position and scale while preserving what actually distinguishes letters.
"""

import numpy as np

RAW_DIM = 126
FEAT_DIM = 254          # 126 global + 126 local + 2 presence flags


def normalize_landmarks(vec):
    """Raw (126,) -> engineered (254,).

    Two complementary views:
      global : all landmarks centred on their joint centroid and scaled by
               overall spread. PRESERVES the spatial relationship between the
               two hands -- essential, since many ISL letters differ only in
               where the dominant hand contacts the non-dominant one.
      local  : each hand centred on its own wrist and scaled independently.
               Pure handshape, invariant to where the hand sits.
      flags  : which hands are present. Lets the model condition explicitly on
               one- vs two-handed letters instead of inferring it from zeros.
    """
    hands = vec.reshape(2, 21, 3).astype(np.float32)
    present = np.array([np.any(hands[0]), np.any(hands[1])], dtype=bool)

    if not present.any():
        return np.zeros(FEAT_DIM, dtype=np.float32)

    # global block
    allpts = hands[present].reshape(-1, 3)
    centroid = allpts.mean(axis=0)
    scale = max(np.linalg.norm(allpts - centroid, axis=1).max(), 1e-6)
    glob = (hands - centroid) / scale
    glob[~present] = 0.0

    # local block
    loc = np.zeros_like(hands)
    for h in range(2):
        if present[h]:
            q = hands[h] - hands[h][0]          # wrist-relative
            loc[h] = q / max(np.linalg.norm(q, axis=1).max(), 1e-6)

    return np.concatenate([glob.ravel(), loc.ravel(),
                           present.astype(np.float32)])


def batch_normalize(X):
    return np.stack([normalize_landmarks(v) for v in X])