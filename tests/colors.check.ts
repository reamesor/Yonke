/**
 * Sanity check for Colors 2×-per-match payouts + 5% bet-cost cut + 40/40/20.
 * Covers loss-cut, PER_COLOR match matrix, exact split.
 */
import assert from "node:assert/strict";
import {
  HOUSE_EDGE,
  MATCH_PAYOUT,
  SINGLE_RETURN_BY_MATCH,
  matchWinnings,
  netMatchWinnings,
  payoutMultiplier,
  perColorLines,
  settleRoll,
  splitCut,
  type ColorKey,
} from "../src/lib/colors/engine";
import {
  MATCH_PAYOUT_LAMPORTS,
  matchWinningsLamports,
  settleRollLamports,
} from "../src/lib/colors/engineLamports";
import {
  houseCutLamports,
  solToLamports,
  splitCutLamports,
} from "../src/lib/solana/lamports";
import { applyHouseCut, applyPoolRound, type TreasuryState } from "../src/lib/treasury/split";

const BET = 1;
const ONE: ColorKey[] = ["blue"];
const dice1: ColorKey[] = ["blue", "red", "green"];
const dice2: ColorKey[] = ["blue", "blue", "red"];
const dice3: ColorKey[] = ["blue", "blue", "blue"];
const dice0: ColorKey[] = ["red", "green", "yellow"];

assert.equal(MATCH_PAYOUT, 2);
assert.equal(SINGLE_RETURN_BY_MATCH[1], 2);
assert.equal(SINGLE_RETURN_BY_MATCH[2], 4);
assert.equal(SINGLE_RETURN_BY_MATCH[3], 6);
assert.equal(payoutMultiplier(1), 2);
assert.equal(payoutMultiplier(2), 4);
assert.equal(payoutMultiplier(3), 6);
assert.equal(matchWinnings(0.05, 1), 0.1);
assert.ok(Math.abs(netMatchWinnings(0.05, 1) - 0.1) < 1e-12);

const m1 = settleRoll(BET, ONE, dice1, "PER_COLOR");
assert.equal(m1.matches, 1);
assert.ok(Math.abs(m1.winnings - BET * 2) < 1e-12);
assert.equal(m1.stake, 1);
assert.ok(Math.abs(m1.houseCut - BET * HOUSE_EDGE) < 1e-12);
assert.ok(Math.abs(m1.net - (m1.winnings - BET)) < 1e-12);

const m2 = settleRoll(BET, ONE, dice2, "PER_COLOR");
assert.equal(m2.matches, 2);
assert.ok(Math.abs(m2.winnings - BET * 4) < 1e-12);
assert.ok(Math.abs(m2.houseCut - BET * HOUSE_EDGE) < 1e-12);

const m3 = settleRoll(BET, ONE, dice3, "PER_COLOR");
assert.equal(m3.matches, 3);
assert.ok(Math.abs(m3.winnings - BET * 6) < 1e-12);
assert.ok(Math.abs(m3.houseCut - BET * HOUSE_EDGE) < 1e-12);

const lose = settleRoll(BET, ONE, dice0, "PER_COLOR");
assert.equal(lose.matches, 0);
assert.equal(lose.winnings, 0);
assert.ok(Math.abs(lose.houseCut - BET * HOUSE_EDGE) < 1e-12);
assert.ok(lose.houseCut > 0, "loss UI must show non-zero cut");

for (const [label, dice, matches, grossMult] of [
  ["0", dice0, 0, 0],
  ["1", dice1, 1, 2],
  ["2", dice2, 2, 4],
  ["3", dice3, 3, 6],
] as const) {
  const r = settleRoll(BET, ONE, dice, "PER_COLOR");
  assert.equal(r.matches, matches, `matches ${label}`);
  assert.ok(Math.abs(r.winnings - BET * grossMult) < 1e-12, `winnings ${label}`);
  assert.ok(Math.abs(r.houseCut - BET * HOUSE_EDGE) < 1e-12, `cut ${label}`);
}

