# XLBSTUDY — Build Plan

Personal Gizmo-style study app: AI import → flashcards → spaced repetition → gamification. Works offline (limited).

## Architecture (the short version)

```
Next.js (PWA, Vercel) ──► Supabase (Postgres + Auth + RLS)   ← all CRUD goes here directly
        │  (Dexie/IndexedDB mirror for offline)
        └──► FastAPI (stateless) ──► Gemini                   ← only AI calls go here
```

- **FastAPI has no DB access.** It receives a file/URL/text and returns cards as JSON. The frontend saves them through Supabase. RLS already controls access, so the backend needs no DB credentials.
- **Gemini key lives only in `backend/.env`.** It is never added to the frontend and never prefixed with `NEXT_PUBLIC_`.
- **Spaced repetition runs on the client** (`ts-fsrs`), so reviews work offline without extra work.

## Stack decisions (deviations from the brief, on purpose)

| Brief said | Doing instead | Why / when to revisit |
|---|---|---|
| Custom login system | **Supabase Auth** (email + Google) | It's already in the stack. A custom auth system is more code and more security risk. |
| Whisper for audio | **Gemini native audio input** | Gemini can transcribe and generate cards in one call, so no second API is needed. |
| YouTube transcript scraping | **Gemini native YouTube URL input** | Gemini accepts a public YouTube URL directly, so no scraper is needed. Private/unlisted videos won't work. |
| PDF parser | **Gemini native PDF input** | No parsing library needed. DOCX/PPTX → `python-docx` / `python-pptx` text extraction (~10 lines). |
| Redis + Celery/ARQ | **Skip.** Plain synchronous FastAPI request | For one user, one Gemini call takes 10–60 s, which is fine. Add ARQ when requests time out (inputs over 1 hour of audio) or when there are multiple concurrent users. |
| Reanimated | **Framer Motion (`motion`)** | Reanimated is React Native only. It doesn't work in Next.js. |
| SuperMemo/Anki algorithm | **FSRS** (`ts-fsrs`) | Modern Anki default. Better than SM-2, and the library is already written. |
| Premium subscription to skip heart wait | **Skip** | Personal app. Add Stripe if it ever has users. |
| `next-pwa` | **hand-written `public/sw.js`** | Serwist's Next plugin is webpack-only; Next 16 builds with Turbopack. ~25 lines is enough for an app-shell cache. |

## Data model (Supabase / Postgres)

All IDs are **client-generated UUIDs**, so cards can be created offline. Every mutable table has `updated_at` and `deleted_at` (soft delete), which sync needs.

```sql
profiles     (id uuid pk = auth.users.id, display_name, daily_goal int default 20,
              onboarded bool default false, hearts int default 5, hearts_updated_at timestamptz,
              streak int default 0, last_study_date date, xp int default 0, updated_at)
decks        (id uuid pk, user_id, title, source text,  -- 'manual'|'pdf'|'youtube'|'audio'|'anki'|'quizlet'|...
              created_at, updated_at, deleted_at)
cards        (id uuid pk, deck_id, user_id, kind text check (kind in ('basic','cloze')),
              front text, back text,           -- cloze: front = "The {{c1::mitochondria}} is ..."
              due timestamptz, stability float, difficulty float, reps int, lapses int,
              state int, last_review timestamptz,   -- ts-fsrs Card fields, 1:1
              updated_at, deleted_at)
review_logs  (id uuid pk, card_id, user_id, rating int, reviewed_at timestamptz, xp int)  -- append-only
```

- RLS on every table: `user_id = auth.uid()` (`id = auth.uid()` on `profiles`).
- Trigger: on `auth.users` insert → create `profiles` row.
- Leaderboard = a view: `sum(xp) from review_logs where reviewed_at >= date_trunc('week', now()) group by user_id`. It needs a `security definer` function, because RLS hides other users' logs. Expose only display_name + weekly xp.
- Level is derived from `xp`, for example `floor(sqrt(xp / 100))`. It's computed, not stored.
- Hearts are computed from timestamps when read: `min(5, hearts + floor((now - hearts_updated_at) / 10 min))`. No cron needed.

