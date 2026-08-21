// ISL fingerspelling inference in the browser.
// Mirrors ml/src/landmarks.py and ml/src/features.py exactly. Any divergence
// between these and the Python versions silently destroys accuracy, so keep
// them in sync.

const LM = 21;
const HAND_DIM = LM * 3;      // 63

// --- landmarks.py: extract_two_hand_vector ---------------------------------
// Slot assignment by handedness: 0..62 always left, 63..125 always right.
export function extractTwoHandVector(results) {
  const left = new Float32Array(HAND_DIM);
  const right = new Float32Array(HAND_DIM);
  let n = 0;

  if (results.multiHandLandmarks && results.multiHandedness) {
    n = results.multiHandLandmarks.length;
    for (let h = 0; h < n; h++) {
      const lm = results.multiHandLandmarks[h];
      const label = results.multiHandedness[h].label;   // "Left" | "Right"
      const target = label === "Left" ? left : right;
      for (let i = 0; i < LM; i++) {
        target[i * 3]     = lm[i].x;
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

// --- features.py: normalize_landmarks --------------------------------------
export function normalizeLandmarks(vec) {
  const out = new Float32Array(254);
  const present = [false, false];
  for (let h = 0; h < 2; h++) {
    for (let i = 0; i < HAND_DIM; i++) {
      if (vec[h * HAND_DIM + i] !== 0) { present[h] = true; break; }
    }
  }
  if (!present[0] && !present[1]) return out;

  // global block: centre on the centroid of all present joints, scale by
  // max radius. Preserves the spatial relation between the two hands.
  let cx = 0, cy = 0, cz = 0, cnt = 0;
  for (let h = 0; h < 2; h++) {
    if (!present[h]) continue;
    for (let i = 0; i < LM; i++) {
      cx += vec[h * HAND_DIM + i * 3];
      cy += vec[h * HAND_DIM + i * 3 + 1];
      cz += vec[h * HAND_DIM + i * 3 + 2];
      cnt++;
    }
  }
  cx /= cnt; cy /= cnt; cz /= cnt;

  let scale = 1e-6;
  for (let h = 0; h < 2; h++) {
    if (!present[h]) continue;
    for (let i = 0; i < LM; i++) {
      const dx = vec[h * HAND_DIM + i * 3] - cx;
      const dy = vec[h * HAND_DIM + i * 3 + 1] - cy;
      const dz = vec[h * HAND_DIM + i * 3 + 2] - cz;
      const d = Math.hypot(dx, dy, dz);
      if (d > scale) scale = d;
    }
  }

  for (let h = 0; h < 2; h++) {
    if (!present[h]) continue;
    for (let i = 0; i < LM; i++) {
      const b = h * HAND_DIM + i * 3;
      out[b]     = (vec[b] - cx) / scale;
      out[b + 1] = (vec[b + 1] - cy) / scale;
      out[b + 2] = (vec[b + 2] - cz) / scale;
    }
  }

  // local block: each hand centred on its own wrist, scaled independently.
  // Pure handshape, invariant to where the hand sits in frame.
  for (let h = 0; h < 2; h++) {
    if (!present[h]) continue;
    const base = h * HAND_DIM;
    const wx = vec[base], wy = vec[base + 1], wz = vec[base + 2];
    let s = 1e-6;
    for (let i = 0; i < LM; i++) {
      const d = Math.hypot(vec[base + i * 3] - wx,
                           vec[base + i * 3 + 1] - wy,
                           vec[base + i * 3 + 2] - wz);
      if (d > s) s = d;
    }
    for (let i = 0; i < LM; i++) {
      const o = 126 + base + i * 3;
      out[o]     = (vec[base + i * 3] - wx) / s;
      out[o + 1] = (vec[base + i * 3 + 1] - wy) / s;
      out[o + 2] = (vec[base + i * 3 + 2] - wz) / s;
    }
  }

  out[252] = present[0] ? 1 : 0;
  out[253] = present[1] ? 1 : 0;
  return out;
}

// --- sklearn pipeline forward pass -----------------------------------------
export class ISLModel {
  static async load(url = "/isl_model.json") {
    const m = await (await fetch(url)).json();
    return new ISLModel(m);
  }

  constructor(m) {
    this.classes = m.classes;
    this.mean = Float32Array.from(m.scaler_mean);
    this.scale = Float32Array.from(m.scaler_scale);
    this.W = m.weights.map(w => w.map(r => Float32Array.from(r)));
    this.b = m.biases.map(b => Float32Array.from(b));
  }

  predict(feat) {
    let a = new Float32Array(feat.length);
    for (let i = 0; i < feat.length; i++) {
      a[i] = (feat[i] - this.mean[i]) / this.scale[i];
    }

    for (let L = 0; L < this.W.length; L++) {
      const W = this.W[L], bias = this.b[L];
      const out = new Float32Array(bias.length);
      for (let j = 0; j < bias.length; j++) out[j] = bias[j];
      for (let i = 0; i < a.length; i++) {
        const ai = a[i];
        if (ai === 0) continue;
        const row = W[i];
        for (let j = 0; j < out.length; j++) out[j] += ai * row[j];
      }
      if (L < this.W.length - 1) {
        for (let j = 0; j < out.length; j++) if (out[j] < 0) out[j] = 0;  // relu
      }
      a = out;
    }

    let max = -Infinity;
    for (const v of a) if (v > max) max = v;
    let sum = 0;
    for (let j = 0; j < a.length; j++) { a[j] = Math.exp(a[j] - max); sum += a[j]; }
    let best = 0;
    for (let j = 0; j < a.length; j++) { a[j] /= sum; if (a[j] > a[best]) best = j; }

    return { letter: this.classes[best], conf: a[best] };
  }
}