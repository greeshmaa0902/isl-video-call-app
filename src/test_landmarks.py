import time
import cv2
import numpy as np
import mediapipe as mp

mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils
mp_styles = mp.solutions.drawing_styles

LANDMARKS_PER_HAND = 21
FEATURE_DIM = 2 * LANDMARKS_PER_HAND * 3  # 126 -> [left(63), right(63)]


def extract_two_hand_vector(results):
    """
    Build a fixed-length 126-d vector, slot-assigned by handedness so that
    index 0-62 is ALWAYS the left hand and 63-125 is ALWAYS the right hand.
    A missing hand contributes zeros.

    Slot assignment (rather than raw detection order) is essential: without it
    the same sign produces different vectors run to run and the model cannot learn.
    """
    left = np.zeros(LANDMARKS_PER_HAND * 3, dtype=np.float32)
    right = np.zeros(LANDMARKS_PER_HAND * 3, dtype=np.float32)

    if results.multi_hand_landmarks and results.multi_handedness:
        for lm, handed in zip(results.multi_hand_landmarks, results.multi_handedness):
            coords = np.array(
                [[p.x, p.y, p.z] for p in lm.landmark], dtype=np.float32
            ).flatten()
            if handed.classification[0].label == "Left":
                left = coords
            else:
                right = coords

    return np.concatenate([left, right])


def main():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Cannot open webcam. Check camera permissions / index.")

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    frames = 0
    both_hands_frames = 0
    any_hand_frames = 0
    prev_t = time.time()
    fps = 0.0
    vector = np.zeros(FEATURE_DIM, dtype=np.float32)

    with mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        model_complexity=1,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.6,
    ) as hands:

        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break

            # Mirror FIRST, then process. MediaPipe reports handedness assuming a
            # selfie-view (mirrored) image, so flipping before inference makes the
            # 'Left'/'Right' labels match the signer's actual hands.
            frame = cv2.flip(frame, 1)

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            results = hands.process(rgb)

            vector = extract_two_hand_vector(results)

            n_hands = len(results.multi_hand_landmarks) if results.multi_hand_landmarks else 0
            frames += 1
            if n_hands >= 1:
                any_hand_frames += 1
            if n_hands == 2:
                both_hands_frames += 1

            if results.multi_hand_landmarks:
                for lm in results.multi_hand_landmarks:
                    mp_draw.draw_landmarks(
                        frame,
                        lm,
                        mp_hands.HAND_CONNECTIONS,
                        mp_styles.get_default_hand_landmarks_style(),
                        mp_styles.get_default_hand_connections_style(),
                    )

            now = time.time()
            fps = 0.9 * fps + 0.1 * (1.0 / max(now - prev_t, 1e-6))
            prev_t = now

            left_ok = np.any(vector[:63])
            right_ok = np.any(vector[63:])

            hud = [
                f"FPS: {fps:5.1f}",
                f"Hands detected: {n_hands}",
                f"Left slot:  {'FILLED' if left_ok else 'empty'}",
                f"Right slot: {'FILLED' if right_ok else 'empty'}",
                f"Vector dim: {vector.shape[0]}",
                "q=quit  v=print vector  s=stats",
            ]
            for i, line in enumerate(hud):
                cv2.putText(frame, line, (12, 34 + i * 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 4, cv2.LINE_AA)
                cv2.putText(frame, line, (12, 34 + i * 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 120), 2, cv2.LINE_AA)

            cv2.imshow("ISL - Task 1 landmark check", frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("v"):
                np.set_printoptions(precision=3, suppress=True)
                print(f"\nshape={vector.shape}  nonzero={int(np.count_nonzero(vector))}")
                print("left  wrist xyz:", vector[0:3])
                print("right wrist xyz:", vector[63:66])
            elif key == ord("s"):
                print(f"\nframes={frames}  "
                      f"any-hand={any_hand_frames / max(frames,1):.1%}  "
                      f"both-hands={both_hands_frames / max(frames,1):.1%}")

    cap.release()
    cv2.destroyAllWindows()

    print("\n===== TASK 1 REPORT =====")
    print(f"Total frames        : {frames}")
    print(f"At least one hand   : {any_hand_frames / max(frames,1):.1%}")
    print(f"Both hands tracked  : {both_hands_frames / max(frames,1):.1%}")
    print(f"Approx FPS          : {fps:.1f}")
    print("Target: >90% both-hand detection while signing, >=15 FPS.")


if __name__ == "__main__":
    main()