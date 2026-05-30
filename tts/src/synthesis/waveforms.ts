import { SAMPLE_RATE } from './types.js';

/**
 * PolyBLEP correction term to band-limit the sawtooth discontinuity.
 * Eliminates the worst aliasing without a lookup table.
 *   t  — current phase normalized to [0, 1)
 *   dt — phase increment (freq / sampleRate)
 */
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/**
 * Band-limited sawtooth oscillator.
 *
 * The phase is advanced externally so it can be shared across phonemes for
 * continuous pitch glides. Returns the sample value for the given phase/freq
 * and mutates `phase` by reference via the returned new phase.
 *
 * Usage pattern:
 *   let phase = ctx.sawPhase;
 *   for each sample:
 *     const { sample, nextPhase } = sawtoothSample(phase, freq, SAMPLE_RATE);
 *     phase = nextPhase;
 *   ctx.sawPhase = phase;
 */
export function sawtoothSample(
  phase: number,
  freq: number,
  sampleRate: number = SAMPLE_RATE,
): { sample: number; nextPhase: number } {
  const dt = freq / sampleRate;
  const naive = 2 * phase - 1;
  const sample = naive - polyBlep(phase, dt);
  const nextPhase = (phase + dt) % 1;
  return { sample, nextPhase };
}

/** Generate white noise in [-1, 1]. */
export function noiseSample(): number {
  return Math.random() * 2 - 1;
}

/** Silence samples. */
export function silenceBuffer(nSamples: number): Float64Array {
  return new Float64Array(nSamples);
}
