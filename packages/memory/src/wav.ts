/**
 * Il muso manda PCM nudo — int16 little-endian, mono, 16 kHz (`voiceClip.ts`)
 * — perché è quello che il riconoscitore di casa voleva. Un fornitore vuole
 * un file: qui si mette davanti l'intestazione RIFF di 44 byte, e basta.
 */
export const PCM_SAMPLE_RATE = 16_000;

export function pcm16ToWav(pcm: Uint8Array, sampleRate: number = PCM_SAMPLE_RATE): Uint8Array {
  const header = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      header.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  ascii(0, "RIFF");
  header.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  header.setUint32(16, 16, true); // dimensione del blocco fmt
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true); // byte al secondo
  header.setUint16(32, 2, true); // byte per campione
  header.setUint16(34, 16, true); // bit per campione
  ascii(36, "data");
  header.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header.buffer), 0);
  wav.set(pcm, 44);
  return wav;
}
