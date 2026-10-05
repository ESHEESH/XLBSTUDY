import assert from "node:assert/strict";
import { grade, parseCloze } from "./cloze.ts";

assert.deepEqual(parseCloze("The {{c1::mitochondria}} makes {{c2::ATP::energy}}."), [
  "The ", { id: 1, answer: "mitochondria" }, " makes ", { id: 2, answer: "ATP" }, ".",
]);
assert.ok(grade("  Heart  ", "heart"));
assert.ok(grade("red   blood cell", "Red blood Cell"));
assert.ok(!grade("lung", "heart"));
console.log("ok");
