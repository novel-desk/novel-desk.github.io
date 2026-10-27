#!/usr/bin/env bash
# 作業の途中で何回も実行する点検と試験。`npm run check:all`（画面の試験は check:ui。push の前に 1 回: tools/check_ui.sh）
#   JS の整形（Prettier）、書き方（ESLint）、型（tsc。JSDoc の型）、
#   サーバー版との違い（style.css と index.html を、~/novel-writer の決めた commit と比べる。docs/server-differences.md）、
#   lib の単体試験（vitest。行・分岐・関数・文とも 100%）、
#   性質の試験（fast-check。送る処理と読み込みの順番の組み合わせ、操作の列。種は固定）、
#   保存の処理の変異テスト 100%（Stryker。lib の changes、drafts、merge、sync。NFR-MAINT-02）
set -euo pipefail
cd "$(dirname "$0")/.."
start=$SECONDS
echo "== JS の整形（Prettier）"
npm run -s format:check
echo "== JS の書き方（ESLint）"
npm run -s lint:js
echo "== JS の型（tsc）"
npm run -s check:types
echo "== サーバー版との違い（style.css と index.html。理由は docs/server-differences.md）"
npm run -s check:server
echo "== lib の単体試験と C0・C1（vitest。100% でなければ止まる）"
npm run -s test:unit
echo "== 性質の試験（fast-check。種は固定）"
NW_PROPS_SEED=20261025 npm run -s test:props
echo "== 保存の処理の変異テストが 100% か（lib の changes、drafts、merge、sync）"
npm run -s test:mutation:save
elapsed=$((SECONDS - start))
tools/check_time.sh check-all "$elapsed"
echo "== 全部通りました（$elapsed 秒。画面の試験は push の前に npm run check:ui）"
