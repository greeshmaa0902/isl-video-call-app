"""Task 2 - Convert the ISL alphabet image dataset into a landmark matrix.

Reads : data/<CLASS>/*.jpg
Writes: data/processed/alphabet_landmarks.npz, extraction_report.csv

    python src/extract_dataset.py --limit 30
    python src/extract_dataset.py --limit 30 --flip
    python src/extract_dataset.py
"""

import argparse
import csv
import os
import sys
import time

import cv2
import numpy as np
import mediapipe as mp

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmarks import extract_two_hand_vector, FEATURE_DIM

DATA_DIR = "data"
OUT_DIR = os.path.join("data", "processed")
IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp")

mp_hands = mp.solutions.hands


def list_classes(root):
    classes = [
        d for d in sorted(os.listdir(root))
        if os.path.isdir(os.path.join(root, d)) and d != "processed"
    ]
    if not classes:
        raise RuntimeError(f"No class folders found in {root}/")
    return classes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--flip", action="store_true")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    classes = list_classes(DATA_DIR)
    print(f"Found {len(classes)} classes: {classes}\n")

    X, y, files, frame_idx, n_hands_list = [], [], [], [], []
    failed = []
    t0 = time.time()

    with mp_hands.Hands(
        static_image_mode=True,
        max_num_hands=2,
        model_complexity=1,
        min_detection_confidence=0.5,
    ) as hands:

        for ci, cls in enumerate(classes):
            cls_dir = os.path.join(DATA_DIR, cls)
            imgs = sorted(f for f in os.listdir(cls_dir)
                          if f.lower().endswith(IMG_EXT))
            if args.limit:
                imgs = imgs[: args.limit]

            kept = 0
            for i, fname in enumerate(imgs):
                path = os.path.join(cls_dir, fname)
                img = cv2.imread(path)
                if img is None:
                    failed.append((cls, fname, "unreadable"))
                    continue

                if args.flip:
                    img = cv2.flip(img, 1)

                res = hands.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
                vec, n = extract_two_hand_vector(res)

                if n == 0:
                    failed.append((cls, fname, "no_hand_detected"))
                    continue

                X.append(vec)
                y.append(cls)
                files.append(fname)
                frame_idx.append(i)
                n_hands_list.append(n)
                kept += 1

            pct = kept / max(len(imgs), 1)
            print(f"[{ci+1:2d}/{len(classes)}] {cls:>3}  "
                  f"{kept:5d}/{len(imgs):5d} kept ({pct:5.1%})")

    X = np.asarray(X, dtype=np.float32)
    y = np.asarray(y)
    frame_idx = np.asarray(frame_idx, dtype=np.int32)
    n_hands_arr = np.asarray(n_hands_list, dtype=np.int8)

    out_npz = os.path.join(OUT_DIR, "alphabet_landmarks.npz")
    np.savez_compressed(
        out_npz, X=X, y=y, files=np.asarray(files),
        frame_idx=frame_idx, n_hands=n_hands_arr,
        classes=np.asarray(classes), flipped=np.asarray([args.flip]),
    )

    with open(os.path.join(OUT_DIR, "extraction_report.csv"), "w",
              newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["class", "file", "reason"])
        w.writerows(failed)

    total = len(X) + len(failed)
    print("\n===== TASK 2 REPORT =====")
    print(f"Feature matrix    : {X.shape}   (expected N x {FEATURE_DIM})")
    print(f"Images processed  : {total}")
    print(f"Landmarks kept    : {len(X)} ({len(X)/max(total,1):.1%})")
    print(f"Failed / no hand  : {len(failed)}")
    if len(X):
        print(f"Two-hand samples  : {(n_hands_arr == 2).mean():.1%}")
        print(f"One-hand samples  : {(n_hands_arr == 1).mean():.1%}")
    print(f"Elapsed           : {time.time()-t0:.0f}s")
    print(f"Saved             : {out_npz}")
    print("\nPer-class kept counts:")
    for cls in classes:
        print(f"  {cls:>3}: {(y == cls).sum()}")


if __name__ == "__main__":
    main()