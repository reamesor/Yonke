"use client";

import { Ghost } from "@/components/Ghost";
import { Wordmark } from "@/components/Wordmark";
import { COLOR_HEX, COLOR_KEYS, type ColorKey } from "@/lib/colors/engine";

type Props = {
  onChoose: (mode: "demo" | "devnet") => void;
};

export function PlayModeChooser({ onChoose }: Props) {
  return (
    <div className="chooser" role="dialog" aria-labelledby="mode-title">
      <div className="chooser-card">
        <Ghost color="pink" className="mx-auto mb-2 w-24" />
        <Wordmark size="hero" />
        <p id="mode-title" className="label mt-6">
          Choose how you play
        </p>
        <p className="mt-3 text-[15px] leading-snug text-[var(--ink-dim)]">
          Same colors math either way. DEMO is a local pot. DEVNET needs a
          wallet, a signed proof, then a deposit — never mainnet.
        </p>
        <div className="chooser-actions">
          <button type="button" className="btn btn-accent" onClick={() => onChoose("demo")}>
            Demo
          </button>
          <button type="button" className="btn" onClick={() => onChoose("devnet")}>
            Devnet
          </button>
        </div>
        <div className="mt-4 flex justify-center gap-2">
          {COLOR_KEYS.map((c) => (
            <span
              key={c}
              className="inline-block h-3 w-3 border-2 border-[var(--ink)]"
              style={{ background: COLOR_HEX[c] }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
