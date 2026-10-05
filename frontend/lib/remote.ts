import { supabase } from "./supabase";
import { PAGE, sync, type Remote } from "./offline";
import type { Profile } from "./game";

const iso = (v: unknown) => (typeof v === "string" ? new Date(v).toISOString() : v);
// Postgres returns "+00:00"; normalize so string comparison against local "Z" timestamps is valid.
const norm = (r: Record<string, unknown>) => ({
  ...r,
  ...Object.fromEntries(["due", "last_review", "updated_at", "created_at", "deleted_at"].filter((k) => r[k]).map((k) => [k, iso(r[k])])),
});

const ok = <T>(res: { data: T; error: { message: string; code?: string } | null }): T => {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data;
};

export const remote: Remote = {
  async upsert(table, row) {
    ok(await supabase.from(table).upsert(row));
  },
  async recordReview(a) {
    return ok(await supabase.rpc("record_review", { p_log_id: a.log_id, p_card_id: a.card_id, p_rating: a.rating, p_reviewed_at: a.reviewed_at, p_day: a.day })) as Profile;
  },
  async pull(table, since, offset) {
    const rows = ok(
      await supabase.from(table).select("*").gte("updated_at", since).order("updated_at").order("id").range(offset, offset + PAGE - 1),
    );
    return (rows ?? []).map(norm);
  },
  async pullProfile() {
    const { data } = await supabase.auth.getSession();
    return ok(await supabase.from("profiles").select("*").eq("id", data.session!.user.id).single()) as Profile;
  },
};

/** Fire-and-forget; safe to call after every write. */
export const syncNow = () => sync(remote).catch(() => {});
