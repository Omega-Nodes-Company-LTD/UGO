import type { Metadata, Viewport } from "next";
import { Nav } from "../components/nav";
import "./globals.css";

/**
 * Il guscio della suite (ADR-051). SSR solo per la struttura: tutto ciò che è
 * personale viaggia client-side dopo la porta, col token del cliente
 * nell'header dedicato — mai in un cookie che il server SSR potrebbe leggere.
 */

export const metadata: Metadata = {
  title: "La reception di UGO",
  description: "Parla col tuo gosino: domande sul lavoro, richieste, stato dei progetti.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="it">
      <body>
        <main>{children}</main>
        <Nav />
      </body>
    </html>
  );
}
