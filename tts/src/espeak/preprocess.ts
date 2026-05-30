/**
 * Transform plain text into SSML for eSpeak-ng (-m flag).
 *
 * Standalone letters E and A get wrapped in <prosody> tags that slow their
 * rate and raise pitch — Wall-E's signature drawn-out "Eeeee" and "Aaaaa".
 *
 * "Standalone" means not immediately preceded or followed by another letter,
 * so it fires on "Wall-E", "E!", "A?" but not on "Eva", "the", "make", etc.
 */

const E_RATE  = '22%';   // fraction of base speech rate for standalone E
const E_PITCH = '+20%';  // pitch lift on E
const A_RATE  = '28%';   // A drags slightly less than E
const A_PITCH = '+14%';  // A rises slightly less than E

function escapeXML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toSSML(text: string): string {
  // Split on standalone E/e or A/a — capture group keeps the delimiter
  const parts = text.split(/(?<![A-Za-z])([EeAa])(?![A-Za-z])/);

  let body = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Normal text segment — escape XML special chars
      body += escapeXML(parts[i] ?? '');
    } else {
      // Standalone E or A — wrap with slow/rising prosody
      const letter = parts[i]!;
      const isE    = letter === 'E' || letter === 'e';
      const rate   = isE ? E_RATE  : A_RATE;
      const pitch  = isE ? E_PITCH : A_PITCH;
      body += `<prosody rate="${rate}" pitch="${pitch}">${letter}</prosody>`;
    }
  }

  return `<speak>${body}</speak>`;
}

/** Returns true if toSSML will insert any prosody tags. */
export function hasStandaloneE(text: string): boolean {
  return /(?<![A-Za-z])[EeAa](?![A-Za-z])/.test(text);
}
