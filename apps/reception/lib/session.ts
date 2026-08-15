"use client";

/**
 * Dove vive il token del cliente (specchio del pannello, ADR-035): scelta
 * esplicita alla porta — «resta collegato» = localStorage su questo
 * dispositivo, altrimenti muore con la scheda. Mai in un cookie: il server
 * SSR non deve mai vedere il token, che viaggia solo verso i route handler
 * nell'header dedicato.
 */

const TOKEN_KEY = "reception_token";
const GOSINO_KEY = "reception_gosino";

export function token(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function keepToken(value: string, persist: boolean): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  (persist ? localStorage : sessionStorage).setItem(TOKEN_KEY, value);
}

export function dropToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(GOSINO_KEY);
}

/** il gosino scelto persiste: la preferenza è metà del punto (ADR-052) */
export function chosenGosino(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(GOSINO_KEY) ?? "";
}

export function chooseGosino(id: string): void {
  localStorage.setItem(GOSINO_KEY, id);
}
