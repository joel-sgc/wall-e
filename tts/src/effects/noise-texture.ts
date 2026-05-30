import { SAMPLE_RATE, type AudioBuffer } from '../synthesis/types.js';
import { BandpassNoise } from '../synthesis/biquad-filter.js';
import { noiseSample } from '../synthesis/waveforms.js';

/**
 * Adds mid-frequency electronic noise shaped by the speech amplitude envelope.
 *
 * Ben Burtt described adding "electronic noise around the words" to give
 * Wall-E's voice a non-human texture. This tracks the local RMS of the speech
 * and adds bandpass noise (1.2–4 kHz) at that level — present during speech,
 * silent during pauses. The frequency band sits above speech fundamentals so
 * it colours without masking vowels.
 */
export function applyNoiseTexture(samples: AudioBuffer, level = 0.08): void {
  const windowSize = Math.floor(0.008 * SAMPLE_RATE); // 8 ms RMS window

  // Build smoothed RMS envelope with a sliding window
  const envelope = new Float64Array(samples.length);
  let rmsSum = 0;
  for (let i = 0; i < Math.min(windowSize, samples.length); i++) {
    rmsSum += samples[i]! ** 2;
  }
  for (let i = 0; i < samples.length; i++) {
    const ahead = i + windowSize;
    if (ahead < samples.length) rmsSum += samples[ahead]! ** 2;
    if (i > 0)                  rmsSum -= samples[i - 1]! ** 2;
    envelope[i] = Math.sqrt(Math.max(0, rmsSum / windowSize));
  }

  const bp = new BandpassNoise(1200, 4000);
  for (let i = 0; i < samples.length; i++) {
    samples[i]! += bp.process(noiseSample()) * envelope[i]! * level;
  }
}
