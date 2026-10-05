"use client";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { db, deleteCard, deleteDeck, newCard, saveCard } from "@/lib/offline";
import { syncNow } from "@/lib/remote";
import type { CardRow } from "@/lib/types";

export default function DeckPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const title = useLiveQuery(async () => (await db.decks.get(id))?.title, [id]) ?? "";
  const cards = useLiveQuery(() => db.cards.where("deck_id").equals(id).filter((c) => !c.deleted_at).sortBy("updated_at"), [id]) ?? [];
  const [kind, setKind] = useState<"basic" | "cloze">("basic");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [editing, setEditing] = useState<CardRow | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!front.trim()) return;
    await saveCard(newCard({ id: crypto.randomUUID(), deck_id: id, kind, front: front.trim(), back: back.trim() }));
    setFront(""); setBack("");
    syncNow();
  }
  async function save() {
    if (!editing) return;
    await saveCard(editing);
    setEditing(null);
    syncNow();
  }
  async function remove(c: CardRow) {
    await deleteCard(c);
    syncNow();
  }
  async function removeDeck() {
    if (!confirm("Delete this deck and its cards?")) return; // destructive + irreversible from the UI
    await deleteDeck(id);
    syncNow();
    router.replace("/");
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pt-10">
      <Link href="/" className="text-sm text-accent">‹ Library</Link>
      <header className="flex items-end justify-between gap-3">
        <h1>{title}</h1>
        <Link href={`/study/${id}`} className="btn press">Study</Link>
      </header>

      <form onSubmit={add} className="card flex flex-col gap-3 p-4">
        <div className="flex gap-2">
          {(["basic", "cloze"] as const).map((k) => (
            <button type="button" key={k} onClick={() => setKind(k)} className={k === kind ? "btn" : "btn-ghost"}>{k}</button>
          ))}
        </div>
        <textarea className="field" rows={2} required placeholder={kind === "cloze" ? "The {{c1::mitochondria}} makes ATP" : "Front"} value={front} onChange={(e) => setFront(e.target.value)} />
        {kind === "basic" && <textarea className="field" rows={2} required placeholder="Back" value={back} onChange={(e) => setBack(e.target.value)} />}
        <button className="btn self-end">Add card</button>
      </form>

      <ul className="flex flex-col gap-2">
        {cards.map((c) => (
          <li key={c.id} className="card flex items-start justify-between gap-3 p-4">
            {editing?.id === c.id ? (
              <div className="flex flex-1 flex-col gap-2">
                <textarea className="field" value={editing.front} onChange={(e) => setEditing({ ...editing, front: e.target.value })} />
                {c.kind === "basic" && <textarea className="field" value={editing.back} onChange={(e) => setEditing({ ...editing, back: e.target.value })} />}
                <button className="btn self-end" onClick={save}>Save</button>
              </div>
            ) : (
              <>
                <div className="min-w-0">
                  <div className="font-medium">{c.front}</div>
                  {c.kind === "basic" && <div className="text-sm text-muted">{c.back}</div>}
                </div>
                <div className="flex shrink-0 gap-3 text-sm">
                  <button className="text-accent" onClick={() => setEditing(c)}>Edit</button>
                  <button className="text-bad" onClick={() => remove(c)}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <button className="self-start text-sm text-bad" onClick={removeDeck}>Delete deck</button>
    </main>
  );
}
