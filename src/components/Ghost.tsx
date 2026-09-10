"use client";

import type { ColorKey } from "@/lib/colors/engine";
import { COLOR_HEX } from "@/lib/colors/engine";

export type GhostLook = "plain" | "shades" | "halo" | "flare";

const LOOKS: Record<ColorKey, GhostLook> = {
  yellow: "shades",
  orange: "plain",
  pink: "halo",
  blue: "flare",
  green: "plain",
  red: "shades",
};

type GhostProps = {
  color: ColorKey;
  look?: GhostLook;
  className?: string;
  selected?: boolean;
  tumbling?: boolean;
  hit?: boolean;
  miss?: boolean;
};

export function Ghost({
  color,
  look,
  className = "",
  selected,
  tumbling,
  hit,
  miss,
}: GhostProps) {
  const fill = COLOR_HEX[color];
  const variant = look ?? LOOKS[color];
  const id = `g-${color}`;

  return (
    <svg
      className={`ghost ${tumbling ? "is-tumbling" : ""} ${hit ? "is-hit" : ""} ${miss ? "is-miss" : ""} ${selected ? "is-selected" : ""} ${className}`}
      viewBox="0 0 120 140"
      aria-hidden
    >
      <defs>
        <pattern
          id={`${id}-hatch`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(42)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke="#14110f" strokeWidth="1.1" opacity="0.22" />
        </pattern>
        <filter id={`${id}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" result="g" />
          <feComponentTransfer in="g" result="ink">
            <feFuncA type="table" tableValues="0 0.28" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="ink" mode="multiply" />
        </filter>
      </defs>

      {variant === "halo" && (
        <ellipse
          cx="60"
          cy="22"
          rx="22"
          ry="8"
          fill="none"
          stroke="#14110f"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      )}

      <g filter={`url(#${id}-grain)`}>
        <path
          d="M18 58
             C18 28 38 12 60 12
             C82 12 102 28 102 58
             L102 108
             C102 108 94 98 86 108
             C78 118 70 98 62 108
             C54 118 46 98 38 108
             C30 118 22 98 18 108
             Z"
          fill={fill}
          stroke="#14110f"
          strokeWidth="3.4"
          strokeLinejoin="round"
        />
        <path
          d="M70 28 C86 36 94 52 94 68 L94 96 C88 88 80 96 76 90 L76 40 C76 34 74 30 70 28 Z"
          fill={`url(#${id}-hatch)`}
        />
      </g>

      {variant === "shades" ? (
        <>
          <path
            d="M34 54 H86 C90 54 92 58 92 62 C92 70 84 76 76 76 H44 C36 76 28 70 28 62 C28 58 30 54 34 54 Z"
            fill="#14110f"
          />
          <path d="M28 60 H18" stroke="#14110f" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M92 60 H102" stroke="#14110f" strokeWidth="3.2" strokeLinecap="round" />
        </>
      ) : variant === "flare" ? (
        <>
          <ellipse cx="46" cy="62" rx="11" ry="14" fill="#14110f" />
          <ellipse cx="74" cy="62" rx="11" ry="14" fill="#14110f" />
          <ellipse cx="43" cy="57" rx="4" ry="5" fill="#f3efe6" />
          <ellipse cx="71" cy="57" rx="4" ry="5" fill="#f3efe6" />
          <path
            d="M44 86 C52 94 68 94 76 86"
            fill="none"
            stroke="#14110f"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="46" cy="62" r="8.5" fill="#14110f" />
          <circle cx="74" cy="62" r="8.5" fill="#14110f" />
          <circle cx="43.5" cy="59" r="2.6" fill="#f3efe6" />
          <circle cx="71.5" cy="59" r="2.6" fill="#f3efe6" />
        </>
      )}
    </svg>
  );
}

export function GhostPeek({ className = "" }: { className?: string }) {
  return (
    <svg className={`ghost-peek ${className}`} viewBox="0 0 160 90" aria-hidden>
      <g filter="url(#peek-grain)">
        <path
          d="M20 88
             C20 40 48 8 80 8
             C112 8 140 40 140 88"
          fill="#e4a8bc"
          stroke="#14110f"
          strokeWidth="3.4"
        />
        <circle cx="64" cy="48" r="8" fill="#14110f" />
        <circle cx="96" cy="48" r="8" fill="#14110f" />
        <circle cx="61.5" cy="45" r="2.4" fill="#f3efe6" />
        <circle cx="93.5" cy="45" r="2.4" fill="#f3efe6" />
      </g>
      <defs>
        <filter id="peek-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" result="g" />
          <feComponentTransfer in="g" result="ink">
            <feFuncA type="table" tableValues="0 0.28" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="ink" mode="multiply" />
        </filter>
      </defs>
    </svg>
  );
}
