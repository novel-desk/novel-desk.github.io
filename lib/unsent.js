// 未送信の一覧 as it is drawn (FR-SAVE-09; ui/unsent.js shows it; no screen, no state of the app: tested by itself in
// tests/unit): each change not sent with its button to give it up, each text set aside with what can be done with it,
// and what is asked before one is given up
import { kindsOf } from './commit.js';
import { esc, whenLong } from './format.js';

/** @typedef {import('./changes.js').Unsent} Unsent */
/** @typedef {import('./drafts.js').Draft} Draft */

const KIND = { A: '追加', D: '削除', M: '書き換え' };

// The rows of the changes not sent: a text written (its episode or file, as `said` names a path), or an operation
// (the files it moves, adds or deletes, and the keys of novel.toml it sets)
/** @param {Unsent[]} items @param {(path: string) => string} said */
export function unsentRows(items, said) {
  return items
    .map((it, i) => {
      if (it.kind === 'text')
        return `<div class="unsent-item"><div><b>${esc(said(it.path))}</b><small>書いた文章</small></div><button class="ghost danger" data-discard="${i}">取り消す</button></div>`;
      const lines = kindsOf(it.changes).map(k => (k.kind === 'R' ? `${esc(said(k.path))} → ${esc(k.to)}` : `${esc(said(k.path))}（${KIND[k.kind]}）`));
      if (it.keys) lines.push(`novel.toml の設定 ${it.keys} か所`);
      return `<div class="unsent-item"><div><b>操作</b><small>${lines.join('<br>')}</small></div><button class="ghost danger" data-discard="${i}">取り消す</button></div>`;
    })
    .join('');
}

// The cards of the texts set aside (as the server version's card of a draft set aside), shown whole: sent beside what
// is there now (not when the work is not synced), put at the end of the episode open (only with one open), or given up
/** @param {Draft[]} aside @param {{ send: boolean, put: boolean }} can @param {number} [now] */
export function parkedCards(aside, can, now = Date.now()) {
  return aside
    .map(
      (d, i) =>
        `<div class="card"><b>${esc(d.path)}</b><small class="muted">${esc(whenLong(d.at, now))} に保留</small>
      <small class="muted">${esc(/** @type {string} */ (d.parked))}ため、送れませんでした</small>
      <textarea class="version-text" readonly>${esc(/** @type {string} */ (d.text))}</textarea>
      <div class="gh-actions">${can.send ? `<button data-unpark-send="${i}">送信（GitHub の版と並べて残す）</button>` : ''}${can.put ? `<button data-unpark-put="${i}">開いている話の末尾に挿入</button>` : ''}
      <button class="ghost" data-unpark-drop="${i}">破棄</button></div></div>`,
    )
    .join('');
}

// what is asked before a change not sent is given up (a text: its episode or file, as `said` names a path)
/** @param {Unsent} it @param {(path: string) => string} said */
export const discardQuestion = (it, said) =>
  it.kind === 'op'
    ? 'この操作を取り消しますか？（その中で書いた文章は、元の話に残ります）'
    : `「${said(it.path)}」に書いた文章を捨てますか？（GitHub の版に戻ります。捨てた文章はこの端末の履歴に残ります）`;

// the button of a card of a text set aside, pressed: what it does and which text (from its data- attributes)
/** @param {{ unparkSend?: string, unparkPut?: string, unparkDrop?: string }} data @returns {{ how: 'send' | 'put' | 'drop', i: number }} */
export function unparkOf(data) {
  const how = data.unparkSend ? 'send' : data.unparkPut ? 'put' : 'drop';
  return { how, i: Number(data.unparkSend ?? data.unparkPut ?? data.unparkDrop) };
}
