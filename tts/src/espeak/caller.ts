import { execFileSync } from 'child_process';
import { SAMPLE_RATE } from '../synthesis/types.js';

export interface ESpeakOptions {
  voice:     string;
  pitch:     number; // 0-99, default 50
  speed:     number; // words per minute, default 175
  wordGap:   number; // units of 10 ms between words
  amplitude: number; // 0-200, default 100
  ssml?:     boolean; // pass -m flag to treat input as SSML
}

function parseWav(buf: Buffer): { samples: Float64Array; sampleRate: number } {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('espeak-ng did not return valid WAV data');
  }

  const sampleRate     = buf.readUInt32LE(24);
  const numChannels    = buf.readUInt16LE(22);
  const bitsPerSample  = buf.readUInt16LE(34);
  const bytesPerSample = bitsPerSample / 8;

  // Scan for the 'data' chunk — header may contain extra chunks
  let offset = 36;
  while (offset + 8 <= buf.length) {
    const tag  = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (tag === 'data') { offset += 8; break; }
    offset += 8 + size;
  }

  const numSamples = Math.floor((buf.length - offset) / (bytesPerSample * numChannels));
  const samples    = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const pos  = offset + i * bytesPerSample * numChannels;
    samples[i] = bitsPerSample === 16
      ? buf.readInt16LE(pos) / 32768.0
      : (buf.readUInt8(pos) - 128) / 128.0;
  }

  return { samples, sampleRate };
}

/** Linear interpolation resample — adequate quality for speech. */
function resample(input: Float64Array, fromRate: number, toRate: number): Float64Array {
  if (fromRate === toRate) return input;
  const ratio  = fromRate / toRate;
  const length = Math.round(input.length * toRate / fromRate);
  const out    = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const pos  = i * ratio;
    const idx  = Math.floor(pos);
    const frac = pos - idx;
    const a    = idx     < input.length ? input[idx]!     : 0;
    const b    = idx + 1 < input.length ? input[idx + 1]! : 0;
    out[i]     = a + (b - a) * frac;
  }
  return out;
}

/**
 * Synthesize text via espeak-ng and return a Float64 audio buffer at
 * SAMPLE_RATE (44100 Hz).  eSpeak outputs at 22050 Hz; we upsample.
 */
export function speakToAudio(text: string, opts: ESpeakOptions): Float64Array {
  let buf: Buffer;
  try {
    const args = [
      '--stdout',
      '-v', opts.voice,
      '-p', String(opts.pitch),
      '-s', String(opts.speed),
      '-g', String(opts.wordGap),
      '-a', String(opts.amplitude),
    ];
    if (opts.ssml) args.push('-m');
    args.push(text);

    buf = execFileSync('espeak-ng', args);
  } catch (err) {
    throw new Error(
      `espeak-ng failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const { samples, sampleRate } = parseWav(buf);
  return resample(samples, sampleRate, SAMPLE_RATE);
}
