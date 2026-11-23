import { ArchiveError } from "./errors.js";

/**
 * Exact-length reads over a stream that arrives in arbitrary pieces (a file
 * stream, a socket, one byte at a time in the tests). Running dry before the
 * requested length is always `truncated`, never a short read.
 */
export class ByteReader {
  private readonly iterator: AsyncIterator<Uint8Array>;
  private buffer: Buffer = Buffer.alloc(0);
  private ended = false;

  public constructor(source: AsyncIterable<Uint8Array>) {
    this.iterator = source[Symbol.asyncIterator]();
  }

  private async fill(wanted: number): Promise<void> {
    while (this.buffer.length < wanted && !this.ended) {
      const next = await this.iterator.next();
      if (next.done === true) this.ended = true;
      else if (next.value.length > 0) this.buffer = Buffer.concat([this.buffer, next.value]);
    }
  }

  public async read(length: number): Promise<Buffer> {
    await this.fill(length);
    if (this.buffer.length < length) {
      throw new ArchiveError("truncated", "the archive ends before it should");
    }
    const out = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return out;
  }

  /** True when nothing more will arrive. May wait for the source to say so. */
  public async isDone(): Promise<boolean> {
    await this.fill(1);
    return this.buffer.length === 0;
  }
}
