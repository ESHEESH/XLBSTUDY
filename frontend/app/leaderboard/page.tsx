"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useOnline } from "@/lib/useOnline";

type Row = { display_name: string | null; xp: number; is_me: boolean };

export default function Leaderboard() {
  const online = useOnline();
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    supabase.rpc("weekly_leaderboard").then(({ data }) => setRows(data ?? []));
  }, []);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pt-10">
      <h1>This week</h1>
      {!online && <p className="text-muted">The leaderboard needs a connection.</p>}
      {online && rows && !rows.length && <p className="text-muted">No reviews yet this week. Go study!</p>}
      <ol className="flex flex-col gap-2">
        {rows?.map((r, i) => (
          <li key={i} className={`card flex items-center justify-between p-4 ${r.is_me ? "ring-2 ring-accent" : ""}`}>
            <span><span className="mr-3 text-muted">{i + 1}</span>{r.display_name ?? "Anonymous"}</span>
            <b>{r.xp} XP</b>
          </li>
        ))}
      </ol>
    </main>
  );
}
