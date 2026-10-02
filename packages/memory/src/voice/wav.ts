/**
 * PCM16 mono → WAV. Il muso manda campioni grezzi a 16 kHz (lo stesso formato
 * di `heard_text`); i provider vogliono un file. Quarantaquattro byte di
 * intestazione e niente dipendenze.
 */
export function pcm16ToWav(pcm: Buffer, sampleRate = 16_000): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // dimensione del blocco fmt
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte al secondo
  header.writeUInt16LE(2, 32); // byte per campione
  header.writeUInt16LE(16, 34); // bit per campione
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Secondi di parlato in un WAV PCM16 mono: serve a stimarne il costo. */
export function wavSeconds(wav: Buffer): number {
  if (wav.length <= 44) return 0;
  const rate = wav.readUInt32LE(24);
  return rate === 0 ? 0 : (wav.length - 44) / (rate * 2);
}
