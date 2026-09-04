// Word-level ISL sign recognition in the browser.
// Reproduces a PyTorch bidirectional LSTM + classifier head exactly.
// PyTorch LSTM gate order is [input, forget, cell, output] (i, f, g, o).

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function tanhFn(x) { return Math.tanh(x); }

function matVecAdd(W, x, b) {
  const out = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) {
    let sum = b[i];
    const row = W[i];
    for (let j = 0; j < x.length; j++) sum += row[j] * x[j];
    out[i] = sum;
  }
  return out;
}

function lstmStep(x, hPrev, cPrev, weightIh, weightHh, biasIh, biasHh, hiddenDim) {
  const gatesX = matVecAdd(weightIh, x, biasIh);
  const gatesH = matVecAdd(weightHh, hPrev, biasHh);
  const gates = new Float32Array(4 * hiddenDim);
  for (let i = 0; i < gates.length; i++) gates[i] = gatesX[i] + gatesH[i];

  const iGate = gates.slice(0, hiddenDim).map(sigmoid);
  const fGate = gates.slice(hiddenDim, 2 * hiddenDim).map(sigmoid);
  const gGate = gates.slice(2 * hiddenDim, 3 * hiddenDim).map(tanhFn);
  const oGate = gates.slice(3 * hiddenDim, 4 * hiddenDim).map(sigmoid);

  const cNew = new Float32Array(hiddenDim);
  const hNew = new Float32Array(hiddenDim);
  for (let i = 0; i < hiddenDim; i++) {
    cNew[i] = fGate[i] * cPrev[i] + iGate[i] * gGate[i];
    hNew[i] = oGate[i] * tanhFn(cNew[i]);
  }
  return { h: hNew, c: cNew };
}

function runDirection(seq, weights, hiddenDim, reverse) {
  let h = new Float32Array(hiddenDim);
  let c = new Float32Array(hiddenDim);
  const order = reverse ? [...seq].reverse() : seq;
  for (const x of order) {
    const step = lstmStep(x, h, c, weights.weight_ih, weights.weight_hh,
                          weights.bias_ih, weights.bias_hh, hiddenDim);
    h = step.h; c = step.c;
  }
  return h;
}

export class WordModel {
  static async load(url = "/word_model_3.json") {
    const m = await (await fetch(url)).json();
    return new WordModel(m);
  }

  constructor(m) {
    this.classes = m.classes;
    this.hiddenDim = m.hidden_dim;
    this.lstmFw = m.lstm_fw;
    this.lstmBw = m.lstm_bw;
    this.fc1W = m.fc1_weight;
    this.fc1B = Float32Array.from(m.fc1_bias);
    this.fc2W = m.fc2_weight;
    this.fc2B = Float32Array.from(m.fc2_bias);
  }

  predict(seq) {
    const hFw = runDirection(seq, this.lstmFw, this.hiddenDim, false);
    const hBw = runDirection(seq, this.lstmBw, this.hiddenDim, true);
    const combined = new Float32Array(this.hiddenDim * 2);
    combined.set(hFw, 0);
    combined.set(hBw, this.hiddenDim);

    let a = matVecAdd(this.fc1W, combined, this.fc1B);
    for (let i = 0; i < a.length; i++) if (a[i] < 0) a[i] = 0;

    const logits = matVecAdd(this.fc2W, a, this.fc2B);

    let max = -Infinity;
    for (const v of logits) if (v > max) max = v;
    let sum = 0;
    const probs = new Float32Array(logits.length);
    for (let i = 0; i < logits.length; i++) {
      probs[i] = Math.exp(logits[i] - max);
      sum += probs[i];
    }
    let best = 0;
    for (let i = 0; i < probs.length; i++) {
      probs[i] /= sum;
      if (probs[i] > probs[best]) best = i;
    }

    return { word: this.classes[best], conf: probs[best] };
  }
}