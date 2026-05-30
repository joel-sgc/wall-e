import type { AudioBuffer } from '../synthesis/types.js';

/**
 * Soft-clip (tanh saturation) applied to the entire buffer in place.
 * Drive > 1 adds more harmonic content and "buzz" — Wall-E uses a light
 * drive (~1.8) that warms the tone without heavy clipping.
 */
export function applySoftClip(samples: AudioBuffer, drive = 1.8): void {
  const norm = 1 / Math.tanh(drive);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.tanh(samples[i]! * drive) * norm;
  }
}

/**
 * Normalize the buffer so the loudest peak equals `targetAmplitude`.
 * Applied after all effects to avoid clipping the WAV output.
 */
export function normalizeAudio(samples: AudioBuffer, targetAmplitude = 0.88): void {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]!);
    if (abs > max) max = abs;
  }
  if (max < 1e-9) return;
  const gain = targetAmplitude / max;
  for (let i = 0; i < samples.length; i++) {
    samples[i]! *= gain;
  }
}
