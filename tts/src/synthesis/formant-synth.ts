import { SAMPLE_RATE, type AudioBuffer, type FormantData, type SynthContext } from './types.js';
import { Resonator, BandpassNoise } from './biquad-filter.js';
import { sawtoothSample, noiseSample, silenceBuffer } from './waveforms.js';
import { PHONEME_PARAMS, type PhonemeClass } from '../phonemes/arpabet.js';

export interface PhonemeSynthRequest {
  phone: string;
  durationMs: number;
  pitchStart: number;
  pitchEnd: number;
  ctx: SynthContext;
}

// ---------------------------------------------------------------------------
// ADSR envelope
// ---------------------------------------------------------------------------
function buildEnvelope(nSamples: number, attackMs = 6, releaseMs = 10): Float64Array {
  const env = new Float64Array(nSamples).fill(1);
  const atk = Math.floor((attackMs  / 1000) * SAMPLE_RATE);
  const rel = Math.floor((releaseMs / 1000) * SAMPLE_RATE);

  for (let i = 0; i < Math.min(atk, nSamples); i++) {
    env[i] = i / atk;
  }
  for (let i = 0; i < Math.min(rel, nSamples); i++) {
    const idx = nSamples - 1 - i;
    env[idx] = Math.min(env[idx]!, i / rel);
  }
  return env;
}

// ---------------------------------------------------------------------------
// Per-buffer peak normalization
// Ensures consistent levels going into the global effects chain so the tanh
// distortion operates on a known amplitude range, not on exploded values.
// ---------------------------------------------------------------------------
function peakNormalize(samples: Float64Array, target = 0.5): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]!);
    if (a > peak) peak = a;
  }
  if (peak < 1e-9) return;
  const gain = target / peak;
  for (let i = 0; i < samples.length; i++) samples[i]! *= gain;
}

// ---------------------------------------------------------------------------
// Parallel formant synthesis
//
// THREE INDEPENDENT resonators each filter the source; their outputs are
// SUMMED (not cascaded).  Cascade synthesis multiplies the gains
// (~55 × 44 × 28 ≈ 67,000 ×) causing the signal to overflow long before
// normalization.  Parallel synthesis limits total gain to roughly the sum
// of the three individual peak gains, which is controllable.
//
// Per-resonator weights: F1 carries most vowel identity (0.65), F2 adds
// brightness (0.30), F3 adds subtle air/presence (0.08).
// ---------------------------------------------------------------------------
function synthesizeVoiced(
  nSamples: number,
  formants: FormantData,
  endFormants: FormantData | undefined,
  pitchStart: number,
  pitchEnd: number,
  ctx: SynthContext,
): AudioBuffer {
  const r1 = new Resonator(formants.f1, formants.b1);
  const r2 = new Resonator(formants.f2, formants.b2);
  const r3 = new Resonator(formants.f3, formants.b3);

  // Normalize each resonator's contribution by its peak gain so the
  // per-resonator amplitude is bounded.  Then apply perceptual weights.
  const g1 = 0.65 / Resonator.peakGain(formants.b1);
  const g2 = 0.30 / Resonator.peakGain(formants.b2);
  const g3 = 0.08 / Resonator.peakGain(formants.b3);

  const samples = new Float64Array(nSamples);
  let sawPhase    = ctx.sawPhase;
  let vibratoPhase = ctx.vibratoPhase;

  for (let i = 0; i < nSamples; i++) {
    const t = i / nSamples;

    // Pitch glide across phoneme + vibrato (FM)
    const pitch   = pitchStart + (pitchEnd - pitchStart) * t;
    const vibrato = 1 + ctx.vibratoDepth * Math.sin(
      2 * Math.PI * ctx.vibratoRate * vibratoPhase / SAMPLE_RATE,
    );
    const freq = pitch * vibrato;

    // Diphthong: continuously interpolate resonator parameters
    if (endFormants) {
      r1.setParams(formants.f1 + (endFormants.f1 - formants.f1) * t,
                   formants.b1 + (endFormants.b1 - formants.b1) * t);
      r2.setParams(formants.f2 + (endFormants.f2 - formants.f2) * t,
                   formants.b2 + (endFormants.b2 - formants.b2) * t);
      r3.setParams(formants.f3 + (endFormants.f3 - formants.f3) * t,
                   formants.b3 + (endFormants.b3 - formants.b3) * t);
    }

    // Source: band-limited sawtooth (buzz) + a fraction of pure sine (warmth)
    const { sample: saw, nextPhase } = sawtoothSample(sawPhase, freq);
    const sine = Math.sin(2 * Math.PI * sawPhase); // same phase as sawtooth
    const src  = 0.78 * saw + 0.22 * sine;

    sawPhase     = nextPhase;
    vibratoPhase++;

    // Each resonator filters the SAME source — outputs are summed, not chained
    samples[i] = r1.process(src) * g1
               + r2.process(src) * g2
               + r3.process(src) * g3;
  }

  ctx.sawPhase     = sawPhase;
  ctx.vibratoPhase = vibratoPhase;

  // Normalize so every voiced phoneme enters the effects chain at the same
  // level, regardless of which formant params happened to be active.
  peakNormalize(samples);
  return samples;
}

