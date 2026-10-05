// Phase 5 check: a review made offline reaches the server after reconnect, exactly once.
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { db, newCard, review, saveCard, saveDeck, sync, type Remote, type ReviewArgs } from "./offline.ts";
import type { Profile } from "./game.ts";

const profile: Profile = { id: "u", display_name: "t", daily_goal: 20, onboarded: true, hearts: 5, hearts_updated_at: new Date().toISOString(), streak: 0, last_study_date: null, xp: 0 };
await db.profile.put(profile);

const server = { upserts: [] as string[], reviews: new Map<string, ReviewArgs>(), online: false };
const remote: Remote = {
  async upsert(table, row) { if (!server.online) throw new TypeError("Failed to fetch"); server.upserts.push(`${table}:${row.id}`); },
  async recordReview(a) { if (!server.online) throw new TypeError("Failed to fetch"); server.reviews.set(a.log_id, a); return { ...profile, xp: 5 }; },
  async pull() { return []; },
  async pullProfile() { return { ...profile, xp: 5 }; },
};

// offline: create deck + card, review it
await saveDeck({ id: "d1", title: "Deck" });
const card = newCard({ id: "c1", deck_id: "d1", kind: "basic", front: "Q", back: "A" });
await saveCard(card);
await review(card, { reps: 1 }, 3);
assert.equal((await db.profile.get("u"))!.xp, 5, "optimistic local XP");

await sync(remote); // still offline: nothing lost, nothing sent
assert.equal(await db.outbox.count(), 4);
assert.equal(server.reviews.size, 0);

server.online = true; // reconnect
await sync(remote);
assert.equal(await db.outbox.count(), 0);
assert.equal(server.reviews.size, 1);
assert.deepEqual(server.upserts.slice(0, 2), ["decks:d1", "cards:c1"], "deck before its cards");

await sync(remote); // no duplicates on the next run
assert.equal(server.reviews.size, 1);
console.log("ok");
