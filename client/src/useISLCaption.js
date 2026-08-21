// ISL fingerspelling captions from a video element.
// Motion gating rejects transition frames; majority voting over a buffer
// commits a letter only when it is stable. Mirrors ml/src/live_caption.py.
//
// MediaPipe Hands is loaded via a <script> tag from the CDN rather than an
// npm import -- @mediapipe/hands' packaging does not resolve cleanly through
// Vite's ES module interop, and this is the approach MediaPipe's own browser
// examples use.

import { useEffect, useRef, useState } from "react";
import { extractTwoHandVector, normalizeLandmarks, ISLModel } from "./islModel";

const BUFFER = 20;
const MIN_VOTES = 16;
const MIN_CONF = 0.70;
const COOLDOWN = 1000;
const STILL_THRESH = 0.004;

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

export function useISLCaption(videoRef, enabled, onLetter) {
  const [caption, setCaption] = useState("");
  const state = useRef({
    preds: [], confs: [], prev: null,
    last: null, lastTime: 0, model: null, hands: null, raf: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const s = state.current;

    (async () => {
      s.model = await ISLModel.load("/isl_model.json");

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
        console.log("onResults called, hands found:", results.multiHandLandmarks?.length || 0);
        const { vec, n } = extractTwoHandVector(results);
        if (n === 0) { s.prev = null; s.preds = []; s.confs = []; return; }

        let motion = 1.0;
        if (s.prev) {
          let sum = 0;
          for (let i = 0; i < vec.length; i++) sum += Math.abs(vec[i] - s.prev[i]);
          motion = sum / vec.length;
        }
        s.prev = vec.slice();
        if (motion >= STILL_THRESH) return;

        const { letter, conf } = s.model.predict(normalizeLandmarks(vec));
        s.preds.push(letter); s.confs.push(conf);
        if (s.preds.length > BUFFER) { s.preds.shift(); s.confs.shift(); }
        if (s.preds.length < BUFFER) return;

        const counts = {};
        for (const p of s.preds) counts[p] = (counts[p] || 0) + 1;
        const top = Object.keys(counts).reduce((a, b) => counts[a] >= counts[b] ? a : b);
        const votes = counts[top];
        const mc = s.confs.filter((_, i) => s.preds[i] === top)
                          .reduce((a, b) => a + b, 0) / votes;

        const now = Date.now();
        const repeat = top === s.last && now - s.lastTime < COOLDOWN;
        if (votes >= MIN_VOTES && mc >= MIN_CONF && !repeat) {
          s.last = top; s.lastTime = now;
          s.preds = []; s.confs = [];
          setCaption((c) => {
            const next = (c + top).slice(-60);
            onLetter?.(next);
            return next;
          });
        }
      });

      s.hands = hands;
            let frameCount = 0;
      const loop = async () => {
        if (cancelled) return;
        const v = videoRef.current;
        frameCount++;
        if (frameCount % 30 === 0) {
          console.log("video:", v?.readyState, v?.videoWidth, v?.videoHeight);
        }
        if (v && v.readyState >= 2) {
          try { await hands.send({ image: v }); } catch (e) {
            if (frameCount % 30 === 0) console.log("send error:", e);
          }
        }
        s.raf = requestAnimationFrame(loop);
      };
      loop();
    })();

    return () => {
      cancelled = true;
      if (s.raf) cancelAnimationFrame(s.raf);
      s.hands?.close();
      s.preds = []; s.confs = []; s.prev = null;
    };
  }, [enabled]);

  return { caption, clear: () => setCaption("") };
}