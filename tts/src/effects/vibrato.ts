import { SAMPLE_RATE, type AudioBuffer } from '../synthesis/types.js';

/**
 * FM vibrato via variable-rate playback.
 *
 * Advances the read position at 1 + depth·sin(2π·rate·t) samples per output
 * sample. Because sin averages to zero, the average advance is 1.0 and
 * output length ≈ input length. The periodic speed variation creates a
 * metronomic pitch wobble — the "electronic oscillator" quality of Wall-E.
 */
export function applyVibrato(
  samples: AudioBuffer,
  rateHz = 4.5,
  depth  = 0.013,
): Float64Array {
  const output = new Float64Array(samples.length);
  let readPos  = 0;

  for (let i = 0; i < output.length; i++) {
    if (readPos >= samples.length - 1) break;

    const idx  = Math.floor(readPos);
    const frac = readPos - idx;
    output[i]  = samples[idx]! * (1 - frac) + (samples[idx + 1] ?? 0) * frac;

    readPos += 1.0 + depth * Math.sin(2 * Math.PI * rateHz * (i / SAMPLE_RATE));
  }

  return output;
}
