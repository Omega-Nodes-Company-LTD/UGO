/**
 * Il timer e la sveglia (ADR-078) — puri, e apposta non una chiamata al modello.
 *
 * È la funzione più usata al mondo su un assistente domestico, e qui mancava:
 * «svegliami alle 7» arrivava perfino al parser dei promemoria (ADR-028), che
 * la scartava — il verbo c'era ma la cosa da ricordare no, e un promemoria
 * senza cosa da ricordare è undefined. Quindi il gesto più ovvio che esista
 * finiva dal provider, che rispondeva con simpatia e non metteva nessuna
 * sveglia.
 *
 * Stesso binario di ADR-028/063/065/076: forma fissa, lingua fissa, risposta
 * istantanea, **zero token**, testabile per esempi. E **fallisce chiuso**: un
 * timer che parte quando non l'hai chiesto è peggio di uno che non parte, e
 * una sveglia all'ora sbagliata è peggio di nessuna sveglia.
 */

export type TimerKind = "timer" | "sveglia";

export type TimerCommand =
  | {
      action: "set";
      kind: TimerKind;
      /** secondi dall'ancora, sempre > 0 — il timer si misura in secondi, non in occasioni */
      inSeconds: number;
      /**
       * Da dove si contano quei secondi, e non è un dettaglio: un timer di
       * dieci minuti parte **adesso**, alle 20:06:40; una sveglia «alle 7»
       * suona alle 7:00:00 e non alle 7:00:40, perché l'ora è dell'orologio e
       * non del momento in cui l'hai chiesta. Contare tutto da adesso faceva
       * suonare la sveglia coi secondi di quando gliel'avevi detta.
       */
      anchor: "adesso" | "orologio";
      /** «per la pasta», o l'ora per una sveglia («7:00»). Può mancare. */
      label: string;
    }
  | { action: "cancel"; kind: TimerKind }
  | { action: "ask"; kind: TimerKind };

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Oltre un giorno non è un timer: è un appuntamento, e quello è un promemoria. */
const MAX_TIMER_SECONDS = DAY;

const WORD_NUMBERS: Readonly<Record<string, number>> = {
  un: 1,
  uno: 1,
  una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10,
  undici: 11,
  dodici: 12,
  quindici: 15,
  venti: 20,
  trenta: 30,
  quaranta: 40,
  quarantacinque: 45,
  cinquanta: 50,
  sessanta: 60,
  novanta: 90,
};

const numberFrom = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;
  const digits = Number(raw);
  if (Number.isFinite(digits)) return digits;
  return WORD_NUMBERS[raw.toLowerCase()];
};

/**
 * Le parole che dicono «questo è un promemoria, non una sveglia». Se ci sono,
 * questo parser **si tira indietro** e lascia la frase ad ADR-028: «svegliami
 * alle 7 e ricordami di chiamare la banca» è un promemoria con dentro un
 * verbo che somiglia a una sveglia, e chi ha la cosa da ricordare la gestisce
 * meglio di chi ha solo l'ora.
 */
const REMINDER_WORDS = /\b(ricordami|ricordamelo|ricordati|rammentami|avvisami|avvertimi)\b/u;

const SECONDS_PER_UNIT: Readonly<Record<string, number>> = {
  second: 1,
  sec: 1,
  minut: MINUTE,
  min: MINUTE,
  or: HOUR,
};

const unitSeconds = (unit: string): number | undefined => {
  for (const [prefix, seconds] of Object.entries(SECONDS_PER_UNIT)) {
    if (unit.startsWith(prefix)) return seconds;
  }
  return undefined;
};

/** «per la pasta», «per il tè». Quello che c'è dopo il tempo, se c'è. */
function labelFrom(text: string): string {
  const match = /\bper\s+(?:la|il|lo|le|gli|i|l')?\s*([\p{L}\d][\p{L}\d\s'’-]{0,38})$/u.exec(
    text.trim(),
  );
  return (match?.[1] ?? "").trim().replace(/\s+/gu, " ");
}

