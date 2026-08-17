"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Le stanze della suite: la voce prima, il resto a portata di pollice. */
const ROOMS = [
  { href: "/parla", label: "Parla" },
  { href: "/lavori", label: "I lavori" },
  { href: "/ticket", label: "I ticket" },
  { href: "/conversazioni", label: "Le conversazioni" },
  { href: "/branco", label: "Il branco" },
  { href: "/impostazioni", label: "Impostazioni" },
] as const;

export function Nav(): React.JSX.Element | null {
  const pathname = usePathname();
  if (pathname === "/") return null; // alla porta non c'è ancora una casa
  // il benvenuto sta PRIMA della casa: niente scorciatoie finché non è letto
  if (pathname === "/benvenuto") return null;
  return (
    <nav className="nav" aria-label="Le stanze">
      {ROOMS.map((room) => (
        <Link
          key={room.href}
          href={room.href}
          aria-current={pathname.startsWith(room.href) ? "page" : undefined}
        >
          {room.label}
        </Link>
      ))}
    </nav>
  );
}