const verify = settleRoll(0.05, ONE, dice2, "PER_COLOR");
assert.equal(verify.matches, 2);
assert.ok(Math.abs(verify.winnings - 0.2) < 1e-12);
assert.ok(Math.abs(verify.stake - 0.05) < 1e-12);
assert.ok(Math.abs(verify.net - 0.15) < 1e-12);
assert.ok(Math.abs(verify.houseCut - 0.05 * HOUSE_EDGE) < 1e-12);

// Primary clarity case: unitBet=0.05, 2 colors, 1 match → get 0.10, bet −0.10, profit 0.00
{
  const r = settleRoll(
    0.05,
    ["blue", "green"],
    ["blue", "yellow", "orange"],
    "PER_COLOR",
  );
  assert.equal(r.matches, 1);
  assert.ok(Math.abs(r.winnings - 0.1) < 1e-12, "get 0.10");
  assert.ok(Math.abs(r.stake - 0.1) < 1e-12, "bet −0.10");
  assert.ok(Math.abs(r.net) < 1e-12, "profit 0.00 break-even");
  assert.ok(Math.abs(r.houseCut - 0.1 * HOUSE_EDGE) < 1e-12);
  const lines = perColorLines(0.05, ["blue", "green"], ["blue", "yellow", "orange"]);
  assert.equal(lines.length, 2);
  const blue = lines.find((l) => l.color === "blue")!;
  const green = lines.find((l) => l.color === "green")!;
  assert.equal(blue.matches, 1);
  assert.ok(Math.abs(blue.winnings - 0.1) < 1e-12);
  assert.equal(green.matches, 0);
  assert.equal(green.winnings, 0);
}

const three = settleRoll(
  BET,
  ["blue", "green", "red"],
  ["blue", "orange", "yellow"],
  "PER_COLOR",
);
assert.equal(three.matches, 1);
assert.equal(three.stake, 3);
assert.ok(Math.abs(three.winnings - 2) < 1e-12);
assert.ok(Math.abs(three.houseCut - 3 * HOUSE_EDGE) < 1e-12);

{
  const N = 25;
  const unit = 0.05;
  let treasury: TreasuryState = {
    total: 0,
    burn: 0,
    believers: 0,
    build: 0,
    pool: 100,
  };
  for (let i = 0; i < N; i++) {
    const before = { ...treasury };
    const lost = settleRoll(unit, ONE, dice0, "PER_COLOR");
    assert.equal(lost.matches, 0);
    assert.ok(Math.abs(lost.houseCut - unit * HOUSE_EDGE) < 1e-12);
    treasury = applyHouseCut(treasury, lost.houseCut);
    const expectedCut = unit * HOUSE_EDGE;
    assert.ok(Math.abs(treasury.total - before.total - expectedCut) < 1e-12);
    assert.ok(Math.abs(treasury.burn - before.burn - expectedCut * 0.4) < 1e-12);
    assert.ok(
      Math.abs(treasury.believers - before.believers - expectedCut * 0.4) < 1e-12,
    );
    assert.ok(Math.abs(treasury.build - before.build - expectedCut * 0.2) < 1e-12);
  }
  assert.ok(Math.abs(treasury.total - N * unit * HOUSE_EDGE) < 1e-12);
}

// Pool honesty: bets fund pool, losses pay wins, house keeps only the 5% cut
{
  let t: TreasuryState = {
    total: 0,
    burn: 0,
    believers: 0,
    build: 0,
    pool: 10,
  };
  const lost = settleRoll(1, ONE, dice0, "PER_COLOR");
  t = applyPoolRound(t, lost.stake, lost.winnings, lost.houseCut);
  assert.ok(Math.abs(t.pool - (10 + 1 - 0 - 0.05)) < 1e-12);
  assert.ok(Math.abs(t.total - 0.05) < 1e-12);

  const win = settleRoll(1, ONE, dice1, "PER_COLOR");
  const afterWin = applyPoolRound(t, win.stake, win.winnings, win.houseCut);
  assert.ok(Math.abs(afterWin.pool - (t.pool + 1 - 2 - 0.05)) < 1e-12);
}