/** «7:05» dai due numeri, che è come lo direbbe una persona guardando l'ora. */
export function hourLabel(hour: number, minute: number): string {
  return `${String(hour)}:${minute < 10 ? "0" : ""}${String(minute)}`;
}

/**
 * @param nowHour   0..23 nel fuso della casa
 * @param nowMinute 0..59
 */
export function parseTimerCommand(
  text: string,
  nowHour: number,
  nowMinute: number,
): TimerCommand | undefined {
  const lower = text.toLowerCase().trim();
  const saysTimer = /\btimer\b/u.test(lower);
  const saysAlarm = /\bsvegli(a|ami|armi)\b/u.test(lower);
  if (!saysTimer && !saysAlarm) return undefined;
  // il promemoria vince: ha la cosa da ricordare, e noi solo l'ora
  if (REMINDER_WORDS.test(lower)) return undefined;
  const kind: TimerKind = saysTimer ? "timer" : "sveglia";

  // ── spegnere ─────────────────────────────────────────────────────────
  if (/\b(spegni|ferma|annulla|cancella|togli|leva|disattiva)\b/u.test(lower)) {
    return { action: "cancel", kind };
  }

  // ── chiedere ─────────────────────────────────────────────────────────
  // «quanto manca al timer?», «a che ora è la sveglia?», «c'è un timer?».
  // Il punto di domanda da solo non basta: «timer?» non è una domanda su
  // niente, e indovinare qui vorrebbe dire indovinare su una frase qualunque
  if (/\b(quanto manca|a che ora|quando|c'è|ce n'è|hai messo|è attiv)/u.test(lower)) {
    return { action: "ask", kind };
  }

  /**
   * Mettere un timer è un ORDINE, e va detto come tale. Senza questa guardia
   * «il timer del forno suona ogni dieci minuti» faceva partire un timer di
   * dieci minuti: la frase contiene tutto quello che serve, tranne la volontà.
   * O c'è un verbo che comanda, o la frase comincia con la cosa stessa.
   */
  const orders =
    /\b(metti|mettimi|imposta|impostami|fai|fammi|avvia|attiva|punta|puntami|carica|svegliami|svegliarmi)\b/u.test(
      lower,
    ) || /^(timer|sveglia)\b/u.test(lower);
  if (!orders) return undefined;

  // ── «fra mezz'ora» ───────────────────────────────────────────────────
  if (/\bmezz'?\s*ora\b/u.test(lower)) {
    return { action: "set", kind, inSeconds: 30 * MINUTE, anchor: "adesso", label: labelFrom(lower) };
  }

  // ── «timer di 10 minuti» · «timer 90 secondi» · «svegliami fra due ore» ─
  const relative = /\b([\p{L}\d]+)\s*['’]?\s*(second[oi]|sec|minut[oi]|min|or[ae])\b/u.exec(lower);
  if (relative !== null) {
    const amount = numberFrom(relative[1]);
    const seconds = unitSeconds(relative[2] ?? "");
    if (amount === undefined || seconds === undefined || amount <= 0) return undefined;
    const inSeconds = Math.round(amount * seconds);
    if (inSeconds > MAX_TIMER_SECONDS) return undefined;
    return {
      action: "set",
      kind,
      inSeconds,
      anchor: "adesso",
      label: labelFrom(lower.slice(relative.index)),
    };
  }

  // ── «sveglia alle 7» · «metti la sveglia domani alle 6:30» ────────────
  const absolute = /\b(?:all[ae]|per\s+le)\s+(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\b/u.exec(lower);
  if (absolute !== null) {
    const hour = numberFrom(absolute[1]);
    let minute = absolute[2] === undefined ? 0 : Number(absolute[2]);
    /**
     * «alle 7 e mezza» è come si dice l'ora in italiano, e leggerla come le
     * 7:00 sarebbe una sveglia di mezz'ora sbagliata — cioè peggio di nessuna
     * sveglia. Il resto della frase dopo l'ora si legge, non si ignora.
     */
    const after = lower.slice(absolute.index + absolute[0].length);
    if (/^\s*e\s+mezz[ao]\b/u.test(after)) minute += 30;
    else if (/^\s*e\s+un\s+quarto\b/u.test(after)) minute += 15;
    else if (/^\s*meno\s+un\s+quarto\b/u.test(after)) minute -= 15;
    if (hour === undefined || hour > 23 || minute > 59 || minute < -15) return undefined;
    let deltaMinutes = (hour - nowHour) * 60 + (minute - nowMinute);
    // un'ora già passata vuol dire domani, che è quello che intende una persona
    if (deltaMinutes <= 0 || /\bdomani\b/u.test(lower)) deltaMinutes += 24 * 60;
    if (/\bdomani\b/u.test(lower) && deltaMinutes > 2 * 24 * 60) deltaMinutes -= 24 * 60;
    return {
      action: "set",
      kind,
      inSeconds: deltaMinutes * MINUTE,
      anchor: "orologio",
      label: hourLabel(hour + (minute < 0 ? -1 : 0), (minute + 60) % 60),
    };
  }

  // ha nominato il timer, ma non ha detto quando: non si indovina
  return undefined;
}

/** Quanto manca, detto come lo direbbe una persona. */
export function humanDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${String(rounded)} second${rounded === 1 ? "o" : "i"}`;
  const minutes = Math.round(rounded / MINUTE);
  if (minutes < 60) return `${String(minutes)} minut${minutes === 1 ? "o" : "i"}`;
  const hours = Math.round(minutes / 60);
  return `${String(hours)} or${hours === 1 ? "a" : "e"}`;
}

/** Cosa risponde quando lo metti. Zero token: le parole sono nostre. */
export function confirmTimer(command: Extract<TimerCommand, { action: "set" }>): string {
  if (command.kind === "sveglia") {
    return command.label === ""
      ? `Sveglia fra ${humanDuration(command.inSeconds)}. Ci penso io.`
      : `Sveglia alle ${command.label}. Ci penso io.`;
  }
  const forWhat = command.label === "" ? "" : ` per ${command.label}`;
  return `Timer di ${humanDuration(command.inSeconds)}${forWhat}: parte adesso.`;
}

/** Cosa risponde a «quanto manca?». `undefined` = non ce n'è nessuno. */
export function answerTimer(kind: TimerKind, secondsLeft: number | undefined, label = ""): string {
  if (secondsLeft === undefined) {
    return kind === "sveglia" ? "Non c'è nessuna sveglia." : "Non c'è nessun timer.";
  }
  if (kind === "sveglia") {
    return label === ""
      ? `La sveglia suona fra ${humanDuration(secondsLeft)}.`
      : `La sveglia è alle ${label}: mancano ${humanDuration(secondsLeft)}.`;
  }
  const forWhat = label === "" ? "" : ` (${label})`;
  return `Al timer${forWhat} mancano ${humanDuration(secondsLeft)}.`;
}

/** Cosa risponde quando lo spegni. */
export function confirmCancel(kind: TimerKind, had: boolean): string {
  if (!had) return kind === "sveglia" ? "Non c'era nessuna sveglia." : "Non c'era nessun timer.";
  return kind === "sveglia" ? "Sveglia tolta." : "Timer spento.";
}

/**
 * Cosa dice quando suona. Non è «ehi, mi avevi detto di ricordarti»: un timer
 * che finisce e una sveglia che suona sono due suoni diversi, e questo è ciò
 * che li rende utili invece che educati.
 */
export function voiceTimer(kind: TimerKind, label: string): string {
  if (kind === "sveglia") {
    return label === "" ? "Sveglia! È ora." : `Sveglia! Sono le ${label}.`;
  }
  return label === "" ? "Driiin! Il timer è finito." : `Driiin! Il timer è finito: ${label}.`;
}
