"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { db, saveDeck } from "@/lib/offline";
import { syncNow } from "@/lib/remote";
import { useProfile } from "@/lib/useProfile";
import { hearts, level, levelProgress, MAX_HEARTS } from "@/lib/game";

export default function Dashboard() {
  const router = useRouter();
  const profile = useProfile();
  const [title, setTitle] = useState("");
  const decks = useLiveQuery(() => db.decks.filter((d) => !d.deleted_at).toArray()) ?? [];
  const due = useLiveQuery(async () => {
    const counts: Record<string, number> = {};
    const t = new Date().toISOString();
    await db.cards.filter((c) => !c.deleted_at && c.due <= t).each((c) => (counts[c.deck_id] = (counts[c.deck_id] ?? 0) + 1));
    return counts;
  }) ?? {};

  useEffect(() => {
    if (profile && !profile.onboarded) router.replace("/onboarding");
  }, [profile, router]);

  async function addDeck(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const id = crypto.randomUUID();
    await saveDeck({ id, title: title.trim() });
    syncNow();
    router.push(`/deck/${id}`);
  }

  async function signOut() {
    await syncNow(); // don't strand queued reviews
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const totalDue = Object.values(due).reduce((a, b) => a + b, 0);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 pt-10">
      <header className="flex items-end justify-between">
        <h1>Hi{profile?.display_name ? `, ${profile.display_name}` : ""}</h1>
        <button className="btn-ghost text-sm" onClick={signOut}>
          Sign out
        </button>
      </header>

      {profile && (
        <section className="card grid grid-cols-3 gap-4 p-5 text-center">
          <div>
            <div className="text-2xl font-bold">🔥 {profile.streak}</div>
            <div className="text-xs text-muted">day streak</div>
          </div>
          <div>
            <div className="text-2xl font-bold">Lv {level(profile.xp)}</div>
            <div className="mx-auto mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]">
              <div className="h-full bg-accent" style={{ width: `${levelProgress(profile.xp) * 100}%` }} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold">❤️ {hearts(profile)}/{MAX_HEARTS}</div>
            <div className="text-xs text-muted">hearts</div>
          </div>
        </section>
      )}

      <section className="card flex items-center justify-between p-5">
        <div>
          <div className="text-3xl font-bold">{totalDue}</div>
          <div className="text-sm text-muted">cards due today</div>
        </div>
        <Link href="/import" className="btn press">✨ Magic Import</Link>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Decks</h2>
        {decks.map((d) => (
          <Link key={d.id} href={`/deck/${d.id}`} className="card press flex items-center justify-between p-4">
            <span className="font-medium">{d.title}</span>
            <span className="text-sm text-muted">{due[d.id] ? `${due[d.id]} due` : "Up to date"}</span>
          </Link>
        ))}
        {!decks.length && <p className="text-muted">No decks yet. Try Magic Import or create one below.</p>}
        <form onSubmit={addDeck} className="flex gap-2">
          <input className="field" placeholder="New deck title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn">Add</button>
        </form>
      </section>
    </main>
  );
}
