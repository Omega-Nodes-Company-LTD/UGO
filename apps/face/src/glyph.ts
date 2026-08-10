import type { GlyphPattern } from "@ugo/shared/face";

/**
 * Glyph LEDs (§4.1, ADR-003: expressiveness is software only).
 *
 * The Glyph Developer Kit may not support the 3a Pro. Rather than gate the
 * feature on a device we cannot test here, the driver is written against the
 * documented global and **degrades without errors** when it is absent — the
 * on-screen mirror keeps the pattern visible either way, which is also what
 * makes it testable in a browser.
 */

interface GlyphSdkLike {
  play: (pattern: string) => void;
  stop?: () => void;
}

export class GlyphDriver {
  private current: GlyphPattern | undefined;

  public constructor(private readonly mirror?: HTMLElement) {}

  private sdk(): GlyphSdkLike | undefined {
    return (globalThis as { NothingGlyph?: GlyphSdkLike }).NothingGlyph;
  }

  public available(): boolean {
    return this.sdk() !== undefined;
  }

  public play(pattern: GlyphPattern): void {
    this.current = pattern;
    if (this.mirror !== undefined) {
      this.mirror.dataset.glyph = pattern;
    }
    try {
      this.sdk()?.play(pattern);
    } catch {
      // a Glyph failure must never disturb the face
    }
  }

  public currentPattern(): GlyphPattern | undefined {
    return this.current;
  }
}
