/**
 * Che ore sono **in casa** — non sul server.
 *
 * Stava dentro la chat, dove è nato con i promemoria (ADR-028), e da lì non
 * poteva servire a nient'altro: il check-in (ADR-085) deve sapere se sono le
 * nove di sera per la casa, e la casa può stare in un fuso diverso da quello
 * del processo. Il giorno della settimana serve solo a lui, ma sta qui perché
 * è la stessa domanda: che giorno e che ora è, lì dove vive.
 *
 * Non lancia mai. Un fuso scritto male, o una build di ICU senza l'italiano,
 * non deve poter zittire una risposta: si perde la data, non la voce.
 */

export interface HouseTime {
  /** 0..23 */
  hour: number;
  /** 0..59 */
  minute: number;
  /** `YYYY-MM-DD` nel fuso della casa, come lo scrive il sogno */
  date: string;
  /** 0 = domenica … 6 = sabato */
  weekday: number;
  /** «lunedì 18 agosto, ore 21:00» */
  text: string;
}

const DEFAULT_TZ = "Europe/Rome";
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function houseClock(at: Date, timezone?: string, locale?: string): HouseTime {
  const tz = timezone ?? DEFAULT_TZ;
  try {
    const parts = new Intl.DateTimeFormat(locale ?? "it-IT", {
      timeZone: tz,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) throw new Error("unusable clock");
    return {
      // certe build di ICU rendono la mezzanotte come «24»: il resto del
      // sistema si aspetta 0..23, e un'ora fuori scala rompe in silenzio le
      // ore di quiete
      hour: hour % 24,
      minute,
      date: new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(at),
      weekday: weekdayIn(at, tz),
      text: `${get("weekday")} ${get("day")} ${get("month")}, ore ${get("hour")}:${get("minute")}`,
    };
  } catch {
    return {
      hour: at.getHours(),
      minute: at.getMinutes(),
      date: at.toISOString().slice(0, 10),
      weekday: at.getDay(),
      text: at.toISOString().slice(11, 16),
    };
  }
}

function weekdayIn(at: Date, tz: string): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(at);
  const found = EN_DAYS.indexOf(short as (typeof EN_DAYS)[number]);
  return found === -1 ? at.getDay() : found;
}
