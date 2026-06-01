/**
 * Audio sender — reads a WAV file, downsamples + converts to 8-bit unsigned
 * PCM at 16 kHz, then streams it over the serial port to the bridge ESP32
 * using the audio sub-protocol (magic byte 0xB5).
 *
 * Protocol sent to bridge:
 *   START  [0xB5][0x01][sampleRate: u16le][totalBytes: u32le]
 *   DATA   [0xB5][0x02][chunkLen: u16le][data: chunkLen bytes]   (repeated)
 *   END    [0xB5][0x03]
 *
 * The bridge wraps DATA payloads into 250-byte ESP-NOW packets and forwards
 * them to the robot ESP32 which plays via I2S.
 */

import { readFileSync, existsSync } from 'fs';
import type { SerialPort } from 'serialport';

const TARGET_RATE = 8000;  // Hz — must match Bresenham rate in arduino.ino
const CHUNK_SIZE = 230; // serial bytes per DATA packet (keeps packets small)

const MAGIC_AUDIO = 0xb5;
const AUDIO_START = 0x01;
const AUDIO_DATA = 0x02;
const AUDIO_END = 0x03;

// ─────────────────────────────────────────────────────────────────────
//  WAV parsing
// ─────────────────────────────────────────────────────────────────────
interface WavInfo {
  samples: Int16Array;
  sampleRate: number;
}

function parseWav(buf: Buffer): WavInfo {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Not a valid WAV file');
  }

  const sampleRate = buf.readUInt32LE(24);
  const numChannels = buf.readUInt16LE(22);
  const bitsPerSample = buf.readUInt16LE(34);

  // Scan for the data chunk (header may contain metadata chunks)
  let offset = 36;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      offset += 8;
      break;
    }
    offset += 8 + size;
  }

  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(
    (buf.length - offset) / (bytesPerSample * numChannels),
  );
  const samples = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const pos = offset + i * bytesPerSample * numChannels;
    if (bitsPerSample === 16) {
      samples[i] = buf.readInt16LE(pos);
    } else if (bitsPerSample === 8) {
      samples[i] = (buf.readUInt8(pos) - 128) << 8;
    }
  }

  return { samples, sampleRate };
}

// ─────────────────────────────────────────────────────────────────────
//  Resampling + 8-bit conversion
// ─────────────────────────────────────────────────────────────────────
function resampleTo8bit(
  samples: Int16Array,
  fromRate: number,
  toRate: number,
): Uint8Array {
  const ratio = fromRate / toRate;
  const length = Math.floor(samples.length / ratio);
  const out = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = samples[idx] ?? 0;
    const b = samples[idx + 1] ?? a;
    const val = a + (b - a) * frac;
    // 16-bit signed → 8-bit unsigned (0–255)
    out[i] = Math.max(0, Math.min(255, Math.round((val / 32768 + 1) * 127.5)));
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  Serial write helper
// ─────────────────────────────────────────────────────────────────────
function write(port: SerialPort, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    port.write(data, (err) => (err ? reject(err) : resolve()));
  });
}

// ─────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────
export async function sendAudioFile(
  port: SerialPort,
  wavPath: string,
): Promise<void> {
  if (!existsSync(wavPath)) {
    console.error(`\r[CTRL]: Audio file not found: ${wavPath}`);
    return;
  }

  const { samples, sampleRate } = parseWav(readFileSync(wavPath));
  const pcm = resampleTo8bit(samples, sampleRate, TARGET_RATE);

  const durationSec = (pcm.length / TARGET_RATE).toFixed(1);
  console.log(
    `\r[CTRL]: 🔊 Sending audio — ${durationSec}s, ${pcm.length} bytes @ ${TARGET_RATE} Hz`,
  );

  // ── AUDIO_START ──────────────────────────────────────
  const startPkt = Buffer.allocUnsafe(8);
  startPkt[0] = MAGIC_AUDIO;
  startPkt[1] = AUDIO_START;
  startPkt.writeUInt16LE(TARGET_RATE, 2);
  startPkt.writeUInt32LE(pcm.length, 4);
  await write(port, startPkt);

  // ── AUDIO_DATA chunks ────────────────────────────────
  let offset = 0;
  while (offset < pcm.length) {
    const len = Math.min(CHUNK_SIZE, pcm.length - offset);
    const pkt = Buffer.allocUnsafe(4 + len);
    pkt[0] = MAGIC_AUDIO;
    pkt[1] = AUDIO_DATA;
    pkt.writeUInt16LE(len, 2);
    Buffer.from(pcm.buffer, pcm.byteOffset + offset, len).copy(pkt, 4);
    await write(port, pkt);
    offset += len;

    // Pace at the audio playback rate so the bridge's ESP-NOW queue and the
    // robot's ring buffer never overflow. Each chunk = len/TARGET_RATE seconds.
    await new Promise((r) => setTimeout(r, Math.floor(len * 1000 / TARGET_RATE)));
  }

  // ── AUDIO_END ────────────────────────────────────────
  await write(port, Buffer.from([MAGIC_AUDIO, AUDIO_END]));
  console.log('\r[CTRL]: ✅ Audio sent');
}
