import { describe, expect, it } from "vitest";
import {
  answerTimer,
  confirmCancel,
  confirmTimer,
  humanDuration,
  parseTimerCommand,
  voiceTimer,
} from "./timers.js";

/**
 * ADR-078. Puro, quindi testato per esempi: le frasi vere che una persona dice
 * in cucina, e quelle che NON deve raccogliere.
 */

/** Sono le 20:00 in casa, salvo quando serve un'ora diversa. */
const at8pm = (text: string) => parseTimerCommand(text, 20, 0);

describe("il timer", () => {
  it("le forme che dice chiunque", () => {
    for (const phrase of [
      "metti un timer di 10 minuti",
      "timer di 10 minuti",
      "timer 10 minuti",
      "fai un timer di dieci minuti",
      "imposta un timer di 10 min",
    ]) {
      expect(at8pm(phrase), phrase).toEqual({
        action: "set",
        kind: "timer",
        inSeconds: 600,
        anchor: "adesso",
        label: "",
      });
    }
  });

  it("i secondi esistono: un timer da cucina non si misura in occasioni", () => {
    expect(at8pm("metti un timer di 90 secondi")).toMatchObject({ inSeconds: 90 });
    expect(at8pm("timer di mezz'ora")).toMatchObject({ inSeconds: 1800 });
    expect(at8pm("metti un timer di un'ora")).toMatchObject({ inSeconds: 3600 });
  });

  it("si porta dietro per cosa è", () => {
    expect(at8pm("metti un timer di 8 minuti per la pasta")).toEqual({
      action: "set",
      kind: "timer",
      inSeconds: 480,
      anchor: "adesso",
      label: "pasta",
    });
  });

  it("oltre un giorno non è un timer: è un appuntamento", () => {
    expect(at8pm("metti un timer di 40 ore")).toBeUndefined();
  });
});

describe("la sveglia", () => {
  it("«svegliami alle 7» — la frase che prima finiva dal provider", () => {
    // ADR-028 la scartava: il verbo c'era, la cosa da ricordare no
    expect(at8pm("svegliami alle 7")).toEqual({
      action: "set",
      kind: "sveglia",
      inSeconds: 11 * 3600,
      // l'ora si legge sull'orologio, non si conta dall'istante della domanda
      anchor: "orologio",
      label: "7:00",
    });
  });

  it("le altre forme, e i minuti scritti come si parla", () => {
    expect(at8pm("metti la sveglia alle 6:30")).toMatchObject({
      kind: "sveglia",
      label: "6:30",
    });
    expect(at8pm("sveglia alle 7 e mezza")).toMatchObject({ label: "7:30" });
    expect(at8pm("sveglia alle 7 e un quarto")).toMatchObject({ label: "7:15" });
    expect(at8pm("sveglia alle 8 meno un quarto")).toMatchObject({ label: "7:45" });
  });

  it("«alle sette» — l'ora si dice anche a lettere, e prima cadeva", () => {
    // arriva dall'orologio condiviso con il check-in (ADR-085): finché ogni
    // parser aveva il suo, questa frase perfettamente italiana finiva dal
    // provider, che rispondeva con simpatia e non metteva nessuna sveglia
    expect(at8pm("svegliami alle sette")).toMatchObject({ inSeconds: 11 * 3600, label: "7:00" });
  });

  it("«alle nove di sera» sono le 21, non le 9", () => {
    expect(parseTimerCommand("svegliami alle nove di sera", 8, 0)).toMatchObject({
      label: "21:00",
      inSeconds: 13 * 3600,
    });
  });

  it("un'ora già passata vuol dire domani, che è quello che intende una persona", () => {
    // sono le 20, «alle 7» non può essere fra undici ore fa
    const alarm = at8pm("svegliami alle 7");
    expect(alarm).toMatchObject({ inSeconds: 11 * 3600 });
    // e alle 21 di stasera è stasera
    expect(parseTimerCommand("svegliami alle 21", 20, 0)).toMatchObject({ inSeconds: 3600 });
  });

  it("anche a tempo, se è così che l'hai detto", () => {
    expect(at8pm("svegliami fra due ore")).toEqual({
      action: "set",
      kind: "sveglia",
      inSeconds: 7200,
      anchor: "adesso",
      label: "",
    });
  });
});

