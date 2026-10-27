#!/usr/bin/env bash
# 点検にかかった時間を、この機械の前回と比べる（check_all.sh、check_ui.sh の最後に呼ぶ）。`tools/check_time.sh <名前> <秒>`
# 前回の 1.3 倍を超え、かつ 30 秒より多く遅くなったら止める。試験を足して遅くなるのが正しいときは NW_SLOW_OK=1 で実行し直し、
# その時間を新しい基準にする。基準は .check-times/<名前>（この機械だけの記録。git には入れない）
set -euo pipefail
cd "$(dirname "$0")/.."
name=$1 secs=$2 file=.check-times/$1
mkdir -p .check-times
if [ -f "$file" ] && [ -z "${NW_SLOW_OK:-}" ]; then
  prev=$(cat "$file")
  if [ "$secs" -gt $((prev * 13 / 10)) ] && [ "$secs" -gt $((prev + 30)) ]; then
    echo "!! $name が $secs 秒かかりました。前回は $prev 秒です。遅くなった理由を調べてください（試験を足して遅くなるのが正しいなら NW_SLOW_OK=1 で実行し直す）"
    exit 1
  fi
fi
echo "$secs" > "$file"
