// プロット: the plot note as boxes (# 大箱, ## 中箱; FR-PLOT-01), moved, added and removed (FR-PLOT-02), one written by
// itself (FR-PLOT-03), each 中箱 with the episodes written from it (FR-PLOT-04) and a new episode made from one
// (FR-PLOT-05); the 中箱 of the open episode over its text (FR-PLOT-06); which note is the plot (FR-PLOT-08). The plot is
// a plain note, written back line for line (FR-PLOT-07): every change is a change of the note not sent, as anything
// typed. From the server version's public/ui/plot.js
import * as plans from '../lib/episodes.js';
import { esc, n } from '../lib/format.js';
import { relOf } from '../lib/layout.js';
import { renderMd } from '../lib/markdown.js';
import { newNote, notesList } from '../lib/notes.js';
import { boxFor, chapterFor, episodesFor, findCard, NEW_PLOT, parsePlot, plain, writePlot } from '../lib/plot.js';
import { $, show, toast } from './dom.js';
import * as store from './db.js';
import { openNote, plotPath, showBox } from './notes.js';
import { pick } from './picker.js';
import { api } from './shared.js';

/** @typedef {import('../lib/plot.js').Plot} Plot */
/** @typedef {import('../lib/plot.js').Group} Group */
/** @typedef {import('../lib/plot.js').Card} Card */

/** @type {{ path: string, text: string, plot: Plot } | null} the plot as drawn last */
let plotNote = null;
// the plot note read as it is shown (null: none)
async function loadPlot() {
  const path = await plotPath();
  if (!path) return (plotNote = null);
  const text = (await api.texts([path]))[path] ?? '';
  return (plotNote = { path, text, plot: parsePlot(text) });
}
/** @type {Set<string>} the 大箱 folded on this device, by heading */
let folded = new Set();
const foldKey = () => `plot-closed:${api.work().repo}`;

