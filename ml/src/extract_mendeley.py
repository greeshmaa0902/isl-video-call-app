"""Task 5 - Extract landmarks from the Mendeley ISL dataset.

Walks data_mendeley/ISL Images/**/English Alphabet/<LETTER>/*.jpg and stores a
126-d landmark vector per image, tagged with age group and sleeve type so a
signer-independent split (train Adults -> test Kids) is possible later.

    python src/extract_mendeley.py --limit 20     # smoke test first
    python src/extract_mendeley.py                # full run (~45-60 min)
    python src/extract_mendeley.py --resume       # continue after a crash

Notes:
  * E1 and E2 are two interchangeable ISL signs for 'E'; both map to label E.
    A 'variant' column records which was used, so the merge can be revisited.
  * Hindi Vowels and Numerals are skipped -- Phase A is the English alphabet.
  * Progress is checkpointed every CHECKPOINT_EVERY images. A crash at image
    80,000 costs you the last chunk, not the whole run.
"""

import argparse
import os
import sys
import time

import cv2
import numpy as np
import mediapipe as mp

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmarks import extract_two_hand_vector, FEATURE_DIM  # noqa: E402

ROOT = "data_mendeley"
OUT_DIR = os.path.join("data", "processed")
OUT_NPZ = os.path.join(OUT_DIR, "mendeley_landmarks.npz")
CKPT = os.path.join(OUT_DIR, "mendeley_checkpoint.npz")
IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp")
CHECKPOINT_EVERY = 2000

mp_hands = mp.solutions.hands


def infer_age(path_lower):
    for key in ("kid", "teenager", "adult"):
        if key in path_lower:
            return key
    return "unknown"


def infer_sleeve(path_lower):
    if "full sleeve" in path_lower:
        return "full"
    if "half sleeve" in path_lower:
        return "half"
    return "unknown"


def find_letter_dirs(root):
    """Locate every <LETTER> folder under an 'English Alphabet' parent.

    Path names are matched case-insensitively on substrings rather than
    hardcoded, so variations in the numbered folder names ('1. Kids ISL
    images' vs '2. Teenagers ISL images') are handled automatically.
    """
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        parent = os.path.basename(os.path.dirname(dirpath)).lower()
        if "english alphabet" not in parent:
            continue
        if not any(f.lower().endswith(IMG_EXT) for f in filenames):
            continue

        raw = os.path.basename(dirpath)
        low = dirpath.lower()
        found.append({
            "dir": dirpath,
            "raw_label": raw,
            "label": "E" if raw.upper() in ("E1", "E2") else raw.upper(),
            "variant": raw.upper() if raw.upper() in ("E1", "E2") else "",
            "age": infer_age(low),
            "sleeve": infer_sleeve(low),
            "files": sorted(f for f in filenames if f.lower().endswith(IMG_EXT)),
        })
    return sorted(found, key=lambda d: d["dir"])


