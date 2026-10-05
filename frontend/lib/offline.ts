// Local-first data layer: Dexie mirrors decks/cards/profile; writes go to Dexie + an ordered outbox;
// sync() pushes the outbox then pulls. Server-side function record_review is the only XP/hearts/streak writer.
import Dexie, { type Table } from "dexie";
import { loseHeart, nextStreak, today, XP, type Profile } from "./game.ts";
import type { CardRow, Deck } from "./types.ts";

type Row = Record<string, unknown>;
export type ReviewArgs = { log_id: string; card_id: string; rating: number; reviewed_at: string; day: string };
export type OutboxItem =
  | { seq?: number; op: "upsert"; table: "decks" | "cards"; row: Row }
  | { seq?: number; op: "review"; args: ReviewArgs };

/** Network/server edge, injected so sync is testable without Supabase. */
export interface Remote {
  upsert(table: "decks" | "cards", row: Row): Promise<void>;
  recordReview(a: ReviewArgs): Promise<Profile>;
  pull(table: "decks" | "cards", since: string, offset: number): Promise<Row[]>;
  pullProfile(): Promise<Profile>;
}

class DB extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<CardRow, string>;
  profile!: Table<Profile, string>;
  outbox!: Table<OutboxItem, number>;
  meta!: Table<{ key: string; value: string }, string>;
  constructor() {
    super("xlbstudy");
    this.version(1).stores({ decks: "id", cards: "id,deck_id", profile: "id", outbox: "++seq", meta: "key" });
  }
}
export const db = new DB();

const now = () => new Date().toISOString();

// ---- local writes (instant, work offline) ----

async function put(table: "decks" | "cards", row: Row) {
  const full = { ...row, updated_at: now() };
  await db.transaction("rw", db[table], db.outbox, async () => {
    await (db[table] as Table<Row, string>).put(full);
    await db.outbox.add({ op: "upsert", table, row: full });
  });
}

export const saveDeck = (d: { id: string; title: string; source?: string }) =>
  put("decks", { source: "manual", created_at: now(), ...d });

export const newCard = (c: Pick<CardRow, "id" | "deck_id" | "kind" | "front" | "back">): CardRow => ({
  due: now(), stability: 0, difficulty: 0, reps: 0, lapses: 0, state: 0, learning_steps: 0, last_review: null,
  updated_at: now(), ...c,
});
export const saveCard = (c: CardRow) => put("cards", c as unknown as Row);

export async function saveCards(cards: CardRow[]) {
  for (const c of cards) await saveCard(c); // sequential: outbox order = creation order
}

/** Soft delete (sync needs the tombstone). */
export const deleteCard = (c: CardRow) => saveCard({ ...c, deleted_at: now() });
export async function deleteDeck(id: string) {
  const d = await db.decks.get(id);
  if (d) await put("decks", { ...d, deleted_at: now() });
  for (const c of await db.cards.where("deck_id").equals(id).toArray()) if (!c.deleted_at) await deleteCard(c);
}

/** Apply one review locally (optimistic XP/streak/hearts) and queue it for the server. */
export async function review(card: CardRow, fsrsFields: Partial<CardRow>, rating: 1 | 2 | 3 | 4, at = new Date()) {
  const args: ReviewArgs = { log_id: crypto.randomUUID(), card_id: card.id, rating, reviewed_at: at.toISOString(), day: today() };
  await db.transaction("rw", db.cards, db.profile, db.outbox, async () => {
    const updated = { ...card, ...fsrsFields, updated_at: now() };
    await db.cards.put(updated);
    await db.outbox.add({ op: "upsert", table: "cards", row: updated as unknown as Row });
    await db.outbox.add({ op: "review", args });
    const p = await db.profile.toCollection().first();
    if (p) {
      await db.profile.put({
        ...p,
        xp: p.xp + XP[rating],
        streak: nextStreak(p),
        last_study_date: today(),
        ...(rating === 1 ? loseHeart(p) : {}),
      });
    }
  });
}

// ---- sync ----

// Postgres integrity/privilege/raise-exception errors will never succeed on retry; anything else
// (network, expired JWT, 5xx) is transient and keeps the item queued.
const isPermanent = (e: unknown) => /^(23|42|P0)/.test(String((e as { code?: string })?.code ?? ""));

let running: Promise<void> | null = null;
export function sync(remote: Remote): Promise<void> {
  return (running ??= doSync(remote).finally(() => (running = null)));
}

async function doSync(remote: Remote) {
  // 1. push, in order. Last-write-wins: the upsert overwrites. ponytail: no per-field merge across devices.
  for (let item = await db.outbox.orderBy("seq").first(); item; item = await db.outbox.orderBy("seq").first()) {
    try {
      if (item.op === "upsert") await remote.upsert(item.table, item.row);
      else await db.profile.put(await remote.recordReview(item.args));
    } catch (e) {
      if (!isPermanent(e)) return; // offline or transient: retry next time
      console.warn("dropping unsyncable change", item, e);
    }
    await db.outbox.delete(item.seq!);
  }
  // 2. pull (outbox is empty, so nothing local can be clobbered)
  for (const table of ["decks", "cards"] as const) {
    const key = `since:${table}`;
    const since = (await db.meta.get(key))?.value ?? "1970-01-01T00:00:00.000Z";
    let latest = since;
    for (let offset = 0; ; ) {
      const rows = await remote.pull(table, since, offset);
      await (db[table] as Table<Row, string>).bulkPut(rows);
      for (const r of rows) if ((r.updated_at as string) > latest) latest = r.updated_at as string;
      if (rows.length < PAGE) break;
      offset += rows.length;
    }
    await db.meta.put({ key, value: latest });
  }
  await db.profile.put(await remote.pullProfile());
}
export const PAGE = 1000;

export const clearLocal = () => Promise.all([db.decks, db.cards, db.profile, db.outbox, db.meta].map((t) => t.clear()));
