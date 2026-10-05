export const XP = { 1: 1, 2: 3, 3: 5, 4: 5 } as const; // by FSRS rating
export const MAX_HEARTS = 5;
export const HEART_MS = 10 * 60 * 1000;

export const level = (xp: number) => Math.floor(Math.sqrt(xp / 100));
/** progress 0..1 within the current level */
export const levelProgress = (xp: number) => {
  const l = level(xp), lo = l * l * 100, hi = (l + 1) ** 2 * 100;
  return (xp - lo) / (hi - lo);
};

export type Profile = {
  id: string; display_name: string | null; daily_goal: number; onboarded: boolean;
  hearts: number; hearts_updated_at: string; streak: number; last_study_date: string | null; xp: number;
};

/** Hearts regenerate 1 per 10 min, computed on read (no cron). */
export function hearts(p: Pick<Profile, "hearts" | "hearts_updated_at">, now = Date.now()) {
  const gained = Math.floor((now - new Date(p.hearts_updated_at).getTime()) / HEART_MS);
  return Math.min(MAX_HEARTS, p.hearts + Math.max(0, gained));
}
/** ms until the next heart, 0 if full */
export function nextHeartIn(p: Pick<Profile, "hearts" | "hearts_updated_at">, now = Date.now()) {
  if (hearts(p, now) >= MAX_HEARTS) return 0;
  return HEART_MS - ((now - new Date(p.hearts_updated_at).getTime()) % HEART_MS);
}

export const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local

/** New streak value when studying today. */
export function nextStreak(p: Pick<Profile, "streak" | "last_study_date">) {
  if (p.last_study_date === today()) return p.streak;
  const y = new Date(Date.now() - 864e5).toLocaleDateString("en-CA");
  return p.last_study_date === y ? p.streak + 1 : 1;
}

/** Profile patch after losing a heart; keeps partial regen progress. */
export function loseHeart(p: Pick<Profile, "hearts" | "hearts_updated_at">, now = Date.now()) {
  const h = hearts(p, now);
  const since = now - new Date(p.hearts_updated_at).getTime();
  const at = h >= MAX_HEARTS ? now : now - (since % HEART_MS);
  return { hearts: Math.max(0, h - 1), hearts_updated_at: new Date(at).toISOString() };
}
