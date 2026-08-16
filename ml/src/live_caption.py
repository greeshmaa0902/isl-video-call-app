"""Live ISL fingerspelling captions.

    python src/live_caption.py

Keys: q=quit  c=clear  BACKSPACE=delete last letter  SPACE=insert space
"""

import os, sys, time
from collections import Counter, deque

import cv2, joblib, numpy as np
import mediapipe as mp

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmarks import extract_two_hand_vector
from features import normalize_landmarks

MODEL = "models/finetuned.joblib"
BUFFER = 20
MIN_VOTES = 16
MIN_CONF = 0.70
COOLDOWN = 1.0
STILL_THRESH = 0.004

mp_hands = mp.solutions.hands


def main():
    model = joblib.load(MODEL)
    classes = list(model.classes_)

    preds, confs = deque(maxlen=BUFFER), deque(maxlen=BUFFER)
    caption, last_letter, last_time = "", None, 0.0
    prev_vec, flash = None, 0.0

    cap = cv2.VideoCapture(0)
    with mp_hands.Hands(max_num_hands=2, model_complexity=1,
                        min_detection_confidence=0.6,
                        min_tracking_confidence=0.6) as hands:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame = cv2.flip(frame, 1)
            res = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            vec, n = extract_two_hand_vector(res)

            if n > 0:
                motion = (float(np.mean(np.abs(vec - prev_vec)))
                          if prev_vec is not None else 1.0)
                prev_vec = vec.copy()
                if motion < STILL_THRESH:
                    proba = model.predict_proba(
                        normalize_landmarks(vec).reshape(1, -1))[0]
                    k = int(np.argmax(proba))
                    preds.append(classes[k])
                    confs.append(float(proba[k]))
            else:
                prev_vec = None
                preds.clear(); confs.clear()

            if len(preds) == BUFFER:
                letter, votes = Counter(preds).most_common(1)[0]
                mc = float(np.mean([c for p, c in zip(preds, confs)
                                    if p == letter]))
                now = time.time()
                if (votes >= MIN_VOTES and mc >= MIN_CONF
                        and not (letter == last_letter
                                 and now - last_time < COOLDOWN)):
                    caption += letter
                    last_letter, last_time, flash = letter, now, now
                    preds.clear(); confs.clear()

            h, w = frame.shape[:2]

            # progress bar: how full the vote buffer is
            fill = int(w * len(preds) / BUFFER)
            cv2.rectangle(frame, (0, 0), (fill, 5), (0, 220, 120), -1)

            # caption bar
            cv2.rectangle(frame, (0, h - 64), (w, h), (0, 0, 0), -1)
            cv2.putText(frame, caption[-32:], (16, h - 22),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 2)

            # brief flash of the committed letter
            if time.time() - flash < 0.5:
                cv2.putText(frame, last_letter, (w - 90, 70),
                            cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 220, 120), 4)

            cv2.imshow("ISL caption", frame)

            k = cv2.waitKey(1) & 0xFF
            if k == ord('q'):
                break
            elif k == ord('c'):
                caption = ""
            elif k == 8:
                caption = caption[:-1]
            elif k == 32:
                caption += " "

    cap.release()
    cv2.destroyAllWindows()
    print(f"\nFinal caption: {caption}")


if __name__ == "__main__":
    main()