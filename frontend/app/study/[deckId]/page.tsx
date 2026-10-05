"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createEmptyCard, fsrs, Rating, type Card, type Grade, State } from "ts-fsrs";
import Tutor from "@/components/Tutor";
import { grade, parseCloze } from "@/lib/cloze";
import { hearts, level, nextHeartIn, XP } from "@/lib/game";
import { db, review } from "@/lib/offline";
import { syncNow } from "@/lib/remote";
import { useOnline } from "@/lib/useOnline";
import type { CardRow } from "@/lib/types";
import { useProfile } from "@/lib/useProfile";

const f = fsrs();
const spring = { type: "spring", bounce: 0, duration: 0.4 } as const;
const RATINGS: { r: Grade; label: string }[] = [
  { r: Rating.Again, label: "Again" },
  { r: Rating.Hard, label: "Hard" },
  { r: Rating.Good, label: "Good" },
  { r: Rating.Easy, label: "Easy" },
];

const toFsrs = (c: CardRow): Card => ({
  ...createEmptyCard(),
  due: new Date(c.due), stability: c.stability, difficulty: c.difficulty, reps: c.reps, lapses: c.lapses,
  state: c.state as State, learning_steps: c.learning_steps, last_review: c.last_review ? new Date(c.last_review) : undefined,
});

export default function Study() {
  const { deckId } = useParams<{ deckId: string }>();
  const profile = useProfile();
  const online = useOnline();
  const [queue, setQueue] = useState<CardRow[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [tutor, setTutor] = useState(false);
  const [gained, setGained] = useState(0);
  const [done, setDone] = useState(0);
  const [levelUp, setLevelUp] = useState(false);
  const [tick, setTick] = useState(0);
  const startXp = useRef<number | null>(null);

  useEffect(() => {
    if (!profile || queue) return;
    startXp.current = profile.xp;
    const t = new Date().toISOString();
    db.cards.where("deck_id").equals(deckId).filter((c) => !c.deleted_at && c.due <= t).sortBy("due")
      .then((cs) => setQueue(cs.slice(0, profile.daily_goal)));
  }, [profile, queue, deckId]);

  // 1s clock for the heart countdown
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  void tick;

  const card = queue?.[0];
  const parts = useMemo(() => (card?.kind === "cloze" ? parseCloze(card.front) : []), [card]);
  const blanks = parts.filter((p) => typeof p !== "string");
  const results = blanks.map((b, i) => grade(answers[i] ?? "", b.answer));
  const suggested = card?.kind === "cloze" ? (results.every(Boolean) ? Rating.Good : Rating.Again) : null;

  async function rate(r: Grade) {
    if (!card || !profile) return;
    const now = new Date();
    const { card: next } = f.next(toFsrs(card), now, r);
    const xp = XP[r];
    const fields = {
      due: next.due.toISOString(), stability: next.stability, difficulty: next.difficulty, reps: next.reps,
      lapses: next.lapses, state: next.state, learning_steps: next.learning_steps, last_review: now.toISOString(),
    };
    if (level(profile.xp + xp) > level(profile.xp)) setLevelUp(true);
    setGained((g) => g + xp);
    setDone((d) => d + 1);
    setRevealed(false);
    setAnswers([]);
    const soon = next.due.getTime() - now.getTime() < 20 * 60_000; // relearn again this session
    setQueue((q) => [...q!.slice(1), ...(soon ? [{ ...card, ...fields }] : [])]);
    await review(card, fields, r, now); // local first: works offline
    syncNow();
  }

  if (!profile || !queue) return <main className="grid min-h-screen place-items-center text-muted">Loading…</main>;

  const h = hearts(profile);
  if (h <= 0) {
    const s = Math.ceil(nextHeartIn(profile) / 1000);
    return (
      <main className="mx-auto grid min-h-screen max-w-sm place-content-center gap-4 px-6 text-center">
        <div className="text-6xl">💔</div>
        <h2>Out of hearts</h2>
        <p className="text-muted">Next heart in {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</p>
        <Link href="/" className="btn-ghost">Back to library</Link>
      </main>
    );
  }

  if (!card) {
    return (
      <main className="mx-auto grid min-h-screen max-w-sm place-content-center gap-4 px-6 text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.3, duration: 0.5 }} className="text-6xl">
          {done ? "🎉" : "✅"}
        </motion.div>
        <h2>{done ? `${done} cards reviewed` : "Nothing due"}</h2>
        {done > 0 && (
          <p className="text-muted">
            +{gained} XP · <motion.span className="inline-block" initial={{ scale: 0.5 }} animate={{ scale: [0.5, 1.4, 1] }} transition={{ delay: 0.3, duration: 0.5 }}>🔥 {profile.streak}</motion.span>
          </p>
        )}
        {levelUp && (
          <motion.p className="text-xl font-bold text-accent" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", bounce: 0.3, duration: 0.6, delay: 0.5 }}>
            Level up! Lv {level(profile.xp)}
          </motion.p>
        )}
        <Link href="/" className="btn">Done</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-5 px-5 py-6">
      <header className="flex items-center justify-between text-sm text-muted">
        <Link href={`/deck/${deckId}`} className="text-accent">✕ Exit</Link>
        <span>
          <motion.span key={h} className="inline-block" animate={{ x: [0, -4, 4, -3, 0] }} transition={{ duration: 0.3 }}>❤️ {h}</motion.span>
          {" "}· {queue.length} left · +{gained} XP
        </span>
      </header>

      <AnimatePresence mode="popLayout">
        <motion.section
          key={card.id + card.reps}
          className="card flex flex-1 flex-col justify-center gap-6 p-8 text-center"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={spring}
        >
          {card.kind === "basic" ? (
            <>
              <p className="text-2xl font-semibold leading-snug">{card.front}</p>
              {revealed && <p className="border-t border-[var(--line)] pt-6 text-xl text-muted">{card.back}</p>}
            </>
          ) : (
            <p className="text-xl leading-loose">
              {parts.map((p, i) => {
                if (typeof p === "string") return <span key={i}>{p}</span>;
                const bi = blanks.indexOf(p);
                return revealed ? (
                  <b key={i} className={results[bi] ? "text-good" : "text-bad"}>{p.answer}</b>
                ) : (
                  <input
                    key={i}
                    autoFocus={bi === 0}
                    className="mx-1 w-28 border-b-2 border-accent bg-transparent text-center outline-none"
                    value={answers[bi] ?? ""}
                    onChange={(e) => setAnswers((a) => Object.assign([...a], { [bi]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && setRevealed(true)}
                    aria-label={`Blank ${bi + 1}`}
                  />
                );
              })}
            </p>
          )}
        </motion.section>
      </AnimatePresence>

      {revealed ? (
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map(({ r, label }) => (
            <button key={r} onPointerDown={() => rate(r)} className={`${suggested === r ? "btn" : "btn-ghost"} !px-2`}>{label}</button>
          ))}
        </div>
      ) : (
        <button className="btn" onClick={() => setRevealed(true)}>{card.kind === "cloze" ? "Check" : "Show answer"}</button>
      )}
      <button className="btn-ghost self-center text-sm" disabled={!online} onClick={() => setTutor(true)}>Ask tutor</button>
      <AnimatePresence>{tutor && <Tutor card={card} onClose={() => setTutor(false)} />}</AnimatePresence>
    </main>
  );
}
