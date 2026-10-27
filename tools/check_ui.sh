#!/usr/bin/env bash
# 画面の試験と、その結果を使う点検。push の前に 1 回だけ実行する（作業の途中は check:all）。`npm run check:ui`
#   変えた画面の試験のファイルを 3 回ずつ（origin/main からの差分と、新しいファイル）、
#   画面の試験（Playwright。Chrome と WebKit。GitHub は偽物）、
#   ブラウザーで動く JS の C0・C1 100%（画面の試験と単体試験を合わせて。NFR-MAINT-02）、
#   トレース検証（画面の試験の記録を formal/ のモデルの手順でたどれるか。TLC を java か podman のコンテナで実行する。NFR-MAINT-03）
# 失敗したら: 失敗した試験だけを npx playwright test --last-failed で直し、--repeat-each=3 で通ることを確かめてから、もう一度これを実行する
set -euo pipefail
cd "$(dirname "$0")/.."
start=$SECONDS
echo "== lib の単体試験（C0・C1 を画面の試験と合わせて数えるため）"
npm run -s test:unit > /dev/null
echo "== 変えた画面の試験のファイルを 3 回ずつ（時間の重なりに弱い試験を、全部を実行する前に見つける）"
# origin/main から変えたもの、commit していないもの、新しく足したもの
changed=$( { git diff --name-only origin/main -- 'tests/ui/*.spec.mjs'; git ls-files --others --exclude-standard -- 'tests/ui/*.spec.mjs'; } | sort -u | while read -r f; do [ -f "$f" ] && echo "$f"; done )
if [ -n "$changed" ]; then
  echo "$changed"
  # shellcheck disable=SC2086
  npx playwright test $changed --repeat-each=3 || { echo "変えた試験が 3 回のうちで失敗しました。直してから、もう一度 npm run check:ui"; exit 1; }
else
  echo "（変えた画面の試験のファイルはありません）"
fi
echo "== 画面の試験（Playwright。Chrome と WebKit）"
npm run -s test:ui || { echo "失敗した試験だけ: npx playwright test --last-failed（直したら --repeat-each=3 で確かめてから、もう一度 npm run check:ui）"; exit 1; }
echo "== ブラウザーで動く JS の C0・C1 が 100% か（画面の試験と単体試験を合わせて）"
node tools/coverage_all.mjs > /dev/null || { cat coverage/all/missing.txt; exit 1; }
echo "== トレース検証（画面の試験の記録を、formal/ のモデルの手順でたどれるか）"
node --no-warnings tools/trace_check.mjs
echo "== 全部通りました（$((SECONDS - start)) 秒）"
