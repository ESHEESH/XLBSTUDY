"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { syncNow } from "@/lib/remote";
import { useProfile } from "@/lib/useProfile";

export default function Onboarding() {
  const router = useRouter();
  const profile = useProfile();
  const [name, setName] = useState<string | null>(null);
  const [goal, setGoal] = useState(20);

  async function finish() {
    if (!profile) return;
    await supabase
      .from("profiles")
      .update({ display_name: name ?? profile.display_name, daily_goal: goal, onboarded: true })
      .eq("id", profile.id);
    await syncNow();
    router.replace("/import");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1>Welcome</h1>
      <label className="flex flex-col gap-2 text-sm text-muted">
        Your name (shown on the leaderboard)
        <input className="field text-fg" value={name ?? profile?.display_name ?? ""} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-2 text-sm text-muted">
        Daily goal: <b className="text-fg">{goal} cards</b>
        <input type="range" min={5} max={100} step={5} value={goal} onChange={(e) => setGoal(+e.target.value)} />
      </label>
      <button className="btn" disabled={!profile} onClick={finish}>Import your first deck</button>
    </main>
  );
}
