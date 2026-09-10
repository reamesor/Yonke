"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Ghost, GhostPeek } from "@/components/Ghost";
import { usePlayMode } from "@/components/play/PlayModeContext";
import { useCustody } from "@/hooks/useCustody";
import { useDemoBalance } from "@/hooks/useDemoBalance";
import { useSiws } from "@/hooks/useSiws";
import { consumeAutobetRemaining } from "@/lib/colors/autobetCounter";
import {
  COLOR_HEX,
  COLOR_KEYS,
  COLOR_LABEL,
  formatSol,
  HOUSE_EDGE,
  perColorLines,
  roundSol,
  splitCut,
  type ColorKey,
  type ColorResultLine,
} from "@/lib/colors/engine";
import type { RoundPhase } from "@/lib/colors/roundPhase";
import { DEMO_PLAY_SOL, DEMO_POOL_SOL } from "@/lib/features";
import { lamportsToSol } from "@/lib/solana/lamports";
import { applyPoolRound, EMPTY_TREASURY, type TreasuryState } from "@/lib/treasury/split";

const BET_PRESETS = [0.01, 0.05, 0.1, 0.25] as const;
const AUTOBET = [0, 5, 10, 20, -1] as const;
const TREASURY_KEY = "monke:treasury";
const SESSION_KEY = "monke:client-session";

type Fairness = {
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  dice: ColorKey[];
};

function sessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = window.sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function loadTreasury(): TreasuryState {
  if (typeof window === "undefined") return { ...EMPTY_TREASURY, pool: DEMO_POOL_SOL };
  try {
    const raw = window.localStorage.getItem(TREASURY_KEY);
    if (!raw) return { ...EMPTY_TREASURY, pool: DEMO_POOL_SOL };
    return { ...EMPTY_TREASURY, ...JSON.parse(raw), pool: JSON.parse(raw).pool ?? DEMO_POOL_SOL };
  } catch {
    return { ...EMPTY_TREASURY, pool: DEMO_POOL_SOL };
  }
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function ColorsGame() {
  const playMode = usePlayMode();
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const siws = useSiws();
  const custody = useCustody();
  const demo = useDemoBalance();

  const isDevnet = playMode.mode === "devnet";
  const playUnlocked = isDevnet ? connected && siws.isVerified : true;
  const balance = !playUnlocked
    ? 0
    : isDevnet
      ? (custody.playSol ?? 0)
      : demo.sol;
  const needsDeposit = playUnlocked && balance <= 0;
  const unitLabel = isDevnet ? "DEVNET SOL" : "DEMO SOL";
  const modeLabel = isDevnet ? "DEVNET" : "DEMO";

  const [bet, setBet] = useState(0.05);
  const [selected, setSelected] = useState<Set<ColorKey>>(new Set());
  const [phase, setPhase] = useState<RoundPhase>("select");
  const [dice, setDice] = useState<ColorKey[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [commitId, setCommitId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [clientSeed, setClientSeed] = useState("");
  const [fairness, setFairness] = useState<Fairness | null>(null);
  const [result, setResult] = useState<{
    matches: number;
    winnings: number;
    stake: number;
    houseCut: number;
    colorLines: ColorResultLine[];
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [treasury, setTreasury] = useState<TreasuryState>({
    ...EMPTY_TREASURY,
    pool: DEMO_POOL_SOL,
  });
  const [autoLeft, setAutoLeft] = useState(0);
  const [depositAmt, setDepositAmt] = useState(0.25);
  const [fundsOpen, setFundsOpen] = useState(false);

  const phaseRef = useRef(phase);
  const selectedRef = useRef(selected);
  const betRef = useRef(bet);
  const commitIdRef = useRef(commitId);
  const roundInFlightRef = useRef(false);
  const autoLeftRef = useRef(0);
  const autoRoundActiveRef = useRef(false);
  const dialogOpenRef = useRef(false);

  const goPhase = (next: RoundPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => {
    setTreasury(loadTreasury());
  }, []);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    betRef.current = bet;
  }, [bet]);
  useEffect(() => {
    commitIdRef.current = commitId;
  }, [commitId]);
  useEffect(() => {
    autoLeftRef.current = autoLeft;
  }, [autoLeft]);
  useEffect(() => {
    dialogOpenRef.current = dialogOpen;
  }, [dialogOpen]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TREASURY_KEY, JSON.stringify(treasury));
    }
  }, [treasury]);

  const openRoundCommit = useCallback(async () => {
    const n = Date.now() % 1_000_000_000;
    const res = await fetch("/api/colors/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce: n }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Commit failed");
    setCommitId(data.commitId);
    setNonce(data.nonce);
    setClientSeed(data.clientSeed);
    commitIdRef.current = data.commitId;
  }, []);

  useEffect(() => {
    void openRoundCommit().catch(() => setPrompt("Could not open a fair round"));
  }, [openRoundCommit]);

  const toggleColor = (c: ColorKey) => {
    if (phaseRef.current !== "select") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else if (next.size >= 3) {
        setPrompt("MAX 3 COLORS PER ROUND");
        return prev;
      } else next.add(c);
      return next;
    });
  };

  const cost = roundSol(bet * selected.size);

  const debitBet = async (amount: number) => {
    if (isDevnet) return custody.playDebit(amount);
    return demo.debit(amount);
  };
  const creditBet = async (amount: number) => {
    if (isDevnet) return custody.playCredit(amount);
    return demo.credit(amount);
  };

  const ensureReady = (need: number) => {
    if (isDevnet && !connected) {
      setPrompt("CONNECT A WALLET");
      setVisible(true);
      return false;
    }
    if (isDevnet && !siws.isVerified) {
      setPrompt("VERIFY WALLET (SIWS)");
      setFundsOpen(true);
      return false;
    }
    if (need > balance + 1e-12) {
      setPrompt(isDevnet ? "DEPOSIT DEVNET SOL" : "RESET DEMO POT");
      setFundsOpen(true);
      return false;
    }
    return true;
  };

  const placeOnly = () => {
    if (roundInFlightRef.current) {
      setPrompt("ROLL IN PROGRESS…");
      return;
    }
    if (phaseRef.current !== "select") {
      if (phaseRef.current === "placed") setPrompt("READY — ROLL");
      else if (phaseRef.current === "done") setPrompt("DISMISS RESULT TO CONTINUE");
      else setPrompt("ROLL IN PROGRESS…");
      return;
    }
    if (selectedRef.current.size === 0) {
      setPrompt("PICK AT LEAST ONE COLOR");
      return;
    }
    if (!commitIdRef.current) {
      setPrompt("OPENING ROUND…");
      void openRoundCommit();
      return;
    }
    const need = roundSol(betRef.current * selectedRef.current.size);
    if (!ensureReady(need)) return;
    goPhase("placed");
    setPrompt("READY — ROLL");
    setDialogOpen(false);
  };

  const cancelPlaced = () => {
    if (phaseRef.current !== "placed" || roundInFlightRef.current) return;
    goPhase("select");
    setPrompt("");
  };

  const rollOnly = async () => {
    if (roundInFlightRef.current || phaseRef.current === "rolling") {
      setPrompt("ROLL IN PROGRESS…");
      return;
    }
    if (phaseRef.current !== "placed") {
      setPrompt(
        phaseRef.current === "select"
          ? "PLACE BET FIRST — THEN ROLL"
          : "WAIT FOR ROUND TO FINISH",
      );
      return;
    }
    const picks = [...selectedRef.current];
    const unit = betRef.current;
    const stake = roundSol(unit * picks.length);
    if (!ensureReady(stake)) {
      goPhase("select");
      return;
    }

    const debit = await debitBet(stake);
    if (!debit.ok) {
      setPrompt(debit.error.toUpperCase());
      goPhase("select");
      return;
    }

    roundInFlightRef.current = true;
    goPhase("rolling");
    setDice(null);

    try {
      const res = await fetch("/api/colors/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bet: unit,
          picked: picks,
          commitId: commitIdRef.current,
          clientSeed,
          nonce,
          clientSessionId: sessionId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Roll failed");

      const rolled = data.dice as ColorKey[];
      await wait(720);
      setDice(rolled);

      const settlement = data.settlement as {
        matches: number;
        winningsLamports: number;
        stakeLamports: number;
        houseCutLamports: number;
      };
      const winnings = lamportsToSol(settlement.winningsLamports);
      const houseCut = lamportsToSol(settlement.houseCutLamports);
      const stakeSol = lamportsToSol(settlement.stakeLamports);
      const lines = perColorLines(unit, picks, rolled);

      await creditBet(winnings);
      if (isDevnet) void custody.refreshBalance();

      const nextResult = {
        matches: settlement.matches,
        winnings,
        stake: stakeSol,
        houseCut,
        colorLines: lines,
      };
      setResult(nextResult);
      setFairness(data.fairness);
      setTreasury((t) => applyPoolRound(t, stakeSol, winnings, houseCut));

      const showDialog = !autoRoundActiveRef.current;
      setDialogOpen(showDialog);
      dialogOpenRef.current = showDialog;
      goPhase("done");

      const nextAuto = consumeAutobetRemaining(autoLeftRef.current);
      autoLeftRef.current = nextAuto;
      setAutoLeft(nextAuto);

      await wait(280);
      await openRoundCommit();
      if (!showDialog) goPhase("select");
    } catch (err) {
      await creditBet(stake);
      setPrompt(err instanceof Error ? err.message : "ROLL FAILED");
      goPhase("select");
      void openRoundCommit();
    } finally {
      roundInFlightRef.current = false;
      autoRoundActiveRef.current = false;
    }
  };

  const closeResult = () => {
    setDialogOpen(false);
    dialogOpenRef.current = false;
    if (phaseRef.current === "done") goPhase("select");
    setPrompt("");
  };

  useEffect(() => {
    if (autoLeft === 0) return;
    if (phase !== "select") return;
    if (dialogOpen) return;
    if (selected.size === 0) return;
    if (!commitId) return;
    if (roundInFlightRef.current) return;
    let cancelled = false;
    (async () => {
      await wait(180);
      if (cancelled || autoLeftRef.current === 0) return;
      autoRoundActiveRef.current = true;
      placeOnly();
      await wait(80);
      if (cancelled) return;
      await rollOnly();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLeft, phase, selected.size, dialogOpen, commitId]);

  const placeLabel = !isDevnet
    ? needsDeposit
      ? "RESET DEMO POT"
      : phase === "placed"
        ? "CANCEL"
        : "PLACE BET"
    : !connected
      ? "CONNECT"
      : !siws.isVerified
        ? "VERIFY"
        : needsDeposit
          ? "DEPOSIT DEVNET"
          : phase === "placed"
            ? "CANCEL"
            : "PLACE BET";

  const onPlaceClick = () => {
    if (!isDevnet && needsDeposit) {
      demo.reset();
      return;
    }
    if (isDevnet && !connected) {
      setVisible(true);
      return;
    }
    if (isDevnet && !siws.isVerified) {
      void siws.verify();
      return;
    }
    if (isDevnet && needsDeposit) {
      setFundsOpen(true);
      return;
    }
    if (phase === "placed") {
      cancelPlaced();
      return;
    }
    placeOnly();
  };

  const resultParts = result ? splitCut(result.houseCut) : null;
  const breakEven = result ? Math.abs(result.winnings - result.stake) < 1e-9 : false;

  return (
    <div className="play">
      <section className="stage">
        <div className="dice-row">
          {(dice ?? ["yellow", "orange", "pink"]).map((face, i) => (
            <div className="die" key={i}>
              <Ghost
                color={face}
                tumbling={phase === "rolling"}
                hit={Boolean(face && selected.has(face))}
                miss={Boolean(dice && face && !selected.has(face))}
              />
            </div>
          ))}
        </div>
        <p className="prompt text-center">{prompt || (phase === "rolling" ? "Rolling…" : "Pick up to three colors")}</p>

        <div className="color-grid" role="group" aria-label="Colors">
          {COLOR_KEYS.map((c) => {
            const on = selected.has(c);
            return (
              <button
                key={c}
                type="button"
                className={`color-chip ${on ? "is-on" : ""}`}
                onClick={() => toggleColor(c)}
                aria-pressed={on}
              >
                <Ghost color={c} selected={on} />
                <span>{COLOR_LABEL[c]}</span>
              </button>
            );
          })}
        </div>

        <div className="meters" id="treasury" aria-label="Treasury">
          <div className="meter">
            <div className="kicker">Session cut</div>
            <b>{formatSol(treasury.total)}</b>
          </div>
          <div className="meter">
            <div className="kicker">Play pool</div>
            <b>{formatSol(treasury.pool)}</b>
          </div>
          <div className="meter">
            <div className="kicker">Burn / Believers</div>
            <b>
              {formatSol(treasury.burn)} / {formatSol(treasury.believers)}
            </b>
          </div>
          <div className="meter">
            <div className="kicker">Build</div>
            <b>{formatSol(treasury.build)}</b>
          </div>
        </div>

        {fairness && (
          <div className="fairness" id="fairness">
            Commit {fairness.serverSeedHash.slice(0, 16)}… · nonce {fairness.nonce}
            <button
              type="button"
              className="ml-2 underline"
              onClick={async () => {
                const res = await fetch("/api/colors/verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(fairness),
                });
                const data = await res.json();
                setPrompt(data.valid ? "FAIRNESS VERIFIED" : "FAIRNESS MISMATCH");
              }}
            >
              Verify
            </button>
          </div>
        )}
      </section>

      <aside className="panel">
        <div>
          <div className="kicker">
            Monke · {modeLabel}
            {isDevnet && connected ? ` · ${publicKey?.toBase58().slice(0, 4)}…` : ""}
          </div>
          <div className="balance-amt">
            {formatSol(balance)}
            <span className="balance-unit">SOL</span>
          </div>
          <p className="mt-1 text-[12px] text-[var(--ink-dim)]">
            {isDevnet
              ? playUnlocked
                ? `Wallet ${custody.walletSol != null ? formatSol(custody.walletSol) : "—"} SOL · play pot above`
                : "Connect + verify, then deposit DEVNET SOL."
              : `Local pot · seed ${DEMO_PLAY_SOL} SOL`}
          </p>
        </div>

        <div>
          <div className="kicker">Unit bet</div>
          <div className="stepper mt-2">
            <button
              type="button"
              onClick={() => setBet(roundSol(Math.max(0.01, bet - (bet >= 0.1 ? 0.05 : 0.01))))}
              aria-label="Decrease bet"
            >
              −
            </button>
            <input
              value={bet}
              onChange={(e) => setBet(roundSol(Number(e.target.value) || 0))}
              inputMode="decimal"
            />
            <button
              type="button"
              onClick={() => setBet(roundSol(bet + (bet >= 0.1 ? 0.05 : 0.01)))}
              aria-label="Increase bet"
            >
              +
            </button>
          </div>
          <div className="presets mt-2">
            {BET_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={bet === p ? "is-on" : ""}
                onClick={() => setBet(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {selected.size >= 2 && (
          <div className="cost-break">
            {[...selected].map((c) => (
              <div className="cost-row" key={c}>
                <span>
                  <i className="swatch" style={{ background: COLOR_HEX[c] }} />
                  {COLOR_LABEL[c]}
                </span>
                <span>{formatSol(bet)}</span>
              </div>
            ))}
            <div className="cost-row cost-total">
              <span>Total</span>
              <span>{formatSol(cost)}</span>
            </div>
          </div>
        )}

        <button type="button" className="btn btn-accent" onClick={onPlaceClick}>
          {placeLabel}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void rollOnly()}
        >
          {phase === "placed" ? "Roll" : "Roll"}
        </button>

        <div>
          <div className="kicker">Autobet</div>
          <div className="presets mt-2">
            {AUTOBET.map((n) => (
              <button
                key={n}
                type="button"
                className={autoLeft === n || (n === 0 && autoLeft === 0) ? "is-on" : ""}
                onClick={() => {
                  autoLeftRef.current = n;
                  setAutoLeft(n);
                  if (n === 0) autoRoundActiveRef.current = false;
                }}
              >
                {n === 0 ? "Off" : n < 0 ? "∞" : n}
              </button>
            ))}
          </div>
        </div>

        {isDevnet && (
          <button type="button" className="btn" onClick={() => setFundsOpen(true)}>
            Deposit / Withdraw
          </button>
        )}
        {!isDevnet && (
          <button type="button" className="btn" onClick={() => demo.reset()}>
            Reset demo pot
          </button>
        )}
        <button type="button" className="btn" onClick={() => playMode.reset()}>
          Switch to {isDevnet ? "DEMO" : "DEVNET"}
        </button>
        {connected && (
          <button type="button" className="btn" onClick={() => void disconnect()}>
            Disconnect
          </button>
        )}
      </aside>

      <GhostPeek />

      {dialogOpen && result && (
        <div className="modal-scrim" role="dialog" aria-modal>
          <div className="modal">
            <div className="kicker">This round</div>
            <p className="mt-2 font-[family-name:var(--font-display)] text-[40px] leading-none">
              {result.matches > 0 ? "Hit" : "Miss"}
            </p>
            <div className="cost-break mt-4">
              <div className="cost-row">
                <span>You get</span>
                <span>{formatSol(result.winnings)} {unitLabel}</span>
              </div>
              <div className="cost-row">
                <span>{result.winnings >= result.stake ? "Profit" : "You lost"}</span>
                <span>
                  {result.winnings - result.stake >= 0 ? "+" : "−"}
                  {formatSol(Math.abs(result.winnings - result.stake))} {unitLabel}
                </span>
              </div>
              {result.colorLines.length >= 2 ? (
                <>
                  <p className="kicker mt-2">
                    {breakEven && result.colorLines.some((l) => l.matches > 0)
                      ? `${result.colorLines.filter((l) => l.matches > 0).length} of ${result.colorLines.length} colors hit · break-even`
                      : `${result.colorLines.filter((l) => l.matches > 0).length} of ${result.colorLines.length} colors hit`}
                  </p>
                  {result.colorLines.map((line) => (
                    <div className="cost-row" key={line.color}>
                      <span>
                        <i className="swatch" style={{ background: COLOR_HEX[line.color] }} />
                        {COLOR_LABEL[line.color]} · {formatSol(line.cost)} ·{" "}
                        {line.matches > 0
                          ? line.matches > 1
                            ? `HIT · ${line.matches}`
                            : "HIT"
                          : "MISS"}
                      </span>
                    </div>
                  ))}
                  <div className="cost-row cost-total">
                    <span>Total cost</span>
                    <span>−{formatSol(result.stake)} {unitLabel}</span>
                  </div>
                </>
              ) : (
                <div className="cost-row">
                  <span>Your bet</span>
                  <span>−{formatSol(result.stake)} {unitLabel}</span>
                </div>
              )}
            </div>
            {resultParts && (
              <p className="mt-3 text-[13px]">
                Cut taken: {formatSol(result.houseCut)} {unitLabel} → burn{" "}
                {formatSol(resultParts.burn)} / believers {formatSol(resultParts.believers)} / build{" "}
                {formatSol(resultParts.build)}
                {result.matches === 0 ? " · cut still taken on a loss" : ""}
              </p>
            )}
            <p className="mt-1 text-[12px] text-[var(--ink-dim)]">
              {HOUSE_EDGE * 100}% of bet cost every roll. Wins pay the full ladder.
            </p>
            <button type="button" className="btn btn-accent mt-4 w-full" onClick={closeResult}>
              Play again
            </button>
          </div>
        </div>
      )}

      {fundsOpen && (
        <div className="modal-scrim" role="dialog" aria-modal>
          <div className="modal">
            <div className="kicker">{isDevnet ? "DEVNET funds" : "DEMO pot"}</div>
            {isDevnet ? (
              <>
                <p className="mt-2 text-[14px]">
                  {siws.isVerified
                    ? "Verified. Deposit sends SOL to the house wallet; we credit play only after confirm."
                    : "Connect, then sign a message. This does not move funds."}
                </p>
                {siws.error && <p className="mt-2 text-[13px]">{siws.error}</p>}
                {custody.error && <p className="mt-2 text-[13px]">{custody.error}</p>}
                {!siws.isVerified && (
                  <button
                    type="button"
                    className="btn btn-accent mt-4 w-full"
                    onClick={() => (connected ? void siws.verify() : setVisible(true))}
                  >
                    {siws.busy ? "Working…" : connected ? "Sign in with Solana" : "Connect wallet"}
                  </button>
                )}
                {siws.isVerified && (
                  <>
                    <div className="stepper mt-4">
                      <button type="button" onClick={() => setDepositAmt(Math.max(0.05, depositAmt - 0.05))}>
                        −
                      </button>
                      <input
                        value={depositAmt}
                        onChange={(e) => setDepositAmt(Number(e.target.value) || 0)}
                      />
                      <button type="button" onClick={() => setDepositAmt(depositAmt + 0.05)}>
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="btn btn-accent mt-3 w-full"
                      onClick={() => void custody.deposit(depositAmt)}
                    >
                      Deposit
                    </button>
                    <button
                      type="button"
                      className="btn mt-2 w-full"
                      onClick={() => void custody.withdraw(Math.min(depositAmt, balance))}
                    >
                      Withdraw remaining
                    </button>
                    <a className="mt-3 block text-[12px] underline" href={custody.faucetUrl} target="_blank" rel="noreferrer">
                      Devnet faucet
                    </a>
                    {custody.disabledReason && (
                      <p className="mt-2 text-[12px] text-[var(--ink-dim)]">{custody.disabledReason}</p>
                    )}
                  </>
                )}
              </>
            ) : (
              <button type="button" className="btn btn-accent mt-4 w-full" onClick={() => demo.reset()}>
                Reset to {DEMO_PLAY_SOL} SOL
              </button>
            )}
            <button type="button" className="btn mt-2 w-full" onClick={() => setFundsOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
