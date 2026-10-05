"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const redirectTo = () => `${location.origin}/auth/callback`;

  async function magic(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setMsg(error ? error.message : "Check your email for the sign-in link.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1>XLBSTUDY</h1>
      <p className="text-muted">Turn anything into flashcards. Remember it for good.</p>
      <form onSubmit={magic} className="flex flex-col gap-3">
        <input className="field" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn">Email me a link</button>
      </form>
      <button
        className="btn-ghost"
        onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } })}
      >
        Continue with Google
      </button>
      {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
    </main>
  );
}
