import type { CSSProperties } from "react";

const LETTERS = [
  { ch: "Y", r: "-7deg", y: "0.06em", kick: "11deg" },
  { ch: "O", r: "3deg", y: "-0.05em", kick: "-10deg" },
  { ch: "N", r: "-2deg", y: "0.04em", kick: "8deg" },
  { ch: "K", r: "6deg", y: "-0.04em", kick: "-12deg" },
  { ch: "E", r: "-4deg", y: "0.05em", kick: "10deg" },
] as const;

type WordmarkProps = {
  size?: "nav" | "hero";
  className?: string;
};

export function Wordmark({ size = "nav", className = "" }: WordmarkProps) {
  return (
    <span className={`wordmark wordmark--${size} ${className}`} aria-label="Yonke">
      <span className="wordmark-line" aria-hidden>
        {LETTERS.map((l) => (
          <span
            key={l.ch}
            className="letter"
            style={
              {
                "--r": l.r,
                "--y": l.y,
                "--kick": l.kick,
              } as CSSProperties
            }
          >
            {l.ch}
          </span>
        ))}
      </span>
    </span>
  );
}
