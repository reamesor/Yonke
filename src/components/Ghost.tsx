"use client";

import type { ColorKey } from "@/lib/colors/engine";

/** Cropped tiles from the uploaded NFT sheet — one portrait per Colors face. */
export const GHOST_SRC: Record<ColorKey, string> = {
  yellow: "/ghosts/yellow.jpg",
  orange: "/ghosts/orange.jpg",
  pink: "/ghosts/pink.jpg",
  blue: "/ghosts/blue.jpg",
  green: "/ghosts/green.jpg",
  red: "/ghosts/red.jpg",
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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`ghost ${tumbling ? "is-tumbling" : ""} ${hit ? "is-hit" : ""} ${miss ? "is-miss" : ""} ${selected ? "is-selected" : ""} ${className}`}
      src={GHOST_SRC[color]}
      alt=""
      draggable={false}
    />
  );
}

export function GhostPeek({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`ghost-peek ${className}`}
      src="/ghosts/pink.jpg"
      alt=""
      draggable={false}
    />
  );
}
