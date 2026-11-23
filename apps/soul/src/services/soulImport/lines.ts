import { StringDecoder } from "node:string_decoder";

/**
 * Rows out of a table's bytes. An archive table is NDJSON — one JSON object
 * per line, every line ending in `\n` — but the bytes arrive in arbitrary
 * pieces (frames of up to a mebibyte, never aligned to lines), and a piece may
 * end in the middle of a multi-byte character. `StringDecoder` holds the
 * partial character; nothing here assumes a piece is a whole line.
 *
 * Errors carry the line number and never the line: a row is somebody's data.
 */
const MAX_LINE_CHARS = 8 * 1024 * 1024;

export async function* jsonLines(source: AsyncIterable<Buffer>): AsyncGenerator<Record<string, unknown>> {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let line = 0;

  const parse = (text: string): Record<string, unknown> => {
    line += 1;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`line ${String(line)} is not valid JSON`);
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`line ${String(line)} is not an object`);
    }
    return value as Record<string, unknown>;
  };

  for await (const piece of source) {
    pending += decoder.write(piece);
    let start = 0;
    for (let end = pending.indexOf("\n", start); end !== -1; end = pending.indexOf("\n", start)) {
      yield parse(pending.slice(start, end));
      start = end + 1;
    }
    pending = pending.slice(start);
    if (pending.length > MAX_LINE_CHARS) throw new Error("a line is too long");
  }
  pending += decoder.end();
  if (pending !== "") throw new Error("the last line has no end");
}
