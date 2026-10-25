// The trace of formal/Rebase.tla in the model's terms (tools/trace_check.mjs): the screen test tests/ui/trace.spec.mjs
// writes it (tests/ui/lib/trace.mjs). One episode is followed, renamed from "a" to "b": the files at the two paths on
// the branch and as read (a text is the set of its letters), and the changes not sent there
import { CONSTANTS, bool, letters, rec, str } from './tla.mjs';

/** @param {string | null} text a file's text (null: no file) */
const file = text => rec({ has: bool(text !== null), text: letters(text ?? '') });
/** @param {{ n: number, a: string | null, b: string | null }} c */
const commit = c => rec({ n: String(c.n), f: `[p \\in {"a", "b"} |-> IF p = "a" THEN ${file(c.a)} ELSE ${file(c.b)}]` });
/** @param {{ kind: string, text: string, base: string | null, op: boolean }} c */
const change = c => rec({ kind: str(c.kind), text: letters(c.text), base: file(c.base), op: bool(c.op) });

/** @param {any[]} lines @returns {{ data: string }} */
export function toModel(lines) {
  const records = lines.map(l =>
    rec({
      a: str(l.a),
      ...('gh' in l && { gh: commit(l.gh) }),
      ...('read' in l && { read: commit(l.read) }),
      ...('ch' in l && { ch: `[p \\in {"a", "b"} |-> IF p = "a" THEN ${change(l.ch.a)} ELSE ${change(l.ch.b)}]` }),
    }),
  );
  return { data: `${CONSTANTS}\nTrace == <<\n  ${records.join(',\n  ')}\n>>\n` };
}
