"use client";

/**
 * L'avatar del gosino: un muso 2D leggero, non il renderer del corpo di casa.
 * Gli stati sono gli stessi del vocabolario di famiglia (idle, listening,
 * thinking, talking): orecchie e occhi si muovono, il carattere resta suo.
 */

export type AvatarState = "idle" | "listening" | "thinking" | "talking";

export function Avatar({
  state,
  seed,
}: Readonly<{ state: AvatarState; seed: string }>): React.JSX.Element {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  const hue = 330 + (hash % 30) - 15; // rosa, ma il SUO rosa
  const skin = `hsl(${String(hue)} 55% 74%)`;
  const dark = `hsl(${String(hue)} 45% 40%)`;
  const earTilt = state === "listening" ? -14 : state === "talking" ? -6 : 0;
  const eyes = state === "thinking" ? 2.2 : 3.6;
  const mouth =
    state === "talking"
      ? "M 38 66 Q 50 76 62 66"
      : state === "thinking"
        ? "M 42 69 L 58 69"
        : "M 40 67 Q 50 73 60 67";

  return (
    <svg width="132" height="132" viewBox="0 0 100 100" role="img" aria-label="il gosino">
      <g transform={`rotate(${String(earTilt)} 28 22)`}>
        <ellipse cx="28" cy="20" rx="11" ry="15" fill={skin} stroke={dark} strokeWidth="2" />
      </g>
      <g transform={`rotate(${String(-earTilt)} 72 22)`}>
        <ellipse cx="72" cy="20" rx="11" ry="15" fill={skin} stroke={dark} strokeWidth="2" />
      </g>
      <circle cx="50" cy="52" r="34" fill={skin} stroke={dark} strokeWidth="2.5" />
      <circle cx="38" cy="45" r={eyes} fill={dark}>
        {state === "thinking" && (
          <animate attributeName="r" values="2.2;3.4;2.2" dur="1.2s" repeatCount="indefinite" />
        )}
      </circle>
      <circle cx="62" cy="45" r={eyes} fill={dark}>
        {state === "thinking" && (
          <animate attributeName="r" values="2.2;3.4;2.2" dur="1.2s" repeatCount="indefinite" />
        )}
      </circle>
      <ellipse cx="50" cy="57" rx="10" ry="7.5" fill={dark} opacity="0.9" />
      <circle cx="46.5" cy="57" r="1.8" fill={skin} />
      <circle cx="53.5" cy="57" r="1.8" fill={skin} />
      <path d={mouth} fill="none" stroke={dark} strokeWidth="2.2" strokeLinecap="round">
        {state === "talking" && (
          <animate
            attributeName="d"
            values="M 38 66 Q 50 76 62 66;M 40 68 Q 50 70 60 68;M 38 66 Q 50 76 62 66"
            dur="0.5s"
            repeatCount="indefinite"
          />
        )}
      </path>
      {state === "listening" && (
        <circle cx="50" cy="52" r="38" fill="none" stroke={dark} strokeWidth="1" opacity="0.5">
          <animate attributeName="r" values="36;42" dur="1.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0" dur="1.4s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}