def save(arrays, path):
    os.makedirs(OUT_DIR, exist_ok=True)
    np.savez_compressed(
        path,
        X=np.asarray(arrays["X"], dtype=np.float32),
        y=np.asarray(arrays["y"]),
        age=np.asarray(arrays["age"]),
        sleeve=np.asarray(arrays["sleeve"]),
        variant=np.asarray(arrays["variant"]),
        n_hands=np.asarray(arrays["n_hands"], dtype=np.int8),
        src=np.asarray(arrays["src"]),
        done_dirs=np.asarray(sorted(arrays["done_dirs"])),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="max images per letter folder (smoke test)")
    ap.add_argument("--resume", action="store_true",
                    help="continue from the last checkpoint")
    args = ap.parse_args()

    if not os.path.isdir(ROOT):
        raise SystemExit(f"'{ROOT}' not found. Run from the project root.")

    dirs = find_letter_dirs(ROOT)
    if not dirs:
        raise SystemExit("No letter folders found under an 'English Alphabet' parent.")

    acc = {k: [] for k in
           ("X", "y", "age", "sleeve", "variant", "n_hands", "src")}
    acc["done_dirs"] = set()

    if args.resume and os.path.exists(CKPT):
        d = np.load(CKPT, allow_pickle=True)
        for k in ("X", "y", "age", "sleeve", "variant", "n_hands", "src"):
            acc[k] = list(d[k])
        acc["done_dirs"] = set(d["done_dirs"].tolist())
        print(f"Resuming: {len(acc['X'])} samples, "
              f"{len(acc['done_dirs'])} folders already done.\n")

    todo = [e for e in dirs if e["dir"] not in acc["done_dirs"]]
    labels = sorted({e["label"] for e in dirs})
    total_imgs = sum(len(e["files"][:args.limit] if args.limit else e["files"])
                     for e in todo)

    print(f"Letter folders : {len(dirs)}  ({len(todo)} remaining)")
    print(f"Distinct labels: {len(labels)}  {labels}")
    print(f"Images to read : {total_imgs}\n")

    seen = kept = 0
    t0 = time.time()

    with mp_hands.Hands(static_image_mode=True, max_num_hands=2,
                        model_complexity=1, min_detection_confidence=0.5) as hands:

        for ei, e in enumerate(todo, 1):
            files = e["files"][:args.limit] if args.limit else e["files"]
            folder_kept = 0

            for fname in files:
                img = cv2.imread(os.path.join(e["dir"], fname))
                seen += 1
                if img is None:
                    continue

                # Downscale large smartphone photos: MediaPipe resizes
                # internally anyway, and this roughly halves runtime.
                h, w = img.shape[:2]
                if max(h, w) > 1024:
                    s = 1024.0 / max(h, w)
                    img = cv2.resize(img, (int(w * s), int(h * s)))

                res = hands.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
                vec, n = extract_two_hand_vector(res)
                if n == 0:
                    continue

                acc["X"].append(vec)
                acc["y"].append(e["label"])
                acc["age"].append(e["age"])
                acc["sleeve"].append(e["sleeve"])
                acc["variant"].append(e["variant"])
                acc["n_hands"].append(n)
                acc["src"].append(os.path.join(e["dir"], fname))
                kept += 1
                folder_kept += 1

                if kept % CHECKPOINT_EVERY == 0:
                    save(acc, CKPT)

            acc["done_dirs"].add(e["dir"])
            rate = folder_kept / max(len(files), 1)
            elapsed = time.time() - t0
            eta = (elapsed / max(seen, 1)) * (total_imgs - seen)
            print(f"[{ei:3d}/{len(todo)}] {e['age']:>9} {e['sleeve']:>4} "
                  f"{e['raw_label']:>3}  {folder_kept:4d}/{len(files):4d} "
                  f"({rate:5.1%})  ETA {eta/60:4.1f}m")
            save(acc, CKPT)

    save(acc, OUT_NPZ)

    X = np.asarray(acc["X"], dtype=np.float32)
    y = np.asarray(acc["y"])
    age = np.asarray(acc["age"])
    nh = np.asarray(acc["n_hands"])

    print("\n===== TASK 5 REPORT =====")
    print(f"Feature matrix : {X.shape}  (expected N x {FEATURE_DIM})")
    print(f"Images read    : {seen}")
    print(f"Landmarks kept : {kept} ({kept/max(seen,1):.1%})")
    if len(X):
        print(f"Two-hand       : {(nh == 2).mean():.1%}")
        print(f"One-hand       : {(nh == 1).mean():.1%}")
    print(f"Elapsed        : {(time.time()-t0)/60:.1f} min")
    print(f"Saved          : {OUT_NPZ}")

    print("\nBy age group:")
    for a in sorted(set(age.tolist())):
        print(f"  {a:>9}: {(age == a).sum()}")

    print("\nPer-class kept counts:")
    for lab in sorted(set(y.tolist())):
        print(f"  {lab:>3}: {(y == lab).sum()}")


if __name__ == "__main__":
    main()