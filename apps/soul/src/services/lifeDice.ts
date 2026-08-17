import { randomInt } from "node:crypto";
import { JITTER_MAX_DAYS } from "@ugo/psyche";

/**
 * Il dado dell'esemplare (ADR-077), estratto una volta sola: alla nascita — da
 * qualunque delle porte da cui si nasce — o il giorno in cui un capostipite
 * accetta la mortalità.
 *
 * Sta in un modulo suo perché lo chiamano quattro posti che non si conoscono
 * fra loro (la cucciolata, la nascita a mano, la casa nuova, la dote adottata),
 * e farlo vivere dentro uno di quelli avrebbe legato gli altri tre a lui.
 *
 * `randomInt` di `node:crypto` e **non** il seme della cucciolata: quel seme
 * sta nell'anteprima e il proprietario lo legge — un dado che si ricalcola non
 * è un dado. Estremi inclusi: zero è un esito legittimo, ed è la vita più
 * corta che esista, cioè la garanzia secca.
 */
export function drawLifeJitter(): number {
  return randomInt(0, JITTER_MAX_DAYS + 1);
}
