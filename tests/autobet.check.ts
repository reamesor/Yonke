import assert from "node:assert/strict";
import {
  consumeAutobetRemaining,
  shouldFireAutobet,
  simulateAutobetSession,
} from "../src/lib/colors/autobetCounter";

{
  const { played, remaining } = simulateAutobetSession(5);
  assert.equal(played, 5);
  assert.equal(remaining, 0);
  assert.equal(shouldFireAutobet(remaining), false);
}

for (const n of [10, 20, 50, 100] as const) {
  const { played, remaining } = simulateAutobetSession(n);
  assert.equal(played, n);
  assert.equal(remaining, 0);
}

{
  const mid = simulateAutobetSession(-1, { stopAfter: 7, maxRounds: 20 });
  assert.equal(mid.played, 7);
  assert.equal(mid.remaining, 0);
}

assert.equal(consumeAutobetRemaining(0), 0);
assert.equal(consumeAutobetRemaining(-1), -1);
assert.equal(consumeAutobetRemaining(1), 0);
assert.equal(consumeAutobetRemaining(5), 4);

{
  let rem = 5;
  let fires = 0;
  while (shouldFireAutobet(rem)) {
    fires += 1;
    rem = consumeAutobetRemaining(rem);
  }
  assert.equal(fires, 5);
  assert.equal(rem, 0);
}

console.log("autobetCounter.check OK");
