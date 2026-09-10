"use client";

import { ColorsGame } from "@/components/colors/ColorsGame";
import { PlayModeChooser } from "@/components/play/PlayModeChooser";
import { usePlayMode } from "@/components/play/PlayModeContext";

export default function Home() {
  const playMode = usePlayMode();

  return (
    <main>
      {!playMode.ready ? null : !playMode.chose ? (
        <PlayModeChooser onChoose={playMode.setMode} />
      ) : null}
      <ColorsGame />
    </main>
  );
}
