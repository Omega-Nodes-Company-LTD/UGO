/**
 * I link universali dell'app iOS (ADR-127, ADR-130): `/pair/<codice>` e
 * `/login/<segreto>` aprono l'app invece di Safari, e l'app li gira qui. Il
 * muso vive sulla stessa origine del soul, quindi basta portare la vista a
 * quell'indirizzo: per il login è il soul stesso a mettere il cookie e
 * tornare al muso, per l'abbinamento il muso precompila il codice.
 *
 * Puro: decide solo DOVE andare. Un link di un altro dominio, o un percorso
 * che non è uno dei due, non porta da nessuna parte.
 */
export function deepLinkTarget(link: string, origin: string): string | undefined {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return undefined;
  }
  if (url.origin !== origin) return undefined;
  const [kind, value, ...rest] = url.pathname.split("/").filter((part) => part !== "");
  if (value === undefined || rest.length > 0) return undefined;
  // il percorso arriva già codificato: si decodifica una volta sola, poi si
  // ricodifica, così un `&` nel valore non diventa un parametro in più
  let raw: string;
  try {
    raw = decodeURIComponent(value);
  } catch {
    return undefined;
  }
  if (kind === "login") return `${origin}/login/${encodeURIComponent(raw)}`;
  if (kind === "pair") return `${origin}/?pair=${encodeURIComponent(raw)}`;
  return undefined;
}