export async function openPlot() {
  show('plot');
  folded = new Set((await store.get('prefs', foldKey())) ?? []);
  $('plot-board').innerHTML = '<p class="muted small">読み込み中…</p>';
  if (!(await loadPlot())) {
    $('plot-board').innerHTML =
      `<p class="muted small">プロットの資料がありません。「# 大箱」「## 中箱」の見出しで書いた資料が、ここで箱になります。</p><button id="plot-new">プロットを作成</button>`;
    return;
  }
  renderPlot();
}
// the episodes as the plot goes with them
const linkable = () => {
  const l = api.view().layout;
  return api.episodes().map(e => ({ ...e, rel: /** @type {string} */ (relOf(l, e.path)) }));
};
function renderPlot() {
  const { plot } = /** @type {NonNullable<typeof plotNote>} */ (plotNote);
  const links = api.view().layout.links;
  const episodes = linkable();
  /** @type {(kind: string, at: string | number, count: number, i: number) => string} */
  const tools = (kind, at, count, i) =>
    `<span class="pbox-tools"><button class="ghost" data-up="${kind}:${at}" ${i === 0 ? 'disabled' : ''} title="上へ" aria-label="上へ">↑</button><button class="ghost" data-down="${kind}:${at}" ${i === count - 1 ? 'disabled' : ''} title="下へ" aria-label="下へ">↓</button><button class="ghost" data-edit="${kind}:${at}">編集</button><button class="ghost more-tools" data-more-tools title="ほかの操作" aria-label="ほかの操作">⋯</button><button class="ghost danger" data-remove="${kind}:${at}" title="この箱を削除" aria-label="この箱を削除" hidden>削除</button></span>`;
  /** @type {(g: Group, gi: number, c: Card, ci: number) => string} */
  const card = (g, gi, c, ci) => {
    const eps = episodesFor(plot, c, links, episodes);
    return `<div class="pcard"><div class="pcard-head"><b>${esc(c.head)}</b>${tools('c', `${gi}:${ci}`, g.cards.length, ci)}</div>${
      plain(c.body) ? `<p class="pcard-sum">${esc(plain(c.body))}</p>` : ''
    }<div class="pcard-eps">${eps.map(e => `<button class="ep-chip" data-open="${esc(e.path)}">${esc(e.title)} <small>${n(e.chars)} 字</small></button>`).join('')}${
      eps.length ? '' : `<button class="ghost small" data-write="${gi}:${ci}" title="この中箱の見出しを題名にして、新しい話を作成">新しい話を作成</button>`
    }</div></div>`;
  };
  $('plot-board').innerHTML =
    plot.groups
      .map(
        (g, gi) =>
          `<details class="pgroup" ${folded.has(g.head) ? '' : 'open'} data-g="${gi}"><summary>${tools('g', gi, plot.groups.length, gi)}${esc(g.bare ? '（見出しの前）' : g.head)} <small>${g.cards.length} 箱</small></summary>${
            plain(g.body) ? `<p class="pcard-sum">${esc(plain(g.body))}</p>` : ''
          }<div class="pcards">${g.cards.map((c, ci) => card(g, gi, c, ci)).join('')}</div><button class="ghost small" data-add-card="${gi}">中箱を追加</button></details>`,
      )
      .join('') + '<button class="plot-add-group" id="plot-add-group">大箱を追加</button>';
  // a box shows three lines of its text; one with more gets 「続きを表示」
  for (const sum of /** @type {NodeListOf<HTMLElement>} */ ($('plot-board').querySelectorAll('.pcard-sum'))) {
    if (sum.scrollHeight <= sum.clientHeight + 2) continue;
    sum.insertAdjacentHTML('afterend', '<button class="ghost small sum-more" data-more>続きを表示</button>');
  }
}
/** @param {string} spec 「g:<大箱>」 or 「c:<大箱>:<中箱>」 */
const parseSpec = spec => /** @type {['g' | 'c', number, number]} */ (spec.split(':').map((x, i) => (i ? Number(x) : x)));
// a box written by itself, in the note's editor (「‹ 箱」 back here)
/** @param {string} spec */
async function editBox(spec) {
  if ($('plot').hidden) return;
  const [kind, gi, ci] = parseSpec(spec);
  const note = /** @type {NonNullable<typeof plotNote>} */ (plotNote);
  const want = kind === 'g' ? note.plot.groups[gi].head : note.plot.groups[gi].cards[ci].head;
  if (await openNote(note.path, { label: '‹ 箱', title: 'プロットの箱の画面に戻る', go: () => void openPlot() })) showBox(kind, gi, ci, want);
}
// the plot changed (a box moved, added, removed): written back as the note's text, a change not sent
/** @param {(p: Plot) => boolean | void} fn false: nothing changed */
function changePlot(fn) {
  const note = /** @type {NonNullable<typeof plotNote>} */ (plotNote);
  const plot = parsePlot(note.text);
  if (fn(plot) === false) return;
  const text = writePlot(plot);
  api.keepText(note.path, text);
  plotNote = { path: note.path, text, plot: parsePlot(text) };
  renderPlot();
}
// an episode linked to a 中箱 ('' none): [plot.links] of novel.toml
/** @param {string} path @param {string} box */
function setLink(path, box) {
  const rel = /** @type {string} */ (relOf(api.view().layout, path));
  return api.apply({ moves: [], writes: [], edits: [{ key: ['plot', 'links', rel], value: box || null }], path: '' }, undefined, true);
}
// a new episode from a 中箱: its heading the title, in the chapter its 大箱 names (asked when none does), linked to it
/** @param {number} gi @param {number} ci */
async function writeFrom(gi, ci) {
  const note = /** @type {NonNullable<typeof plotNote>} */ (plotNote);
  const g = note.plot.groups[gi],
    c = g.cards[ci];
  const v = api.view();
  const titled = v.toc.map(it => ({ type: it.type, path: it.path, title: api.title(it.rel) }));
  const chapters = titled.filter(it => it.type === 'chapter');
  let chapter = chapters.length ? chapterFor(titled, g.head)?.path : '';
  if (chapter === undefined) {
    const choice = await pick({
      title: 'どの章に作成しますか',
      items: [...chapters.map(x => x.title), '（章の外）'],
      help: `「${g.head}」に合う章が見つかりませんでした`,
    });
    if (!choice) return;
    chapter = chapters.find(x => x.title === choice)?.path ?? '';
  }
  const title = c.head.replace(/^中箱[\d０-９\-－]+[：:]?\s*/, '') || c.head;
  let plan;
  try {
    plan = plans.addEpisode(api.forPlans(), chapter, title);
  } catch (err) {
    return toast(err.message);
  }
  const rel = /** @type {string} */ (relOf(v.layout, plan.path));
  if (await api.apply({ ...plan, edits: [...plan.edits, { key: ['plot', 'links', rel], value: c.head }] }, plan.path)) {
    toast(`「${title}」を作成しました（送るまではこの端末だけの変更です）`);
    renderPlot();
  }
}
// the plot made: a note 「plot」 with a 大箱 and a 中箱, chosen as the plot
async function makePlot() {
  try {
    const made = newNote(api.view().layout, api.files(), '', 'plot', 'プロット', Date.now());
    if (
      await api.apply(
        { moves: [], writes: [{ path: made.path, text: NEW_PLOT }], edits: [{ key: ['plot', 'file'], value: made.path }], path: '' },
        undefined,
        true,
      )
    )
      await openPlot();
  } catch (err) {
    toast(err.message);
  }
}
async function chooseFile() {
  const notes = notesList(api.view().layout, api.files())
    .filter(f => f.kind === 'note')
    .map(f => f.path);
  const chosen = await pick({
    title: 'プロットにする資料',
    items: notes,
    current: plotNote?.path ?? '',
    help: '「# 大箱」「## 中箱」の見出しで書いた資料を選んでください',
  });
  if (chosen && (await api.apply({ moves: [], writes: [], edits: [{ key: ['plot', 'file'], value: chosen }], path: '' }, undefined, true))) await openPlot();
}

