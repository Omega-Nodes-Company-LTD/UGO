/**
 * La chiave di questo dispositivo (ADR-127): come il muso entra in una casa
 * che sta sul web.
 *
 * Tre fonti, in quest'ordine: `?token=` nell'indirizzo (il chiosco di sempre,
 * configurato a mano), la chiave salvata dopo l'abbinamento, e — sul web — il
 * cookie della sessione via email, che il browser manda da solo e che qui non
 * si vede (è HttpOnly apposta).
 */

export const DEVICE_KEY_STORE = "ugo.deviceKey";

export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function currentKey(params: URLSearchParams, store: KeyStore): string | undefined {
  const fromUrl = params.get("token");
  if (fromUrl !== null && fromUrl !== "") return fromUrl;
  try {
    const stored = store.getItem(DEVICE_KEY_STORE);
    return stored === null || stored === "" ? undefined : stored;
  } catch {
    return undefined;
  }
}

/** Il socket non può portare header: la chiave viaggia in query, e soul non la scrive nel log. */
export function socketUrlWithKey(socketUrl: string, key: string | undefined): string {
  if (key === undefined) return socketUrl;
  return `${socketUrl}${socketUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(key)}`;
}

/** Solo le richieste verso QUESTO soul portano la chiave: mai un upload firmato verso S3. */
export function isSoulRequest(url: string, soulHttp: string): boolean {
  return url === soulHttp || url.startsWith(`${soulHttp}/`);
}

/** Il nome con cui il dispositivo si presenta, per riconoscerlo fra le chiavi del pannello. */
export function defaultDeviceLabel(userAgent: string): string {
  if (userAgent.includes("iPhone")) return "iPhone";
  if (userAgent.includes("iPad")) return "iPad";
  if (userAgent.includes("Android")) return "Android";
  if (userAgent.includes("Macintosh")) return "Mac";
  if (userAgent.includes("Windows")) return "PC";
  return "browser";
}

/**
 * Avvolge `fetch`: aggiunge la chiave alle chiamate verso soul (senza
 * scavalcare un header già messo, come fa la pagina «I miei dati») e, al primo
 * 401, avvisa chi deve mostrare la schermata di abbinamento.
 */
export function installSoulKey(options: {
  soulHttp: string;
  key: () => string | undefined;
  onUnauthorized: () => void;
  target?: { fetch: typeof fetch };
}): void {
  const target = options.target ?? globalThis;
  const original = target.fetch.bind(target);
  target.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isSoulRequest(url, options.soulHttp)) return original(input, init);
    const headers = new Headers(init?.headers);
    const key = options.key();
    if (key !== undefined && !headers.has("authorization")) headers.set("authorization", `Bearer ${key}`);
    const response = await original(input, { ...init, headers });
    if (response.status === 401) options.onUnauthorized();
    return response;
  };
}
