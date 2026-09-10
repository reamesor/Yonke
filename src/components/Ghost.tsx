"use client";

import type { ColorKey } from "@/lib/colors/engine";

/** High-res NFT portraits, backgrounds included. */
export const GHOST_SRC: Record<ColorKey, string> = {
  yellow: "/ghosts/yellow.jpg",
  orange: "/ghosts/orange.jpg",
  pink: "/ghosts/pink.jpg",
  blue: "/ghosts/blue.jpg",
  green: "/ghosts/green.mp4",
  red: "/ghosts/red.jpg",
};

export const GHOST_POSTER: Partial<Record<ColorKey, string>> = {
  green: "/ghosts/green.jpg",
};

type GhostProps = {
  color: ColorKey;
  className?: string;
  selected?: boolean;
  tumbling?: boolean;
  hit?: boolean;
  miss?: boolean;
};

export function Ghost({
  color,
  className = "",
  selected,
  tumbling,
  hit,
  miss,
}: GhostProps) {
  const src = GHOST_SRC[color];
  const cls = `ghost ${tumbling ? "is-tumbling" : ""} ${hit ? "is-hit" : ""} ${miss ? "is-miss" : ""} ${selected ? "is-selected" : ""} ${className}`;

  if (src.endsWith(".mp4")) {
    return (
      <video
        className={cls}
        src={src}
        poster={GHOST_POSTER[color]}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={cls} src={src} alt="" draggable={false} />
  );
}
