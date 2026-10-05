"use client";
import { useEffect } from "react";
import { clearLocal, db } from "@/lib/offline";
import { syncNow } from "@/lib/remote";
import { supabase } from "@/lib/supabase";

const warmed = new Set<string>();

/** Pre-fetch pages so the service worker can serve them offline. */
async function warm() {
  if (!navigator.serviceWorker?.controller) return;
  const urls = ["/", "/import", "/leaderboard"];
  for (const d of await db.decks.toArray()) if (!d.deleted_at) urls.push(`/deck/${d.id}`, `/study/${d.id}`);
  for (const u of urls) if (!warmed.has(u)) { warmed.add(u); fetch(u).catch(() => warmed.delete(u)); }
}

export default function Sync() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") navigator.serviceWorker?.register("/sw.js");
    const run = async () => {
      const { data } = await supabase.auth.getSession(); // local read, works offline
      if (data.session && navigator.onLine) { await syncNow(); warm(); }
    };
    run();
    const t = setInterval(run, 30_000);
    addEventListener("online", run);
    const { data: sub } = supabase.auth.onAuthStateChange((ev) => {
      if (ev === "SIGNED_OUT") { clearLocal(); warmed.clear(); caches?.keys().then((ks) => ks.forEach((k) => caches.delete(k))); }
      if (ev === "SIGNED_IN") run();
    });
    return () => { clearInterval(t); removeEventListener("online", run); sub.subscription.unsubscribe(); };
  }, []);
  return null;
}
