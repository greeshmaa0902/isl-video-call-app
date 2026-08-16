"""Task 4 - Collect out-of-distribution webcam samples and evaluate.

    python src/collect_webcam.py            # collect, then auto-evaluate
    python src/collect_webcam.py --eval     # evaluate existing collection only

Controls (click the video window first so it has keyboard focus):
    SPACE or c   start a 3-second countdown, then record PER_LETTER frames
    s            skip the current letter
    q            quit early and save whatever was collected
"""

import argparse, os, sys, time
import cv2, numpy as np, joblib
import mediapipe as mp
from sklearn.metrics import accuracy_score, classification_report

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmarks import extract_two_hand_vector
from features import batch_normalize

LETTERS = list("ABCDEFGHIKLMNOPQRSTUVWXY")
PER_LETTER = 60
OUT = "data/processed/webcam_calib.npz"
mp_hands = mp.solutions.hands


def collect():
    X, y = [], []
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Cannot open webcam.")

    print("\nClick the video window first, then press SPACE (or 'c') to record.\n")

    with mp_hands.Hands(max_num_hands=2, model_complexity=1,
                        min_detection_confidence=0.5) as hands:

        for letter in LETTERS:
            captured = 0
            state = "wait"                 # wait -> countdown -> record
            countdown_start = None

            while captured < PER_LETTER:
                ok, frame = cap.read()
                if not ok:
                    break

                frame = cv2.flip(frame, 1)
                res = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                vec, n = extract_two_hand_vector(res)

                if state == "countdown":
                    left = 3.0 - (time.time() - countdown_start)
                    if left <= 0:
                        state = "record"
                    else:
                        cv2.putText(frame, str(int(left) + 1), (280, 260),
                                    cv2.FONT_HERSHEY_SIMPLEX, 4.0,
                                    (0, 200, 255), 8)

                if state == "record":
                    if n > 0:
                        X.append(vec)
                        y.append(letter)
                        captured += 1
                        # Spread the 20 frames over ~3s so the samples capture
                        # real pose variation rather than 20 copies of one frame.
                        time.sleep(0.15)
                    else:
                        cv2.putText(frame, "NO HANDS DETECTED", (12, 300),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.9,
                                    (0, 0, 255), 3)

                msg = f"{letter}  [{captured}/{PER_LETTER}]  hands={n}  {state.upper()}"
                col = (0, 0, 255) if state == "record" else (0, 255, 120)
                cv2.putText(frame, msg, (12, 40), cv2.FONT_HERSHEY_SIMPLEX,
                            0.9, (0, 0, 0), 5)
                cv2.putText(frame, msg, (12, 40), cv2.FONT_HERSHEY_SIMPLEX,
                            0.9, col, 2)
                cv2.putText(frame, "SPACE/c=start   s=skip   q=quit", (12, 78),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                cv2.imshow("Collect ISL OOD samples", frame)

                k = cv2.waitKey(1) & 0xFF
                if k in (32, ord('c')) and state == "wait":
                    state = "countdown"
                    countdown_start = time.time()
                elif k == ord('s'):
                    break
                elif k == ord('q'):
                    cap.release()
                    cv2.destroyAllWindows()
                    save(X, y)
                    return

    cap.release()
    cv2.destroyAllWindows()
    save(X, y)


def save(X, y):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    np.savez_compressed(OUT, X=np.asarray(X, np.float32), y=np.asarray(y))
    print(f"\nSaved {len(X)} samples -> {OUT}")


def evaluate():
    if not os.path.exists(OUT):
        print(f"No collection found at {OUT}. Run without --eval first.")
        return

    d = np.load(OUT, allow_pickle=True)
    X, y = batch_normalize(d["X"]), d["y"]
    if len(y) == 0:
        print("Collection is empty -- nothing to evaluate.")
        return

    model = joblib.load(MODEL)
    pred = model.predict(X)
    acc = accuracy_score(y, pred)

    print("\n===== OUT-OF-DISTRIBUTION RESULT =====")
    print(f"Samples : {len(y)}")
    print(f"Accuracy: {acc:.2%}")
    print("(dataset-internal test was 99.85%)\n")
    print(classification_report(y, pred, zero_division=0))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--eval", action="store_true",
                    help="skip collection, evaluate the existing .npz")
    args = ap.parse_args()

    if not args.eval:
        collect()
    evaluate()