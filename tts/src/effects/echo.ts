import { SAMPLE_RATE, type AudioBuffer } from '../synthesis/types.js';

/**
 * Simple feedback delay — produces the slight metallic resonance of
 * Wall-E's small internal speaker inside a metal chassis.
 *
 * Applied to the full buffer after synthesis, not in real-time.
 *
 *   delay   — delay time in ms   (default 22 ms)
 *   fb      — feedback amount    (default 0.22)
 *   wet     — mix of delayed signal added to dry (default 0.30)
 */
export function applyEcho(
  samples: AudioBuffer,
  delayMs = 22,
  feedback = 0.22,
  wet = 0.30,
): void {
  const delaySamples = Math.round((delayMs / 1000) * SAMPLE_RATE);
  const delayLine = new Float64Array(delaySamples);
  let pos = 0;

  for (let i = 0; i < samples.length; i++) {
    const delayed = delayLine[pos]!;
    const input = samples[i]!;
    delayLine[pos] = input + delayed * feedback;
    samples[i] = input + delayed * wet;
    pos = (pos + 1) % delaySamples;
  }
}
