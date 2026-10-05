import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Same-origin /api on Vercel; set NEXT_PUBLIC_API_URL=http://localhost:8000/api for plain local dev.
export const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

/** fetch against the FastAPI backend with the user's JWT. */
export async function api(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(API + path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${data.session?.access_token}` },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
  return res;
}
