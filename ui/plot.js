// プロット: the plot note as boxes (# 大箱, ## 中箱; FR-PLOT-01), moved, added and removed (FR-PLOT-02), one written by
// itself (FR-PLOT-03), each 中箱 with the episodes written from it (FR-PLOT-04) and a new episode made from one
// (FR-PLOT-05); the 中箱 of the open episode over its text (FR-PLOT-06); which note is the plot (FR-PLOT-08). The plot is
// a plain note, written back line for line (FR-PLOT-07): every change is a change of the note not sent, as anything
// typed. From the server version's public/ui/plot.js
import * as plans from '../lib/episodes.js';
import { moreLabel } from '../lib/format.js';
import { relOf } from '../lib/layout.js';
import { picturePaths, renderMd } from '../lib/markdown.js';
import { newNote, notesList } from '../lib/notes.js';
import {
  addGroup,
  boxChoices,
  boxFor,
  boxHead,
  cardTitle,
  chapterOf,
  currentBox,
  doubleTap,
  findCard,
  foundBody,
  linkOf,
  moveBox,
  NEW_PLOT,
  nextCardHead,
  nextGroupHead,
  parsePlot,
  parseSpec,
  PLOT_EMPTY,
  plotBoardHtml,
  plotPanelHtml,
  removeAsk,
  removeBox,
  toolsLabel,
  writePlot,
} from '../lib/plot.js';
import { $, show, toast } from './dom.js';
import * as store from './db.js';
import { openNote, plotPath, showBox } from './notes.js';
import { pick } from './picker.js';
import { api } from './shared.js';

/** @typedef {import('../lib/plot.js').Plot} Plot */

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
    $('plot-board').innerHTML = PLOT_EMPTY;
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
  // (the line over the boxes, empty: put away while they are shown, as the server version's)
  $('plot-where').hidden = true;
  $('plot-board').innerHTML = plotBoardHtml(plot, folded, api.view().layout.links, linkable());
  // a box shows three lines of its text; one with more gets 「続きを表示」
  for (const sum of /** @type {NodeListOf<HTMLElement>} */ ($('plot-board').querySelectorAll('.pcard-sum'))) {
    if (sum.scrollHeight <= sum.clientHeight + 2) continue;
    sum.insertAdjacentHTML('afterend', '<button class="ghost small sum-more" data-more>続きを表示</button>');
  }
}
// a box written by itself, in the note's editor (「‹ 箱」 back here)
/** @param {string} spec */
async function editBox(spec) {
  // a double tap can come as both a dblclick and two taps: open it once (as the server version's)
  if ($('plot').hidden) return;
  const [kind, gi, ci] = parseSpec(spec);
  const note = /** @type {NonNullable<typeof plotNote>} */ (plotNote);
  const want = boxHead(note.plot, kind, gi, ci);
  // (the note was read when the boxes were drawn: it opens)
  await openNote(note.path, { label: '‹ 箱', title: 'プロットの箱の画面に戻る', go: () => void openPlot() });
  showBox(kind, gi, ci, want);
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
  let chapter = chapterOf(titled, g.head);
  if (chapter === undefined) {
    const choice = await pick({
      title: 'どの章に作成しますか',
      items: [...chapters.map(x => x.title), '（章の外）'],
      help: `「${g.head}」に合う章が見つかりませんでした`,
    });
    if (!choice) return;
    chapter = chapters.find(x => x.title === choice)?.path ?? '';
  }
  const title = cardTitle(c.head);
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
    const head = prompt('大箱の見出し（例: 大箱3：承②「バディの誕生」）', nextGroupHead(note.plot));
    if (head?.trim()) changePlot(p => addGroup(p, head.trim()));
    return;
  }
  if (d.addCard !== undefined) {
    const gi = Number(d.addCard);
    const head = prompt('中箱の見出し（例: 中箱3-1：ダリウスの授業）', nextCardHead(note.plot.groups[gi]));
    if (head?.trim()) changePlot(p => void p.groups[gi].cards.push({ head: head.trim(), body: [''] }));
    return;
  }
  if (d.up) return changePlot(p => moveBox(p, /** @type {string} */ (d.up), -1));
  if (d.down) return changePlot(p => moveBox(p, /** @type {string} */ (d.down), 1));
  // 削除 waits behind ⋯, away from 編集
  if ('moreTools' in d) {
    const del = /** @type {HTMLElement} */ (b.parentElement?.querySelector('[data-remove]'));
    del.hidden = !del.hidden;
    b.textContent = toolsLabel(del.hidden);
    return;
  }
  if ('more' in d) {
    const open = /** @type {HTMLElement} */ (b.previousElementSibling).classList.toggle('open');
    b.textContent = moreLabel(open);
    return;
  }
  if (d.edit) return editBox(d.edit);
  if (d.remove) {
    const spec = d.remove;
    if (!confirm(removeAsk(note.plot, spec))) return;
    return changePlot(p => removeBox(p, spec));
  }
  if (d.open) {
    await api.openEpisode(d.open);
    return api.back();
  }
  // (the last kind of button: 新しい話を作成)
  const [gi, ci] = /** @type {string} */ (d.write).split(':').map(Number);
  return writeFrom(gi, ci);
}

