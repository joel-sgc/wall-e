export const SAMPLE_RATE = 44100;
export const CHANNELS = 1;
export const BIT_DEPTH = 16;

/** Normalized float audio samples, values in [-1, 1] */
export type AudioBuffer = Float64Array;

export interface FormantData {
  f1: number;
  f2: number;
  f3: number;
  b1: number;
  b2: number;
  b3: number;
}

export interface SynthContext {
  sampleRate: number;
  /** Current pitch in Hz (before vibrato) */
  basePitch: number;
  /** Vibrato rate in Hz */
  vibratoRate: number;
  /** Vibrato depth as fractional frequency deviation (e.g. 0.012 = ±1.2%) */
  vibratoDepth: number;
  /** Running vibrato phase in samples, shared across phonemes for continuity */
  vibratoPhase: number;
  /** Running sawtooth phase (0..1), shared for continuity */
  sawPhase: number;
}
