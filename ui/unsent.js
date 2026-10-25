// 未送信の一覧 (FR-SAVE-09): the changes not sent, each read before it is sent or given up: a text written (its
// episode or file), or an operation (the files it moves, adds or deletes, and the keys of novel.toml it sets). One given
// up goes from this device; the text written in an operation's files stays as a draft. A text set aside (its file
// gone, or another file now, when it was to be sent) is shown whole, to be sent beside what is there now, put at the
// end of the episode open, or given up
import { kindsOf } from '../lib/commit.js';
import { esc, whenLong } from '../lib/format.js';
import { $ } from './dom.js';
import { api } from './shared.js';

const dialog = () => /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('unsent')));
/** @type {ReturnType<typeof api.unsentItems>} */
let items = [];
/** @type {import('../lib/drafts.js').Draft[]} */
let aside = [];
// a path as the list says it: an episode by its title, anything else by its path
/** @param {string} path */
const said = path => api.episodes().find(e => e.path === path)?.title ?? path;
// (opened, and drawn again, only while something is not sent: the button is hidden otherwise)
function render() {
  items = api.unsentItems();
  $('unsent-body').innerHTML = items
    .map((it, i) => {
      if (it.kind === 'text')
        return `<div class="unsent-item"><div><b>${esc(said(it.path))}</b><small>書いた文章</small></div><button class="ghost danger" data-discard="${i}">取り消す</button></div>`;
      const lines = kindsOf(it.changes).map(k =>
        k.kind === 'R' ? `${esc(said(k.path))} → ${esc(k.to)}` : `${esc(said(k.path))}（${{ A: '追加', D: '削除', M: '書き換え' }[k.kind]}）`,
      );
      if (it.keys) lines.push(`novel.toml の設定 ${it.keys} か所`);
      return `<div class="unsent-item"><div><b>操作</b><small>${lines.join('<br>')}</small></div><button class="ghost danger" data-discard="${i}">取り消す</button></div>`;
    })
    .join('');
  aside = [...api.parked()];
  const open = Boolean(api.current());
  $('unsent-body').innerHTML += aside
    .map(
      (d, i) =>
        // (as the server version's card of a draft set aside)
        `<div class="card"><b>${esc(d.path)}</b><small class="muted">${esc(whenLong(d.at))} に保留</small>
      <small class="muted">${esc(/** @type {string} */ (d.parked))}ため、送れませんでした</small>
      <textarea class="version-text" readonly>${esc(/** @type {string} */ (d.text))}</textarea>
      <div class="gh-actions">${api.mode() === 'off' ? '' : `<button data-unpark-send="${i}">送信（GitHub の版と並べて残す）</button>`}${open ? `<button data-unpark-put="${i}">開いている話の末尾に挿入</button>` : ''}
      <button class="ghost" data-unpark-drop="${i}">破棄</button></div></div>`,
    )
    .join('');
}
/** @param {number} i */
async function discard(i) {
  const it = items[i];
  const what =
    it.kind === 'op'
      ? 'この操作を取り消しますか？（その中で書いた文章は、元の話に残ります）'
      : `「${said(it.path)}」に書いた文章を捨てますか？（GitHub の版に戻ります。捨てた文章はこの端末の履歴に残ります）`;
  if (!confirm(what)) return;
  // (the text given up kept in the history: a text written alone always has one)
  if (it.kind === 'text') await api.snapshot(it.path, /** @type {string} */ (api.drafts().get(it.path)?.text), true);
  await api.discard(it);
  redraw();
}
// the list drawn again, or closed when nothing is left
function redraw() {
  if (api.unsent() || api.parked().length) render();
  else dialog().close();
}
// a text set aside, as the author chooses (put in the episode open: the list closed, to show it there)
/** @param {'send' | 'put' | 'drop'} how @param {number} i */
async function unpark(how, i) {
  const d = aside[i];
  if (how === 'drop' && !confirm('この書きかけを破棄しますか？（この端末の履歴に残ります）')) return;
  if (how === 'put') dialog().close();
  await api.unpark(d, how);
  if (how !== 'put') redraw();
}
export function wireUnsent() {
  $('open-unsent').addEventListener('click', () => {
    render();
    dialog().showModal();
  });
  $('close-unsent').addEventListener('click', () => dialog().close());
  $('unsent-body').addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    const b = t.closest('[data-discard]');
    if (b instanceof HTMLElement) void discard(Number(b.dataset.discard));
    const u = t.closest('[data-unpark-send], [data-unpark-put], [data-unpark-drop]');
    if (u instanceof HTMLElement) {
      const how = u.dataset.unparkSend ? 'send' : u.dataset.unparkPut ? 'put' : 'drop';
      void unpark(how, Number(u.dataset.unparkSend ?? u.dataset.unparkPut ?? u.dataset.unparkDrop));
    }
  });
}
