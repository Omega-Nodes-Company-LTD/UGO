import { describe, expect, it } from "vitest";
import { INVITE_TTL_MS, MAX_AUDIO_B64, VoiceInvite } from "./voiceInvite.js";

/**
 * L'invito «fatti sentire la voce» (ADR-057, la seconda metà).
 *
 * Qui si prova la parte che un test in Node può provare: chi è invitato, per
 * quanto, e cosa diventa un clip. Il microfono e il bottone sono browser e si
 * provano col banco — dirlo è più onesto che fingere copertura.
 */

const CLIP = new Uint8Array([1, 2, 3, 4]);

describe("l'invito a farsi sentire la voce", () => {
  it("un clip dentro la finestra diventa un frame voice_sample in base64", () => {
    let now = 1_000;
    const invite = new VoiceInvite(() => now);
    invite.open("being-1", "Marco");
    now += INVITE_TTL_MS - 1;
    const made = invite.frameFor(CLIP);
    if ("error" in made) throw new Error(made.error);
    expect(made.frame.type).toBe("voice_sample");
    expect(made.frame.beingId).toBe("being-1");
    expect(Uint8Array.from(atob(made.frame.audio), (c) => c.codePointAt(0) ?? 0)).toEqual(CLIP);
  });

  it("scaduto il TTL l'invito non c'è più, e il clip non parte", () => {
    let now = 0;
    const invite = new VoiceInvite(() => now);
    invite.open("being-1", "Marco");
    now = INVITE_TTL_MS + 1;
    expect(invite.current()).toBeUndefined();
    const made = invite.frameFor(CLIP);
    expect("error" in made && made.error).toContain("scaduto");
  });

  it("un campione basta: il secondo clip trova l'invito già consumato", () => {
    const invite = new VoiceInvite(() => 0);
    invite.open("being-1", "Marco");
    expect("frame" in invite.frameFor(CLIP)).toBe(true);
    expect("error" in invite.frameFor(CLIP)).toBe(true);
  });

  it("un invito nuovo scalza il vecchio: l'ultimo arrivato vince", () => {
    const invite = new VoiceInvite(() => 0);
    invite.open("being-1", "Marco");
    invite.open("being-2", "Anna");
    const made = invite.frameFor(CLIP);
    if ("error" in made) throw new Error(made.error);
    expect(made.frame.beingId).toBe("being-2");
  });

  it("clip vuoto e clip oltre il tetto del contratto si fermano qui, non sul server", () => {
    const invite = new VoiceInvite(() => 0);
    invite.open("being-1", "Marco");
    expect("error" in invite.frameFor(new Uint8Array(0))).toBe(true);
    // il rifiuto non consuma l'invito: si può riprovare
    const huge = new Uint8Array(Math.ceil((MAX_AUDIO_B64 / 4) * 3) + 8);
    expect("error" in invite.frameFor(huge)).toBe(true);
    expect("frame" in invite.frameFor(CLIP)).toBe(true);
  });
});