## Backend API (FastAPI, ~5 endpoints)

Every endpoint verifies the Supabase JWT (`PyJWT` + `PyJWKClient` against `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`) so strangers can't spend your Gemini quota.

| Endpoint | Input | Output |
|---|---|---|
| `POST /generate/file` | multipart: PDF / DOCX / PPTX / TXT / audio (webm, mp3, m4a) | `{title, cards:[{kind, front, back}]}` |
| `POST /generate/youtube` | `{url}` | same |
| `POST /generate/text` | `{text}` (pasted notes) | same |
| `POST /tutor` | `{card, messages[], mode: "eli5"|"steps"|"free"}` | streamed text (SSE) |
| `GET /health` | – | `ok` |

- Gemini SDK: `google-genai`. Use **structured output** (`response_schema` = Pydantic model), not JSON-in-prompt parsing.
- One prompt asks for a mix of `basic` and `cloze` cards. Cloze uses Anki syntax `{{c1::answer}}`, so Anki import and export use the same format.
- Model name comes from `GEMINI_MODEL` env var. Check which model is current when implementing.
- **Imports that don't need AI run in the browser** (no backend call):
  - Quizlet: user pastes Quizlet's "Export" text (tab between term/definition, newline between cards). Split it with `split`.
  - Anki `.apkg`: it's a zip containing SQLite. Parse it with `jszip` + `sql.js` in the browser, or with stdlib `zipfile` + `sqlite3` as a 6th backend endpoint. Ask the user to tick "Support older Anki versions" on export so the file is plain `collection.anki2` and not zstd-compressed.

## Offline mode

| Works offline | Online only |
|---|---|
| Studying due cards, FSRS scheduling, cloze quizzes | All AI: import, YouTube, audio, tutor |
| Create / edit cards manually | Login (first time), leaderboard |
| XP, streak, hearts (local calc) | Anki/Quizlet import (fine offline if done in-browser, a free bonus) |

- **Serwist** service worker caches the app shell.
- **Dexie** (IndexedDB) mirrors `decks`, `cards`, `profiles`. An `outbox` table holds pending writes.
- Sync: when online, push the outbox (upserts + `review_logs` inserts), then pull rows with `updated_at > last_sync`. Conflicts: last-write-wins on `updated_at`. `review_logs` is append-only, so it never conflicts.
- Supabase session persists in localStorage, so a logged-in user stays logged in offline.

## Frontend pages (Next.js App Router + Tailwind + motion)

- `/login`: Supabase Auth UI (email magic link + Google)
- `/onboarding`: name, daily goal, "import your first deck" CTA. Sets `onboarded=true`.
- `/` dashboard: due today, streak, XP/level bar, hearts, decks list, "Magic Import" button
- `/import`: tabs for Upload file · YouTube · Record audio (`MediaRecorder`, native) · Paste text · Quizlet · Anki. Preview the generated cards → edit → save.
- `/deck/[id]`: card list, edit/delete, "Study" button
- `/study/[deckId]`: review loop. Basic card = flip, then rate Again/Hard/Good/Easy. Cloze card = text input per blank, auto-graded (case/whitespace-insensitive), with a manual override. A wrong answer costs a heart. "Ask tutor" opens a drawer.
- `/leaderboard`: weekly XP ranking

## Phases

Each phase ends in something usable. Do them in order.

**Phase 0 — Setup** ✅ partly done
- [x] Repo initialised, remote → `ESHEESH/XLBSTUDY`, `.gitignore`, `backend/.env` (holds the key, ignored by git), `.env.example` files
- [ ] Create Supabase project → fill `SUPABASE_URL` + anon key
- [x] `supabase/migrations/0001_init.sql`: tables, RLS, profile trigger, leaderboard function (schema above)
- [x] `npx create-next-app@latest frontend --ts --tailwind --app` (merge with existing `frontend/.env.example`)
- [x] `backend/`: `main.py`, `requirements.txt` (`fastapi uvicorn[standard] google-genai pyjwt[crypto] python-multipart python-docx python-pptx python-dotenv`), CORS from `ALLOWED_ORIGINS`

