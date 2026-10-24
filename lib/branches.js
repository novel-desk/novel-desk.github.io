// Branches: a new one's name checked, and what a merge would bring, said before it is made (FR-GH-09; no screen, no
// state of the app: tested by itself in tests/unit). The server version's merge preview, from GitHub's compare API

// Why a branch name cannot be used ('' when it can): git's rules for a ref, as far as a name typed needs them
/** @param {string} name */
export function branchNameError(name) {
  if (!name) return 'ブランチの名前を入れてください';
  // eslint-disable-next-line no-control-regex
  const bad = /[\u0000- \u007f~^:?*[\\]/.test(name) || /\.\.|@\{|\/\/|\/\.|^[-/.]|[/.]$|\.lock$/.test(name) || name === '@';
  return bad ? 'ブランチの名前に使えない文字があります（英数字と - _ . / で、. や / で始めたり終えたりしない）' : '';
}
/**
 * What a merge of `from` into `into` brings, as lines to read before it is made: its commits (8 at most), the episodes
 * it changes (12 at most) and how many other files. From the compare API's commits and files
 * @param {{ from: string, into: string, commits: { commit: { message: string, committer: { date: string } } }[],
 *   files: { filename: string, status: string, additions: number, deletions: number, previous_filename?: string }[],
 *   episode: (path: string) => string | null }} o `episode`: an episode's title (null: not an episode)
 */
export function mergeLines({ from, into, commits, files, episode }) {
  const eps = files.flatMap(f => {
    const title = episode(f.filename) ?? (f.previous_filename ? episode(f.previous_filename) : null);
    if (title === null) return [];
    const what =
      f.status === 'added'
        ? '新しい話'
        : f.status === 'removed'
          ? '削除'
          : f.status === 'renamed'
            ? '名前の変更'
            : `${f.additions} 行足し、${f.deletions} 行消す`;
    return [`・${title} ${what}`];
  });
  const others = files.length - eps.length;
  return [
    `${from} → ${into}`,
    `commit ${commits.length} 件:`,
    ...commits.slice(0, 8).map(c => `・${c.commit.committer.date.slice(0, 10)} ${c.commit.message.split('\n')[0]}`),
    commits.length > 8 ? `・ほか ${commits.length - 8} 件` : '',
    eps.length ? '話の変化:' : '',
    ...eps.slice(0, 12),
    eps.length > 12 ? `・ほか ${eps.length - 12} 話` : '',
    others ? `話以外のファイル ${others} 件` : '',
  ].filter(Boolean);
}
