// Génère l'alerte du Communiqué de Rome : deux accords brefs, timbre de cloche
// feutrée, puis une note grave tenue. Urgent et solennel, sans évoquer une sirène.
import { writeFileSync } from "node:fs";
const rate = 22050;
const dur = 1.9;
const n = Math.floor(rate * dur);
const data = new Float32Array(n);
const strike = (t0, freqs, amp, decay) => {
  for (let i = Math.floor(t0 * rate); i < n; i++) {
    const t = i / rate - t0;
    const env = Math.min(1, t / 0.006) * Math.exp(-t / decay);
    let v = 0;
    for (const [f, a] of freqs) v += a * Math.sin(2 * Math.PI * f * t) + 0.25 * a * Math.sin(2 * Math.PI * f * 2.01 * t) * Math.exp(-t / (decay * 0.4));
    data[i] += amp * env * v;
  }
};
strike(0.0, [[659.25, 1], [987.77, 0.55]], 0.32, 0.22);
strike(0.24, [[659.25, 1], [987.77, 0.55]], 0.32, 0.22);
strike(0.62, [[329.63, 1], [493.88, 0.5], [164.81, 0.6]], 0.42, 0.55);
let peak = 0;
for (const v of data) peak = Math.max(peak, Math.abs(v));
const buf = Buffer.alloc(44 + n * 2);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) {
  const fade = i > n - rate * 0.15 ? (n - i) / (rate * 0.15) : 1;
  buf.writeInt16LE(Math.round((data[i] / peak) * 0.8 * fade * 32767), 44 + i * 2);
}
writeFileSync(new URL("../apps/client/assets/sounds/rome-alert.wav", import.meta.url), buf);
console.log("rome-alert.wav", buf.length, "octets");
