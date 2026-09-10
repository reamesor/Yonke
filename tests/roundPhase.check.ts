import assert from "node:assert/strict";
import {
  afterCancelPlace,
  afterCommitReady,
  afterLeverPull,
  afterPlaceBet,
  afterRollFail,
  afterSettleTail,
  afterSettleUi,
  canPlaceBet,
  canPlayManualAndAutobetLoops,
  canPlaySequentialRounds,
  canPullLever,
  playOneRound,
  rejectDoubleLever,
  type RoundGate,
} from "../src/lib/colors/roundPhase";
import {
  clearSessionRollGuards,
  endSessionRoll,
  sessionRollInFlightCount,
  tryBeginSessionRoll,
} from "../src/lib/colors/sessionRollGuard";
import { putCommit, takeCommit } from "../src/lib/colors/commitStore";
import { createRoundCommit, deriveDice, verifyFairness } from "../src/lib/colors/fairness";

{
  let g: RoundGate = { phase: "select", inFlight: false, commitReady: true };
  assert.ok(canPlaceBet(g));
  g = afterPlaceBet(g)!;
  assert.ok(canPullLever(g));
  g = afterLeverPull(g)!;
  assert.equal(g.phase, "rolling");
  assert.ok(g.inFlight);
  assert.ok(rejectDoubleLever(g));
  assert.equal(afterLeverPull(g), null);

  g = afterSettleUi(g);
  assert.equal(g.phase, "done");
  assert.equal(g.commitReady, false);
  assert.ok(!canPlaceBet(g));

  g = afterSettleTail(g);
  assert.equal(g.phase, "select");
  assert.ok(!canPlaceBet(g));
  g = afterCommitReady(g);
  assert.ok(canPlaceBet(g));
}

{
  let g: RoundGate = { phase: "select", inFlight: false, commitReady: true };
  g = afterPlaceBet(g)!;
  g = afterCancelPlace(g)!;
  assert.equal(g.phase, "select");
}

{
  const g = afterRollFail({
    phase: "rolling",
    inFlight: true,
    commitReady: true,
  });
  assert.equal(g.phase, "select");
  assert.ok(!g.inFlight);
}

{
  let g: RoundGate = { phase: "select", inFlight: false, commitReady: true };
  for (let round = 1; round <= 4; round++) {
    assert.ok(canPlaceBet(g), `round ${round}`);
    g = playOneRound(g)!;
  }
  assert.ok(canPlaySequentialRounds(50));
  assert.ok(canPlaySequentialRounds(500));
  assert.ok(canPlayManualAndAutobetLoops(100));
}

clearSessionRollGuards();
assert.ok(tryBeginSessionRoll("sess-a"));
assert.ok(!tryBeginSessionRoll("sess-a"));
assert.ok(tryBeginSessionRoll("sess-b"));
assert.equal(sessionRollInFlightCount(), 2);
endSessionRoll("sess-a");
assert.ok(tryBeginSessionRoll("sess-a"));
endSessionRoll("sess-a");
endSessionRoll("sess-b");
clearSessionRollGuards();

process.env.FAIRNESS_DURABLE_STORE = "memory";

{
  const nonce = 42;
  const opened = createRoundCommit(nonce, "client-seed");
  const dice = deriveDice(
    opened.serverSeed,
    opened.commit.clientSeed,
    opened.commit.nonce,
  );
  assert.equal(dice.length, 3);
  assert.ok(
    verifyFairness({
      ...opened.commit,
      serverSeed: opened.serverSeed,
      dice,
    }),
  );
  assert.ok(
    !verifyFairness({
      ...opened.commit,
      serverSeed: opened.serverSeed,
      dice: [dice[1]!, dice[2]!, dice[0]!],
    }),
  );
}

async function checkTakeCommitOnce() {
  const commitId = `test-commit-${Date.now()}`;
  await putCommit(commitId, {
    serverSeed: "seed",
    serverSeedHash: commitId,
    clientSeed: "client",
    nonce: 0,
    createdAt: Date.now(),
  });
  const first = await takeCommit(commitId);
  assert.ok(first);
  const second = await takeCommit(commitId);
  assert.equal(second, null);
}

void checkTakeCommitOnce().then(() => {
  console.log("roundPhase + fairness check OK");
});