// --- the 中箱 of the open episode, over its text (FR-PLOT-06): shown only for the episode it was opened on
/** @type {string | null} */
let peek = null;
// the episode the panel was drawn for ('' none since it was closed)
let panelFor = '';
export async function renderPlotPanel() {
  const panel = $('plot-panel');
  const path = api.current();
  const on = Boolean(path) && peek === path;
  $('plot-peek').classList.toggle('on', on);
  if (!on) {
    panel.hidden = true;
    panelFor = '';
    return;
  }
  // (opened, or another episode: what it showed before emptied until this episode's box is read. DESK-OPS-05)
  if (panelFor !== path) panel.innerHTML = '<p class="muted small">読み込んでいます…</p>';
  panelFor = path;
  panel.hidden = false;
  const p = await loadPlot();
  if (api.current() !== path) return;
  if (!p) {
    panel.innerHTML = '<p class="muted small">プロットの資料がありません。目次の「プロット」から作成できます。</p>';
    return;
  }
  // (the episode open is one of the work's)
  const episode = /** @type {ReturnType<typeof linkable>[number]} */ (linkable().find(e => e.path === path));
  const box = boxFor(p.plot, episode, api.view().layout.links);
  const found = findCard(p.plot, box);
  // (its pictures shown, as the server version's)
  /** @type {Record<string, string>} */
  const urls = {};
  const body = foundBody(found);
  for (const pic of picturePaths(body, p.path)) urls[pic] = await api.pictureUrl(pic);
  panel.innerHTML = plotPanelHtml(
    found,
    box,
    renderMd(body, p.path, pic => urls[pic]),
  );
}
// (its button is on the panel, which shows it only with the plot, for the episode open)
async function pickBox() {
  const path = api.current();
  // (its button is on the panel only with the plot)
  const p = /** @type {NonNullable<typeof plotNote>} */ (await loadPlot());
  const current = currentBox(
    p.plot,
    linkable().find(e => e.path === path),
    api.view().layout.links,
  );
  const chosen = await pick({
    title: 'この話の中箱',
    items: boxChoices(p.plot, current),
    current,
    help: 'この話を書くもとになるプロットの中箱を選んでください',
  });
  if (!chosen) return;
  if (await setLink(path, linkOf(chosen))) await renderPlotPanel();
}

export function wirePlot() {
  $('open-plot').addEventListener('click', () => void openPlot());
  $('close-plot').addEventListener('click', () => api.back());
  $('plot-file').addEventListener('click', () => void chooseFile());
  $('plot-board').addEventListener('click', e => void boardClick(e));
  $('plot-board').addEventListener(
    'toggle',
    e => {
      // (the board's only details are its 大箱, drawn from the plot)
      const d = /** @type {HTMLDetailsElement} */ (e.target);
      const head = /** @type {NonNullable<typeof plotNote>} */ (plotNote).plot.groups[Number(d.dataset.g)].head;
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
    const tap = edit && { edit: /** @type {string} */ (edit.dataset.edit), at: now, x: e.clientX, y: e.clientY };
    if (tap && doubleTap(lastTap, tap)) {
      lastTap = null;
      e.preventDefault();
      getSelection()?.removeAllRanges();
      return void editBox(/** @type {string} */ (edit.dataset.edit));
    }
    lastTap = tap;
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
