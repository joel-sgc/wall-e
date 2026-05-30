import { SAMPLE_RATE, type AudioBuffer } from '../synthesis/types.js';

/**
 * OLA (Overlap-Add) time stretch — makes audio longer without changing pitch.
 *
 * Chops the signal into overlapping 20 ms Hanning windows, then re-assembles
 * them with a larger hop size so the output is factor× longer.
 *
 * factor = 1.0 → no change
 * factor = 1.5 → 50% longer (words drag more)
 * factor = 2.0 → twice as long
 *
 * Simple OLA introduces mild phasing on sustained vowels; for a robot voice
 * this artefact adds to the electronic character rather than hurting it.
 */
export function applyTimeStretch(samples: AudioBuffer, factor: number): Float64Array {
  if (factor <= 1.01) return new Float64Array(samples);

  const windowSamples = Math.floor(0.020 * SAMPLE_RATE); // 20 ms window
  const hopIn         = Math.floor(windowSamples / 2);   // 50% analysis overlap
  const hopOut        = Math.round(hopIn * factor);       // wider synthesis hop

  const outputLength = Math.round(samples.length * factor);
  const output       = new Float64Array(outputLength);
  const weight       = new Float64Array(outputLength);

  // Hanning window
  const win = new Float64Array(windowSamples);
  for (let i = 0; i < windowSamples; i++) {
    win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSamples - 1)));
  }

  let outPos = 0;
  for (let inPos = 0; inPos + windowSamples <= samples.length; inPos += hopIn) {
    for (let i = 0; i < windowSamples; i++) {
      const idx = outPos + i;
      if (idx >= outputLength) break;
      const w      = win[i]!;
      output[idx]! += samples[inPos + i]! * w;
      weight[idx]! += w;
    }
    outPos += hopOut;
  }

  // Normalise by accumulated window weights to remove amplitude ripple
  for (let i = 0; i < outputLength; i++) {
    if (weight[i]! > 1e-6) output[i]! /= weight[i]!;
  }

  return output;
}
