# src/diagnose.py
import os, sys
from collections import Counter
import cv2, joblib, numpy as np
import mediapipe as mp
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmarks import extract_two_hand_vector
from features import normalize_landmarks

model = joblib.load("models/mendeley_mirror.joblib")
classes = list(model.classes_)
cap = cv2.VideoCapture(0)
with mp.solutions.hands.Hands(
        max_num_hands=2, model_complexity=1,
        min_detection_confidence=0.6, min_tracking_confidence=0.6) as hands:
    while True:
        ok, frame = cap.read()
        if not ok: break
        frame = cv2.flip(frame, 1)
        res = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        vec, n = extract_two_hand_vector(res)
        if n > 0:
            p = model.predict_proba(normalize_landmarks(vec).reshape(1, -1))[0]
            top = np.argsort(p)[::-1][:3]
            for i, k in enumerate(top):
                cv2.putText(frame, f"{classes[k]} {p[k]:.2f}", (12, 40 + i*34),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 120), 2)
        cv2.putText(frame, f"hands={n}", (12, 150),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 200, 255), 2)
        cv2.imshow("diagnose", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'): break
cap.release(); cv2.destroyAllWindows()