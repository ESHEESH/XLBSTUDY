import assert from "node:assert/strict";
import { hearts, loseHeart, nextHeartIn } from "./game.ts";

const t0 = Date.parse("2026-01-01T00:00:00Z");
const p = { hearts: 2, hearts_updated_at: new Date(t0).toISOString() };
assert.equal(hearts(p, t0 + 25 * 60_000), 4); // +2 after 25 min
assert.equal(hearts(p, t0 + 999 * 60_000), 5); // capped
const lost = loseHeart(p, t0 + 25 * 60_000);
assert.equal(lost.hearts, 3);
assert.equal(nextHeartIn(lost, t0 + 25 * 60_000), 5 * 60_000); // 5 of 10 min progress kept
console.log("ok");
