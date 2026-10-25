// The trace of formal/Send.tla in the model's terms (tools/trace_check.mjs): the screen test tests/ui/trace.spec.mjs
// writes it (tests/ui/lib/trace.mjs). One episode is followed: its text on the branch, as read, in the draft and in
// the text box, each as the set of its letters; the commits by their number on the branch (the first one 0)
import { CONSTANTS, bool, letters, rec, str } from './tla.mjs';

/** @param {{ n: number, text: string }} c */
const commit = c => rec({ n: String(c.n), text: letters(c.text) });
/** @param {{ text: string, base: string } | null} d */
const draft = d => (d ? rec({ has: 'TRUE', text: letters(d.text), base: letters(d.base) }) : rec({ has: 'FALSE', text: '{}', base: '{}' }));

/** @param {any[]} lines @returns {{ data: string }} */
export function toModel(lines) {
  const records = lines.map(l =>
    rec({
      a: str(l.a),
      ...('gh' in l && { gh: commit(l.gh) }),
      ...('read' in l && { read: commit(l.read) }),
      ...('draft' in l && { draft: draft(l.draft) }),
      ...('screen' in l && { screen: letters(l.screen) }),
      ...('composing' in l && { composing: bool(l.composing) }),
    }),
  );
  return { data: `${CONSTANTS}\nTrace == <<\n  ${records.join(',\n  ')}\n>>\n` };
}
