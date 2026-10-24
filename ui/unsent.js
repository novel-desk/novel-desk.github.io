// 未送信の一覧 (FR-SAVE-09): the changes not sent, each read before it is sent or given up: a text written (its
// episode or file), or an operation (the files it moves, adds or deletes, and the keys of novel.toml it sets). One given
// up goes from this device; the text written in an operation's files stays as a draft
import { kindsOf } from '../lib/commit.js';
import { esc } from '../lib/format.js';
import { $ } from './dom.js';
import { api } from './shared.js';

const dialog = () => /** @type {HTMLDialogElement} */ (/** @type {unknown} */ ($('unsent')));
/** @type {ReturnType<typeof api.unsentItems>} */
let items = [];
// a path as the list says it: an episode by its title, anything else by its path
/** @param {string} path */
const said = path => api.episodes().find(e => e.path === path)?.title ?? path;
function render() {
  items = api.unsentItems();
  $('unsent-body').innerHTML = items.length
    ? items
        .map((it, i) => {
          if (it.kind === 'text')
            return `<div class="unsent-item"><div><b>${esc(said(it.path))}</b><small>書いた文章</small></div><button class="ghost danger" data-discard="${i}">取り消す</button></div>`;
          const lines = kindsOf(it.changes).map(k =>
            k.kind === 'R' ? `${esc(said(k.path))} → ${esc(k.to)}` : `${esc(said(k.path))}（${{ A: '追加', D: '削除', M: '書き換え' }[k.kind]}）`,
          );
          if (it.keys) lines.push(`novel.toml の設定 ${it.keys} か所`);
          return `<div class="unsent-item"><div><b>操作</b><small>${lines.join('<br>')}</small></div><button class="ghost danger" data-discard="${i}">取り消す</button></div>`;
        })
        .join('')
    : '<p class="muted small">未送信の変更はありません。</p>';
}
/** @param {number} i */
async function discard(i) {
  const it = items[i];
  const what =
    it.kind === 'op'
      ? 'この操作を取り消しますか？（その中で書いた文章は、元の話に残ります）'
      : `「${said(it.path)}」に書いた文章を捨てますか？（GitHub の版に戻ります。捨てた文章はこの端末の履歴に残ります）`;
  if (!confirm(what)) return;
  if (it.kind === 'text') {
    const text = (await api.texts([it.path]))[it.path];
    if (text !== null) await api.snapshot(it.path, text, true);
  }
  await api.discard(it);
  if (api.unsent()) render();
  else dialog().close();
}
export function wireUnsent() {
  $('open-unsent').addEventListener('click', () => {
    render();
    dialog().showModal();
  });
  $('close-unsent').addEventListener('click', () => dialog().close());
  $('unsent-body').addEventListener('click', e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-discard]');
    if (b instanceof HTMLElement) void discard(Number(b.dataset.discard));
  });
}
