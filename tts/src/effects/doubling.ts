import { SAMPLE_RATE, type AudioBuffer } from '../synthesis/types.js';

/**
 * Voice doubling — mix the signal with a slightly delayed copy of itself.
 *
 * Creates a comb-filter coloring (periodic notches spaced at 1/delay Hz)
 * that gives that characteristic "electronic duplicate" quality without
 * adding harmonic distortion.  Wall-E's voice has this layered texture
 * from the way Ben Burtt stacked synthesizer tracks.
 *
 *   delayMs — offset of the duplicate in milliseconds (5–15 ms is the sweet spot)
 *   mix     — amplitude of the delayed copy (0 = off, 1 = equal level)
 */
export function applyDoubling(
  samples: AudioBuffer,
  delayMs = 8,
  mix = 0.42,
): void {
  const delaySamples = Math.round((delayMs / 1000) * SAMPLE_RATE);

  // Walk forward, adding the delayed copy in place.
  // Reading samples[i - delaySamples] is the unmodified original because
  // we haven't touched those positions yet in this pass.
  for (let i = delaySamples; i < samples.length; i++) {
    samples[i]! += samples[i - delaySamples]! * mix;
  }
}
