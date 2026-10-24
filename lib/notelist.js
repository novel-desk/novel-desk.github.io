// The list of a work's notes as the screens show it (資料 and the note beside the text): no screen, no state of the
// app, tested by itself in tests/unit. From the server version's public/lib/notelist.js

/** @typedef {{ path: string, name: string, title?: string, updated: number }} NoteFile */
/** @typedef {NoteFile & { label: string }} NoteRow a note with what its row says */

// the notes used most: the plot, the characters, the world, the settings
const PINNED = /プロット|plot|キャラ|人物|character|世界観|world|設定|setting/i;
/**
 * The ones used most on top (主な資料); then the rest by folder, the top folder first, each folder by its name. A row
 * says the note's title, or its path in the notes' folder (on top) or its file name (in a folder)
 * @param {NoteFile[]} notes @param {string} dir the notes' folder @param {string | undefined} plotFile the plot's note
 * @returns {{ pinned: NoteRow[], folders: { folder: string, rows: NoteRow[] }[] }}
 */
export function groupNotes(notes, dir, plotFile) {
  const pinned = notes.filter(f => f.path === plotFile || PINNED.test(`${f.name} ${f.title || ''}`));
  /** @type {Map<string, NoteRow[]>} */
  const folders = new Map();
  // a note shown on top is not shown again under its folder
  for (const f of notes.filter(f => !pinned.includes(f))) {
    const rel = f.path.slice(dir.length + 1),
      at = rel.lastIndexOf('/');
    const folder = at < 0 ? '' : rel.slice(0, at);
    if (!folders.has(folder)) folders.set(folder, []);
    /** @type {NoteRow[]} */ (folders.get(folder)).push({ ...f, label: f.title || rel.slice(at + 1) });
  }
  return {
    pinned: pinned.map(f => ({ ...f, label: f.title || f.path.slice(dir.length + 1) })),
    folders: [...folders.keys()]
      .sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'ja')))
      .map(folder => ({ folder, rows: /** @type {NoteRow[]} */ (folders.get(folder)) })),
  };
}
