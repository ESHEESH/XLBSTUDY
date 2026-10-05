export type Part = string | { id: number; answer: string };

const RE = /\{\{c(\d+)::(.*?)(?:::.*?)?\}\}/g;

/** "The {{c1::heart}} pumps" -> ["The ", {id:1, answer:"heart"}, " pumps"] */
export function parseCloze(front: string): Part[] {
  const out: Part[] = [];
  let last = 0;
  for (const m of front.matchAll(RE)) {
    out.push(front.slice(last, m.index), { id: +m[1], answer: m[2] });
    last = m.index + m[0].length;
  }
  out.push(front.slice(last));
  return out.filter((p) => p !== "");
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const grade = (input: string, answer: string) => norm(input) === norm(answer);

// Phase 2 check: run `node lib/cloze.test.ts`