/** @param {MouseEvent} e */
async function boardClick(e) {
  const b = /** @type {HTMLElement} */ (e.target).closest('button');
  if (!(b instanceof HTMLElement)) return;
  if (b.closest('summary')) e.preventDefault();
  const d = b.dataset;
  if (b.id === 'plot-new') return makePlot();
  const note = /** @type {NonNullable<typeof plotNote>} */ (plotNote);
  if (b.id === 'plot-add-group') {
    // a new 大箱 goes after the last 「大箱N」, before the sections that follow it
    /** @type {(g: Group) => boolean} */
    const numbered = g => /^大箱[\d０-９]+/.test(g.head);
    const head = prompt('大箱の見出し（例: 大箱3：承②「バディの誕生」）', `大箱${note.plot.groups.filter(numbered).length + 1}：`);
    if (head?.trim())
      changePlot(p => {
        const last = p.groups.findLastIndex(numbered);
        p.groups.splice(last < 0 ? p.groups.length : last + 1, 0, { head: head.trim(), body: [''], cards: [] });
      });
    return;
  }
  if (d.addCard !== undefined) {
    const gi = Number(d.addCard),
      g = note.plot.groups[gi],
      num = /^大箱([\d０-９]+)/.exec(g.head)?.[1];
    const head = prompt('中箱の見出し（例: 中箱3-1：ダリウスの授業）', num ? `中箱${num}-${g.cards.length + 1}：` : '');
    if (head?.trim()) changePlot(p => void p.groups[gi].cards.push({ head: head.trim(), body: [''] }));
    return;
  }
  /** @type {(spec: string, by: number) => void} */
  const moveBy = (spec, by) =>
    changePlot(p => {
      const [kind, gi, ci] = parseSpec(spec);
      const list = kind === 'g' ? p.groups : p.groups[gi].cards,
        at = kind === 'g' ? gi : ci,
        to = at + by;
      // the part before the first 大箱 stays first
      const groups = /** @type {Group[]} */ (list);
      if (to < 0 || to >= list.length || (kind === 'g' && (groups[to].bare || groups[at].bare))) return false;
      [list[at], list[to]] = [list[to], list[at]];
    });
  if (d.up) return moveBy(d.up, -1);
  if (d.down) return moveBy(d.down, 1);
  // 削除 waits behind ⋯, away from 編集
  if ('moreTools' in d) {
    const del = /** @type {HTMLElement} */ (b.parentElement?.querySelector('[data-remove]'));
    del.hidden = !del.hidden;
    b.textContent = del.hidden ? '⋯' : '×';
    return;
  }
  if ('more' in d) {
    const open = /** @type {HTMLElement} */ (b.previousElementSibling).classList.toggle('open');
    b.textContent = open ? '閉じる' : '続きを表示';
    return;
  }
  if (d.edit) return editBox(d.edit);
  if (d.remove) {
    const [kind, gi, ci] = parseSpec(d.remove);
    const g = note.plot.groups[gi];
    const what = kind === 'g' ? g : g.cards[ci];
    if (
      !confirm(
        `「${what.head || '見出しの前'}」${kind === 'g' ? `と、その中の中箱 ${g.cards.length} 個` : ''}を削除しますか？（プロットの資料から削除します。対応している話は残ります）`,
      )
    )
      return;
    return changePlot(p => void (kind === 'g' ? p.groups.splice(gi, 1) : p.groups[gi].cards.splice(ci, 1)));
  }
  if (d.open) {
    await api.openEpisode(d.open);
    return api.back();
  }
  if (d.write) {
    const [gi, ci] = d.write.split(':').map(Number);
    return writeFrom(gi, ci);
  }
}

