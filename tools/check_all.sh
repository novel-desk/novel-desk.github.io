#!/usr/bin/env bash
# 手元で全部の点検と試験を実行する（push の前）。`npm run check:all`
#   JS の整形（Prettier）、書き方（ESLint）、型（tsc。JSDoc の型）、lib の単体試験（vitest。行・分岐・関数・文とも 100%）、
#   画面の試験（Playwright。Chrome と WebKit。GitHub は偽物）
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== JS の整形（Prettier）"
npm run -s format:check
echo "== JS の書き方（ESLint）"
npm run -s lint:js
echo "== JS の型（tsc）"
npm run -s check:types
echo "== lib の単体試験とカバレッジ（vitest。100% でなければ止まる）"
npm run -s test:unit
echo "== 画面の試験（Playwright。Chrome と WebKit）"
npm run -s test:ui
echo "== 全部通りました"
