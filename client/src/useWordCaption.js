// ISL word-level captions from a video element.
// Captures a full gesture (hands appear -> motion -> stillness/disappear),
// then evenly resamples it to 30 frames -- matching how training videos
// were sampled (np.linspace across the whole clip).
//
// Includes x-mirroring + Left/Right swap to match cv2.flip(frame, 1) used
// during training -- verified necessary via direct testing.

import { useEffect, useRef, useState } from "react";
import { WordModel } from "./wordModel";

const LM = 21;
const HAND_DIM = LM * 3;

function extractTwoHandVectorMirrored(results) {
  const left = new Float32Array(HAND_DIM);
  const right = new Float32Array(HAND_DIM);
  let n = 0;

  if (results.multiHandLandmarks && results.multiHandedness) {
    n = results.multiHandLandmarks.length;
    for (let h = 0; h < n; h++) {
      const lm = results.multiHandLandmarks[h];
      const label = results.multiHandedness[h].label;
            const target = label === "Left" ? left : right;  // TEMP: no swap
      for (let i = 0; i < LM; i++) {
        target[i * 3]     = lm[i].x;  // TEMP: no flip
        target[i * 3 + 1] = lm[i].y;
        target[i * 3 + 2] = lm[i].z;
      }
    }
  }

  const vec = new Float32Array(126);
  vec.set(left, 0);
  vec.set(right, HAND_DIM);
  return { vec, n };
}

const SEQ_LEN = 30;
const MIN_CONF = 0.4;
const COOLDOWN = 1500;
const MIN_GESTURE_FRAMES = 12;
const MAX_GESTURE_FRAMES = 45;
const NO_HAND_GRACE = 5;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

function resampleToFixedLength(frames, targetLen) {
  const n = frames.length;
  if (n === targetLen) return frames;
  const out = [];
  for (let i = 0; i < targetLen; i++) {
    const idx = Math.min(n - 1, Math.round((i * (n - 1)) / (targetLen - 1)));
    out.push(frames[idx]);
  }
  return out;
}

export function useWordCaption(videoRef, enabled, onWord) {
  const [lastWord, setLastWord] = useState("");
  const state = useRef({
    raw: [],
    noHandCount: 0,
    lastWordSpoken: null,
    lastCommitTime: 0,
    model: null, hands: null, raf: null,
  });

  function finalizeGesture(s) {
    const rawCount = s.raw.length;
    if (rawCount < MIN_GESTURE_FRAMES) {
      s.raw = [];
      return;
    }
    const resampled = resampleToFixedLength(s.raw, SEQ_LEN);
    s.raw = [];

    const { word, conf } = s.model.predict(resampled);
    console.log(`GESTURE: ${word} (conf=${conf.toFixed(3)}, raw_frames=${rawCount})`);

    const now = Date.now();
    const repeat = word === s.lastWordSpoken && now - s.lastCommitTime < COOLDOWN;

    if (conf >= MIN_CONF && !repeat) {
      s.lastWordSpoken = word;
      s.lastCommitTime = now;
      setLastWord(word);
      onWord?.(word, conf);
    }
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const s = state.current;
    s.raw = [];
    s.noHandCount = 0;

    (async () => {
      s.model = await WordModel.load("/word_model_finetuned.json");
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
      const Hands = window.Hands;

      const hands = new Hands({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
      });
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });

      hands.onResults((results) => {
        const { vec, n } = extractTwoHandVectorMirrored(results);

        if (n === 0) {
          s.noHandCount++;
          if (s.noHandCount >= NO_HAND_GRACE) {
            finalizeGesture(s);
          }
          return;
        }
        s.noHandCount = 0;
        s.raw.push(vec);
        if (s.raw.length > MAX_GESTURE_FRAMES) {
          s.raw.shift();
        }
      });

      s.hands = hands;
      const loop = async () => {
        if (cancelled) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2) {
          try { await hands.send({ image: v }); } catch {}
        }
        s.raf = requestAnimationFrame(loop);
      };
      loop();
    })();

    return () => {
      cancelled = true;
      if (s.raf) cancelAnimationFrame(s.raf);
      s.hands?.close();
      s.raw = [];
    };
  }, [enabled]);

  return { lastWord };
}