// ---------------------------------------------------------------------------
// Noise synthesis (fricatives / stop bursts)
// ---------------------------------------------------------------------------
function synthesizeNoise(nSamples: number, freqLow: number, freqHigh: number): AudioBuffer {
  const bp = new BandpassNoise(freqLow, freqHigh);
  const samples = new Float64Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    samples[i] = bp.process(noiseSample());
  }
  return samples;
}

// ---------------------------------------------------------------------------
// Per-class synthesizers
// ---------------------------------------------------------------------------
function synthVowel(req: PhonemeSynthRequest, cl: PhonemeClass): AudioBuffer {
  const params = PHONEME_PARAMS[req.phone];
  const n = Math.round((req.durationMs / 1000) * SAMPLE_RATE);
  if (!params?.formants) return silenceBuffer(n);

  const voiced = synthesizeVoiced(
    n,
    params.formants,
    cl === 'diphthong' ? params.diphthongEnd : undefined,
    req.pitchStart,
    req.pitchEnd,
    req.ctx,
  );
  const env = buildEnvelope(n, 6, 10);
  for (let i = 0; i < n; i++) voiced[i]! *= env[i]!;
  return voiced;
}

function synthNasalOrApproximant(req: PhonemeSynthRequest): AudioBuffer {
  const params = PHONEME_PARAMS[req.phone];
  const n = Math.round((req.durationMs / 1000) * SAMPLE_RATE);
  if (!params?.formants) return silenceBuffer(n);

  const voiced = synthesizeVoiced(n, params.formants, undefined, req.pitchStart, req.pitchEnd, req.ctx);
  const env = buildEnvelope(n, 10, 10);
  for (let i = 0; i < n; i++) voiced[i]! *= env[i]!;
  return voiced;
}

function synthUnvoicedFricative(req: PhonemeSynthRequest): AudioBuffer {
  const params = PHONEME_PARAMS[req.phone];
  const n = Math.round((req.durationMs / 1000) * SAMPLE_RATE);
  if (!params?.noiseFreqLow || !params.noiseFreqHigh) return silenceBuffer(n);

  const noise = synthesizeNoise(n, params.noiseFreqLow, params.noiseFreqHigh);
  const gain  = params.noiseGain ?? 0.7;
  const env   = buildEnvelope(n, 8, 12);
  for (let i = 0; i < n; i++) noise[i]! *= env[i]! * gain;

  req.ctx.vibratoPhase += n;
  return noise;
}

function synthVoicedFricative(req: PhonemeSynthRequest): AudioBuffer {
  const params = PHONEME_PARAMS[req.phone];
  const n = Math.round((req.durationMs / 1000) * SAMPLE_RATE);
  if (!params) return silenceBuffer(n);

  const voiced = params.formants
    ? synthesizeVoiced(n, params.formants, undefined, req.pitchStart, req.pitchEnd, req.ctx)
    : silenceBuffer(n);

  const env = buildEnvelope(n, 6, 10);
  const out = new Float64Array(n);

  if (params.noiseFreqLow && params.noiseFreqHigh) {
    const noise    = synthesizeNoise(n, params.noiseFreqLow, params.noiseFreqHigh);
    const noiseGain = params.noiseGain ?? 0.5;
    for (let i = 0; i < n; i++) {
      out[i] = (voiced[i]! * 0.5 + noise[i]! * noiseGain) * env[i]!;
    }
  } else {
    for (let i = 0; i < n; i++) out[i] = voiced[i]! * env[i]!;
  }
  return out;
}

