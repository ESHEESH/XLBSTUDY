"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { newCard, saveCards, saveDeck } from "@/lib/offline";
import { syncNow } from "@/lib/remote";
import { api } from "@/lib/supabase";
import { useOnline } from "@/lib/useOnline";

type Draft = { kind: "basic" | "cloze"; front: string; back: string };
type Result = { title: string; cards: Draft[]; source: string };
const TABS = ["File", "YouTube", "Record", "Paste", "Quizlet"] as const;
type Tab = (typeof TABS)[number];

const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Quizlet export: tab between term/definition, newline between cards. Runs in-browser, works offline. */
function parseQuizlet(text: string): Draft[] {
  return text.split("\n").map((l) => l.split("\t")).filter((p) => p.length >= 2 && p[0].trim() && p[1].trim())
    .map(([front, back]) => ({ kind: "basic", front: front.trim(), back: back.trim() }));
}

export default function Import() {
  const router = useRouter();
  const online = useOnline();
  const [tab, setTab] = useState<Tab>("File");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);

  async function run(source: string, job: () => Promise<{ title: string; cards: Draft[] }>) {
    setBusy(true); setErr("");
    try { setRes({ ...(await job()), source }); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  const upload = (file: File, source: string) =>
    run(source, async () => {
      const fd = new FormData();
      fd.append("file", file);
      return (await api("/generate/file", { method: "POST", body: fd })).json();
    });

  async function toggleRecord() {
    if (rec.current?.state === "recording") { rec.current.stop(); return; }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      upload(new File(chunks, "recording.webm", { type: "audio/webm" }), "audio");
    };
    r.start();
    rec.current = r;
    setRecording(true);
  }

  async function save() {
    if (!res) return;
    setBusy(true);
    const deckId = crypto.randomUUID();
    await saveDeck({ id: deckId, title: res.title, source: res.source });
    await saveCards(res.cards.map((x) => newCard({ id: crypto.randomUUID(), deck_id: deckId, ...x })));
    syncNow();
    router.push(`/deck/${deckId}`);
  }
  const patch = (i: number, p: Partial<Draft>) => setRes((r) => r && { ...r, cards: r.cards.map((c, j) => (j === i ? { ...c, ...p } : c)) });

  if (res) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pt-10">
        <input className="field text-xl font-semibold" value={res.title} onChange={(e) => setRes({ ...res, title: e.target.value })} aria-label="Deck title" />
        <p className="text-sm text-muted">{res.cards.length} cards. Edit or remove anything before saving.</p>
        {res.cards.map((c, i) => (
          <div key={i} className="card flex gap-3 p-3">
            <div className="flex flex-1 flex-col gap-2">
              <textarea className="field" value={c.front} onChange={(e) => patch(i, { front: e.target.value })} />
              {c.kind === "basic" && <textarea className="field" value={c.back} onChange={(e) => patch(i, { back: e.target.value })} />}
            </div>
            <button className="self-start text-sm text-bad" onClick={() => setRes({ ...res, cards: res.cards.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        {err && <p role="alert" className="text-bad">{err}</p>}
        <div className="glass sticky bottom-16 flex gap-2 rounded-full p-2">
          <button className="btn-ghost" onClick={() => setRes(null)}>Discard</button>
          <button className="btn flex-1" disabled={busy || !res.cards.length} onClick={save}>Save deck</button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pt-10">
      <h1>Magic Import</h1>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? "btn" : "btn-ghost"} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <section className="card flex flex-col gap-4 p-5">
        {tab === "File" && (
          <>
            <p className="text-sm text-muted">PDF, DOCX, PPTX, TXT or an audio file (up to 20 MB).</p>
            <input type="file" disabled={!online} accept=".pdf,.docx,.pptx,.txt,.mp3,.m4a,.webm,.wav" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], e.target.files[0].name.split(".").pop()!)} />
          </>
        )}
        {tab === "YouTube" && (
          <>
            <input className="field" placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <p className="text-sm text-muted">Public videos only.</p>
            <button className="btn" disabled={!online || busy || !url} onClick={() => run("youtube", async () => (await api("/generate/youtube", json({ url }))).json())}>Generate cards</button>
          </>
        )}
        {tab === "Record" && (
          <button className={recording ? "btn !bg-bad" : "btn"} disabled={!online || busy} onClick={toggleRecord}>{recording ? "Stop & generate" : "Start recording"}</button>
        )}
        {tab === "Paste" && (
          <>
            <textarea className="field" rows={8} placeholder="Paste your notes" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn" disabled={!online || busy || !text.trim()} onClick={() => run("manual", async () => (await api("/generate/text", json({ text }))).json())}>Generate cards</button>
          </>
        )}
        {tab === "Quizlet" && (
          <>
            <textarea className="field" rows={8} placeholder={"term\tdefinition\nterm\tdefinition"} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="text-sm text-muted">In Quizlet: ⋯ → Export, then paste here. No AI used.</p>
            <button className="btn" disabled={busy || !text.trim()} onClick={() => run("quizlet", async () => {
              const cards = parseQuizlet(text);
              if (!cards.length) throw new Error("No term/definition pairs found (need a tab between them).");
              return { title: "Quizlet import", cards };
            })}>Preview</button>
          </>
        )}
        {!online && tab !== "Quizlet" && <p className="text-sm text-muted">AI import needs a connection. Quizlet import works offline.</p>}
        {busy && <p role="status" className="text-sm text-muted">Working… this can take up to a minute.</p>}
        {err && <p role="alert" className="text-sm text-bad">{err}</p>}
      </section>
    </main>
  );
}
