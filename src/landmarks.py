"""Shared landmark utilities for the ISL project."""

import numpy as np

LANDMARKS_PER_HAND = 21
HAND_DIM = LANDMARKS_PER_HAND * 3          # 63
FEATURE_DIM = 2 * HAND_DIM                 # 126 -> [left(63), right(63)]


def extract_two_hand_vector(results):
    """Fixed-length 126-d vector; 0:63 always left hand, 63:126 always right.
    Missing hand -> zeros. Returns (vector, n_hands_detected)."""
    left = np.zeros(HAND_DIM, dtype=np.float32)
    right = np.zeros(HAND_DIM, dtype=np.float32)
    n = 0

    if results.multi_hand_landmarks and results.multi_handedness:
        n = len(results.multi_hand_landmarks)
        for lm, handed in zip(results.multi_hand_landmarks, results.multi_handedness):
            coords = np.array(
                [[p.x, p.y, p.z] for p in lm.landmark], dtype=np.float32
            ).flatten()
            if handed.classification[0].label == "Left":
                left = coords
            else:
                right = coords

    return np.concatenate([left, right]), n


def mirror_vector(vec):
    """Horizontally mirror a 126-d vector: flip x about 0.5, swap L/R slots.
    Used as training augmentation for left/right dominance invariance."""
    out = vec.reshape(2, LANDMARKS_PER_HAND, 3).copy()
    out[:, :, 0] = 1.0 - out[:, :, 0]
    out = out[::-1]
    return out.reshape(-1)