function synthStop(req: PhonemeSynthRequest): AudioBuffer {
  const params = PHONEME_PARAMS[req.phone];
  if (!params) return silenceBuffer(Math.round((req.durationMs / 1000) * SAMPLE_RATE));

  const closureSamples = Math.round(((params.closureDuration ?? 55) / 1000) * SAMPLE_RATE);
  const burstSamples   = Math.round(((params.burstDuration   ?? 12) / 1000) * SAMPLE_RATE);
  const total          = closureSamples + burstSamples;
  const out            = new Float64Array(total);

  if (params.noiseFreqLow && params.noiseFreqHigh) {
    const gain = (params.noiseGain ?? 0.8) * 0.6; // bursts quieter relative to vowels
    const bp   = new BandpassNoise(params.noiseFreqLow, params.noiseFreqHigh);
    for (let i = 0; i < burstSamples; i++) {
      const ramp = i < burstSamples * 0.35
        ? i / (burstSamples * 0.35)
        : (burstSamples - i) / (burstSamples * 0.65);
      out[closureSamples + i] = bp.process(noiseSample()) * ramp * gain;
    }
  }

  req.ctx.vibratoPhase += total;
  return out;
}

function synthAffricate(req: PhonemeSynthRequest): AudioBuffer {
  const params = PHONEME_PARAMS[req.phone];
  if (!params) return silenceBuffer(Math.round((req.durationMs / 1000) * SAMPLE_RATE));

  const closureSamples = Math.round(((params.closureDuration ?? 30) / 1000) * SAMPLE_RATE);
  const burstSamples   = Math.round(((params.burstDuration   ?? 20) / 1000) * SAMPLE_RATE);
  const fricMs         = Math.max(0, req.durationMs - (params.closureDuration ?? 30) - (params.burstDuration ?? 20));
  const fricSamples    = Math.round((fricMs / 1000) * SAMPLE_RATE);
  const total          = closureSamples + burstSamples + fricSamples;
  const out            = new Float64Array(total);

  if (params.noiseFreqLow && params.noiseFreqHigh) {
    const bp   = new BandpassNoise(params.noiseFreqLow, params.noiseFreqHigh);
    const gain = params.noiseGain ?? 0.8;
    for (let i = 0; i < burstSamples; i++) {
      out[closureSamples + i] = bp.process(noiseSample()) * (i / burstSamples) * gain;
    }
    for (let i = 0; i < fricSamples; i++) {
      const ramp = i < fricSamples * 0.1
        ? i / (fricSamples * 0.1)
        : (fricSamples - i) / fricSamples;
      out[closureSamples + burstSamples + i] = bp.process(noiseSample()) * ramp * gain;
    }
  }

  req.ctx.vibratoPhase += total;
  return out;
}

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------
export function synthesizePhoneme(req: PhonemeSynthRequest): AudioBuffer {
  const params = PHONEME_PARAMS[req.phone];
  if (!params) {
    return silenceBuffer(Math.round((req.durationMs / 1000) * SAMPLE_RATE));
  }

  switch (params.class) {
    case 'vowel':
    case 'diphthong':      return synthVowel(req, params.class);
    case 'nasal':
    case 'approximant':    return synthNasalOrApproximant(req);
    case 'unvoiced-fricative': return synthUnvoicedFricative(req);
    case 'voiced-fricative':   return synthVoicedFricative(req);
    case 'voiced-stop':
    case 'unvoiced-stop':  return synthStop(req);
    case 'affricate':      return synthAffricate(req);
    case 'silence':
      req.ctx.vibratoPhase += Math.round((req.durationMs / 1000) * SAMPLE_RATE);
      return silenceBuffer(Math.round((req.durationMs / 1000) * SAMPLE_RATE));
  }
}