// --- the 中箱 of the open episode, over its text (FR-PLOT-06): shown only for the episode it was opened on
/** @type {string | null} */
let peek = null;
export async function renderPlotPanel() {
  const panel = $('plot-panel');
  const path = api.current();
  const on = Boolean(path) && peek === path;
  $('plot-peek').classList.toggle('on', on);
  if (!on) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const p = await loadPlot();
  if (api.current() !== path) return;
  if (!p) {
    panel.innerHTML = '<p class="muted small">プロットの資料がありません。目次の「プロット」から作れます。</p>';
    return;
  }
  const episode = linkable().find(e => e.path === path);
  const box = episode ? boxFor(p.plot, episode, api.view().layout.links) : undefined;
  const found = findCard(p.plot, box);
  panel.innerHTML = found
    ? `<div class="plot-panel-head"><b>${esc(found.c.head)}</b><span class="grow"></span><button class="ghost small" data-plot-pick>中箱を変更</button><button class="ghost small" data-plot-open>プロット</button></div><div class="preview plot-panel-body">${renderMd(found.c.body.join('\n'), p.path, () => '')}</div>`
    : `<div class="plot-panel-head"><span class="muted small">${box ? `中箱「${esc(box)}」が見つかりません` : 'この話に対応するプロットの中箱はありません'}</span><span class="grow"></span><button class="ghost small" data-plot-pick>中箱を選択</button></div>`;
}
async function pickBox() {
  const path = api.current();
  const p = await loadPlot();
  if (!p || !path) return;
  const heads = p.plot.groups.flatMap(g => g.cards.map(c => c.head));
  const episode = linkable().find(e => e.path === path);
  const current = (episode && findCard(p.plot, boxFor(p.plot, episode, api.view().layout.links))?.c.head) || '';
  const chosen = await pick({
    title: 'この話の中箱',
    items: [...heads, ...(current ? ['（対応を解除）'] : [])],
    current,
    help: 'この話を書くもとになるプロットの中箱を選んでください',
  });
  if (!chosen) return;
  if (await setLink(path, chosen === '（対応を解除）' ? '' : chosen)) await renderPlotPanel();
}

export function wirePlot() {
  $('open-plot').addEventListener('click', () => void openPlot());
  $('close-plot').addEventListener('click', () => api.back());
  $('plot-file').addEventListener('click', () => void chooseFile());
  $('plot-board').addEventListener('click', e => void boardClick(e));
  $('plot-board').addEventListener(
    'toggle',
    e => {
      const d = /** @type {HTMLElement} */ (e.target).closest?.('details.pgroup');
      if (!(d instanceof HTMLDetailsElement) || !plotNote) return;
      const head = plotNote.plot.groups[Number(d.dataset.g)]?.head;
      if (head === undefined) return;
      if (d.open) folded.delete(head);
      else folded.add(head);
      void store.put('prefs', foldKey(), [...folded]);
    },
    true,
  );
  // a double click (a double tap on iPhone) on a box opens it for writing, as its 編集 does
  /** @param {Element} target */
  const boxEdit = target => {
    if (target.closest('button, .ep-chip')) return null;
    const box = target.closest('.pcard') ?? target.closest('.pgroup');
    const edit = box?.querySelector(box.matches('.pcard') ? '[data-edit]' : ':scope > summary [data-edit]');
    return edit instanceof HTMLElement ? edit : null;
  };
  $('plot-board').addEventListener('dblclick', e => {
    const edit = boxEdit(/** @type {Element} */ (e.target));
    if (!edit) return;
    getSelection()?.removeAllRanges();
    void editBox(/** @type {string} */ (edit.dataset.edit));
  });
  /** @type {{ edit: string, at: number, x: number, y: number } | null} */
  let lastTap = null;
  $('plot-board').addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') return;
    const edit = boxEdit(/** @type {Element} */ (e.target)),
      now = performance.now();
    if (edit && lastTap && lastTap.edit === edit.dataset.edit && now - lastTap.at < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null;
      e.preventDefault();
      getSelection()?.removeAllRanges();
      return void editBox(/** @type {string} */ (edit.dataset.edit));
    }
    lastTap = edit ? { edit: /** @type {string} */ (edit.dataset.edit), at: now, x: e.clientX, y: e.clientY } : null;
  });
  $('plot-peek').addEventListener('click', () => {
    peek = peek === api.current() ? null : api.current();
    void renderPlotPanel();
  });
  $('plot-panel').addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-plot-open]')) return void openPlot();
    if (t.closest('[data-plot-pick]')) void pickBox();
  });
}
