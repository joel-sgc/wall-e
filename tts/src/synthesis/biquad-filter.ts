import { SAMPLE_RATE } from './types.js';

/**
 * Klatt (1980) two-pole all-pole resonator.
 *
 * Transfer function: H(z) = 1 / (1 - C·z⁻¹ - D·z⁻²)
 *   C = 2·exp(−π·B/Fs)·cos(2π·F/Fs)
 *   D = −exp(−2π·B/Fs)
 *
 * Provides a resonant peak at frequency F with bandwidth B.
 * Used to model vocal-tract formants.
 */
export class Resonator {
  private y1 = 0;
  private y2 = 0;
  private c: number;
  private d: number;

  constructor(freq: number, bandwidth: number, sampleRate: number = SAMPLE_RATE) {
    const r = Math.exp(-Math.PI * bandwidth / sampleRate);
    this.c = 2 * r * Math.cos(2 * Math.PI * freq / sampleRate);
    this.d = -(r * r);
  }

  /** Update resonator parameters without resetting filter state (for diphthongs). */
  setParams(freq: number, bandwidth: number, sampleRate: number = SAMPLE_RATE): void {
    const r = Math.exp(-Math.PI * bandwidth / sampleRate);
    this.c = 2 * r * Math.cos(2 * Math.PI * freq / sampleRate);
    this.d = -(r * r);
  }

  process(x: number): number {
    const y = x + this.c * this.y1 + this.d * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  reset(): void {
    this.y1 = 0;
    this.y2 = 0;
  }

  /** Approximate peak gain (Fs / (2π·B)), used for normalization. */
  static peakGain(bandwidth: number, sampleRate: number = SAMPLE_RATE): number {
    const r = Math.exp(-Math.PI * bandwidth / sampleRate);
    return 1 / (1 - r * r);
  }
}

/** One-pole low-pass: y[n] = (1-a)·x[n] + a·y[n-1], a = exp(−2π·fc/Fs) */
export class LowPass1 {
  private y1 = 0;
  private readonly a: number;

  constructor(cutoff: number, sampleRate: number = SAMPLE_RATE) {
    this.a = Math.exp(-2 * Math.PI * cutoff / sampleRate);
  }

  process(x: number): number {
    this.y1 = (1 - this.a) * x + this.a * this.y1;
    return this.y1;
  }

  reset(): void {
    this.y1 = 0;
  }
}

/** One-pole high-pass: y[n] = a·(y[n-1] + x[n] − x[n-1]) */
export class HighPass1 {
  private y1 = 0;
  private x1 = 0;
  private readonly a: number;

  constructor(cutoff: number, sampleRate: number = SAMPLE_RATE) {
    const tau = 1 / (2 * Math.PI * cutoff);
    const fs = sampleRate;
    this.a = tau * fs / (tau * fs + 1);
  }

  process(x: number): number {
    const y = this.a * (this.y1 + x - this.x1);
    this.y1 = y;
    this.x1 = x;
    return y;
  }

  reset(): void {
    this.y1 = 0;
    this.x1 = 0;
  }
}

/**
 * Simple bandpass filter built from a high-pass followed by a low-pass.
 * Used to shape noise for fricative and burst sounds.
 */
export class BandpassNoise {
  private readonly hp: HighPass1;
  private readonly lp: LowPass1;

  constructor(freqLow: number, freqHigh: number, sampleRate: number = SAMPLE_RATE) {
    this.hp = new HighPass1(freqLow, sampleRate);
    this.lp = new LowPass1(freqHigh, sampleRate);
  }

  process(x: number): number {
    return this.lp.process(this.hp.process(x));
  }

  reset(): void {
    this.hp.reset();
    this.lp.reset();
  }
}