**Phase 1 — Auth, onboarding, dashboard, manual decks**
- Supabase client (`@supabase/ssr`), middleware redirects: not logged in → `/login`, not onboarded → `/onboarding`
- Deck + card CRUD straight to Supabase. Use client UUIDs (`crypto.randomUUID()`) from day one.

**Phase 2 — Study engine**
- `ts-fsrs` review loop, basic + cloze rendering, write `review_logs`
- XP per review (e.g. Again 1, Hard 3, Good 5, Easy 5), streak update on first review of the day
- ✅ check: a tiny test that a cloze string parses to the right blanks and that grading ignores case/whitespace

**Phase 3 — Magic Import (the hook)**
- FastAPI `/generate/*` + JWT check. Then the `/import` page with preview/edit before save.
- Order: paste text → PDF → DOCX/PPTX → YouTube → audio recorder → Quizlet paste → Anki `.apkg`
- ✅ check: `__main__` self-check that the Pydantic card schema rejects a card with no answer

**Phase 4 — AI Tutor**
- `/tutor` streaming endpoint. Drawer in the study screen with "Explain like I'm 5", "Step by step", free chat. The current card's text is passed as context.

**Phase 5 — Offline**
- Serwist + Dexie mirror + outbox sync (see Offline section). Online-only buttons are disabled when `navigator.onLine === false`.
- ✅ check: sync test that an outbox review created offline appears in Supabase after reconnect

**Phase 6 — Gamification polish**
- Hearts (lose on wrong, regen 1 per 10 min, locked screen with countdown at 0)
- Level-up + streak animations (motion), weekly leaderboard page
- Leagues/tiers (Bronze → Diamond, promote top N weekly) only once there are other users. A weekly ranking covers it until then.

**Phase 7 — Deploy**
- Frontend → Vercel. Backend → Render / Railway / Fly (any free tier that allows requests over 60 s). Set env vars there, not in the repo.

## Deploy runbook (Phase 7)

1. **Supabase:** run `0001_init.sql` then `0002_hardening.sql` (SQL editor). Auth → URL config: set Site URL to the Vercel URL and add `https://<vercel-url>/auth/callback` as a redirect. Enable Google provider if wanted.
2. **Vercel (one project, two services, see `vercel.json`):** import the repo; Vercel builds `backend` (FastAPI, public under `/api`) and `frontend` (Next.js, everything else). Env vars on the project: `GEMINI_API_KEY` (rotated), `GEMINI_MODEL`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Leave `NEXT_PUBLIC_API_URL` unset (defaults to same-origin `/api`). `ALLOWED_ORIGINS` is unneeded (same origin). Check `GET /api/health`. The `backend/Dockerfile` is the fallback for Render/Fly; there, set `NEXT_PUBLIC_API_URL=https://<backend>/api`.
3. **Limits to know:** Vercel Functions cap request bodies at ~4.5 MB, so large PDF/audio uploads (plan assumed 20 MB) will fail there; and the in-memory rate limiter is per instance.
4. Smoke test: log in, import pasted text, study a card, go offline in DevTools and study, reconnect and confirm XP syncs.

## Security notes

- XP, hearts, streak and last_study_date are written only by the `record_review()` SQL function (`0002_hardening.sql`); clients have no UPDATE grant on those columns and no INSERT on `review_logs`.
- Backend: per-user rate limits (10/min generate, 30/min tutor), body-size cap, bounded + role-checked tutor messages, OpenAPI docs disabled.

- The Gemini key was pasted into a chat. It's only stored in the git-ignored `backend/.env`, but **rotate it** in Google AI Studio before going public.
- Never commit `.env`. Never put the Gemini key in the frontend.
- Validate upload size (~20 MB inline limit; use the Gemini Files API above that) and file type in FastAPI.
