"use client";
import { motion } from "motion/react";
import { useState } from "react";
import { api } from "@/lib/supabase";
import type { CardRow } from "@/lib/types";

type Msg = { role: "user" | "model"; text: string };
const MODES = [
  { mode: "eli5", label: "Explain like I'm 5" },
  { mode: "steps", label: "Step by step" },
] as const;

export default function Tutor({ card, onClose }: { card: CardRow; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(mode: "eli5" | "steps" | "free", text?: string) {
    const history: Msg[] = text ? [...msgs, { role: "user", text }] : msgs;
    setMsgs([...history, { role: "model", text: "" }]);
    setBusy(true);
    try {
      const res = await api("/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card: { kind: card.kind, front: card.front, back: card.back || "-" }, messages: history, mode }),
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "", out = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop()!;
        for (const e of events) out += e.replace(/^data: /, "").replaceAll("\\n", "\n");
        setMsgs([...history, { role: "model", text: out }]);
      }
    } catch (e) {
      setMsgs([...history, { role: "model", text: `Tutor unavailable: ${(e as Error).message}` }]);
    }
    setBusy(false);
  }

  return (
    <>
      <motion.div className="fixed inset-0 z-30 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        className="glass fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[75vh] max-w-2xl flex-col gap-3 rounded-t-3xl p-5 shadow-2xl"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", bounce: 0, duration: 0.35 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.1, bottom: 0.6 }}
        onDragEnd={(_, i) => (i.velocity.y > 500 || i.offset.y > 120) && onClose()}
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[var(--line)]" />
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button key={m.mode} disabled={busy} className="btn-ghost text-sm" onClick={() => ask(m.mode, m.label)}>{m.label}</button>
          ))}
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto">
          {msgs.map((m, i) => (
            <p key={i} className={`whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "ml-10 bg-accent text-white" : "mr-10 bg-[var(--line)]"}`}>
              {m.text || "…"}
            </p>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim() && !busy) { ask("free", input.trim()); setInput(""); }
          }}
        >
          <input className="field" placeholder="Ask anything about this card" value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn" disabled={busy}>Send</button>
        </form>
      </motion.aside>
    </>
  );
}