const cut = splitCut(0.05);
assert.ok(Math.abs(cut.burn - 0.02) < 1e-12);
assert.ok(Math.abs(cut.believers - 0.02) < 1e-12);
assert.ok(Math.abs(cut.build - 0.01) < 1e-12);

{
  const unitLp = 50_000_000;
  const colorCombos: ColorKey[][] = [
    ["blue"],
    ["blue", "green"],
    ["blue", "green", "red"],
  ];
  const matchDice: { matches: number; dice: ColorKey[] }[] = [
    { matches: 0, dice: ["yellow", "orange", "pink"] },
    { matches: 1, dice: ["blue", "yellow", "orange"] },
    { matches: 2, dice: ["blue", "blue", "yellow"] },
    { matches: 3, dice: ["blue", "blue", "blue"] },
  ];

  for (const colors of colorCombos) {
    for (const { dice } of matchDice) {
      let diceForCombo: ColorKey[];
      if (colors.length === 1) {
        diceForCombo = dice;
      } else if (dice[0] === "yellow") {
        diceForCombo = ["yellow", "orange", "pink"];
      } else if (dice.filter((d) => d === "blue").length === 1) {
        diceForCombo = [colors[0]!, "yellow", "orange"];
      } else if (dice.filter((d) => d === "blue").length === 2) {
        diceForCombo = [colors[0]!, colors[0]!, "yellow"];
      } else {
        diceForCombo = [colors[0]!, colors[0]!, colors[0]!];
      }

      const r = settleRollLamports(unitLp, colors, diceForCombo, "PER_COLOR");
      assert.equal(r.stakeLamports, unitLp * colors.length);
      assert.equal(r.houseCutLamports, houseCutLamports(r.stakeLamports));
      let expectedWin = 0;
      let best = 0;
      for (const c of colors) {
        const hits = diceForCombo.filter((d) => d === c).length;
        best = Math.max(best, hits);
        expectedWin += matchWinningsLamports(unitLp, hits);
      }
      assert.equal(r.matches, best);
      assert.equal(r.winningsLamports, expectedWin);
      assert.equal(r.netLamports, expectedWin - r.stakeLamports);
      if (best > 0) {
        assert.ok(r.winningsLamports > 0, "full ladder paid");
      }
    }
  }
  assert.equal(MATCH_PAYOUT_LAMPORTS, 2);
}

{
  for (let i = 0; i < 200; i++) {
    const stakeLp = 1 + Math.floor(Math.random() * 5_000_000_000);
    const cutLp = houseCutLamports(stakeLp);
    const parts = splitCutLamports(cutLp);
    assert.equal(
      parts.burn + parts.believers + parts.build,
      cutLp,
      `split identity stake=${stakeLp}`,
    );
  }
  const oneSolCut = houseCutLamports(solToLamports(1));
  assert.equal(oneSolCut, 50_000_000);
  const p = splitCutLamports(oneSolCut);
  assert.equal(p.burn, 20_000_000);
  assert.equal(p.believers, 20_000_000);
  assert.equal(p.build, 10_000_000);
}

console.log("colors engine check OK");
console.log({
  examples: {
    "0.05 · 2 colors · 1 match": (() => {
      const r = settleRoll(
        0.05,
        ["blue", "green"],
        ["blue", "yellow", "orange"],
        "PER_COLOR",
      );
      return { get: r.winnings, bet: r.stake, profit: r.net, cut: r.houseCut };
    })(),
    "0.05 · 2 match": {
      cost: verify.stake,
      returned: verify.winnings,
      cut: verify.houseCut,
      profit: verify.net,
    },
    loss: { winnings: lose.winnings, houseCut: lose.houseCut },
  },
});
