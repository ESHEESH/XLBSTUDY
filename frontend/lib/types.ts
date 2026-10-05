export type Deck = { id: string; title: string; source: string; updated_at: string; deleted_at?: string | null };
export type CardRow = {
  id: string; deck_id: string; kind: "basic" | "cloze"; front: string; back: string;
  due: string; stability: number; difficulty: number; reps: number; lapses: number;
  state: number; learning_steps: number; last_review: string | null; updated_at: string; deleted_at?: string | null;
};