describe("spegnere e chiedere", () => {
  it("spegnere", () => {
    expect(at8pm("spegni il timer")).toEqual({ action: "cancel", kind: "timer" });
    expect(at8pm("togli la sveglia")).toEqual({ action: "cancel", kind: "sveglia" });
    expect(at8pm("ferma il timer")).toEqual({ action: "cancel", kind: "timer" });
  });

  it("chiedere", () => {
    expect(at8pm("quanto manca al timer?")).toEqual({ action: "ask", kind: "timer" });
    expect(at8pm("a che ora è la sveglia?")).toEqual({ action: "ask", kind: "sveglia" });
    expect(at8pm("c'è un timer attivo?")).toEqual({ action: "ask", kind: "timer" });
  });
});

describe("fallisce chiuso, che è il punto", () => {
  it("una frase che NOMINA il timer non è un ordine di metterlo", () => {
    // la trappola vera: c'è tutto — la parola e una durata — tranne la volontà
    expect(at8pm("il timer del forno suona ogni dieci minuti")).toBeUndefined();
    expect(at8pm("ho comprato un timer nuovo")).toBeUndefined();
  });

  it("nominare il timer senza dire quando non si indovina", () => {
    expect(at8pm("metti un timer")).toBeUndefined();
    expect(at8pm("metti la sveglia")).toBeUndefined();
  });

  it("una frase normale non lo sfiora nemmeno", () => {
    for (const phrase of ["come stai?", "che ore sono?", "fra dieci minuti esco", "buongiorno"]) {
      expect(at8pm(phrase), phrase).toBeUndefined();
    }
  });

  it("un promemoria resta un promemoria: chi ha la cosa da ricordare vince", () => {
    // «svegliami» c'è, ma qui la parte che conta è quella che ADR-028 sa fare
    expect(at8pm("svegliami alle 7 e ricordami di chiamare la banca")).toBeUndefined();
  });

  it("un'ora che non esiste non diventa un'ora qualunque", () => {
    expect(at8pm("sveglia alle 27")).toBeUndefined();
    expect(at8pm("sveglia alle 7:90")).toBeUndefined();
  });
});

describe("le parole che dice", () => {
  it("le durate si dicono come le direbbe una persona", () => {
    expect(humanDuration(45)).toBe("45 secondi");
    expect(humanDuration(1)).toBe("1 secondo");
    expect(humanDuration(600)).toBe("10 minuti");
    expect(humanDuration(3600)).toBe("1 ora");
    expect(humanDuration(7200)).toBe("2 ore");
  });

  it("conferma, risposta e suoneria non si somigliano", () => {
    expect(
      confirmTimer({ action: "set", kind: "timer", inSeconds: 600, anchor: "adesso", label: "pasta" }),
    ).toBe(
      "Timer di 10 minuti per pasta: parte adesso.",
    );
    expect(
      confirmTimer({
        action: "set",
        kind: "sveglia",
        inSeconds: 3600,
        anchor: "orologio",
        label: "7:00",
      }),
    ).toBe(
      "Sveglia alle 7:00. Ci penso io.",
    );
    expect(answerTimer("timer", 120)).toBe("Al timer mancano 2 minuti.");
    expect(answerTimer("timer", undefined)).toBe("Non c'è nessun timer.");
    expect(answerTimer("sveglia", 3600, "7:00")).toContain("alle 7:00");
    expect(confirmCancel("timer", true)).toBe("Timer spento.");
    expect(confirmCancel("sveglia", false)).toBe("Non c'era nessuna sveglia.");
  });

  it("quando suona non dice «mi avevi detto di ricordarti»", () => {
    // un timer che finisce e una sveglia che suona sono due suoni diversi
    expect(voiceTimer("timer", "")).toContain("Driiin");
    expect(voiceTimer("timer", "pasta")).toContain("pasta");
    expect(voiceTimer("sveglia", "7:00")).toBe("Sveglia! Sono le 7:00.");
  });
});
