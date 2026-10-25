# Novel Desk の要件

サーバー版の要件（~/novel-writer/docs/requirements.md）をそのまま当てはめ、ここには Novel Desk だけの要件と前提を書く。

サーバー版の要件のうち、サーバーが無いために当てはめられないものは README の「できないこと」に、サーバー版と画面や動きが違う所とその理由は [server-differences.md](server-differences.md) にあります。

## 1. 前提

- 共同作業者はいない。iPhone と PC は作者専用で、共用しない
- GitHub のアカウントと novel-desk の org の乗っ取りは考えない
- このため、共用の端末と共同作業者だけで起きる問題は扱わない

（2026-10-25 に作者が決めた）

## 2. 要件

1 行に 1 つの要件を書き、ID を付けます。要件を消しても、ID は振り直しません。

### 2.1 セキュリティ（SEC）

| ID | 要件 | 理由 | 確かめ方 | 状態 |
|---|---|---|---|---|
| `DESK-SEC-01` | GitHub App の秘密鍵は、パスキーの PRF から作った鍵で暗号化して保存する。開くたびにパスキーで復号し、取り出せない鍵（extractable: false）にしてメモリーにだけ置く。PRF が無いブラウザーでは、取り出せない鍵のまま保存し、画面でそう伝える | 端末の保存場所を読まれても、パスキーが無ければ秘密鍵を使えないようにするため（秘密鍵には期限が無い） | 試験（tests/ui/appkey.spec.mjs の「DESK-SEC-01: with PRF, the App’s key kept encrypted …」「DESK-SEC-01: the passkey not opening the App’s key …」「DESK-SEC-01: an authenticator without PRF …」「DESK-SEC-01: the App’s key kept by the version before …」の 2 つ、tests/ui/manifest.spec.mjs の「DESK-SEC-01: the passkey made on the press …」、tests/unit の appFormOf・openFailure・APP_KEY_INFO） | 満たす（前の版で暗号化せずに保管した秘密鍵は、取り出せないので暗号化し直せない。今までどおり開き、設定の画面で作り直す手順を出す） |
| `DESK-SEC-02` | 開いている間は、パスキーを求め直さない（ほかのアプリに切り替えて戻ったときも） | iPhone は自分でロックし、開くのに Face ID が要るので同じ役をしている。ロックの解けた iPhone を手にした人は Safari の GitHub やメールも使えるので、Novel Desk だけに足しても守れる範囲がほとんど広がらず、作者は戻るたびに Face ID が 1 回増える | 試験 | 満たす |
| `DESK-SEC-03` | GitHub がトークンを断ったとき（期限切れなど）は、この端末の作品の控え・設定・記録・書きかけを消さない。トークンを入れ直せば、作品は前と同じブランチと送る頻度のまま続く。サーバー版の NFR-SEC-16（セッションが切れたときに控え・キャッシュ・記録を消す）とは違う | この版で同じように消すと、送る頻度と選んだブランチも消え、書きかけが既定のブランチへ自動で送られてしまうため | 試験（tests/ui/token.spec.mjs） | 満たす |

### 2.2 作品（WORK）

| ID | 要件 | 理由 | 確かめ方 | 状態 |
|---|---|---|---|---|
| `DESK-WORK-01` | サーバー版の FR-WORK-07（古い形式の作品を開く。`.novel.json` の作品、`_没/` のフォルダ）は当てはめない。作品は `novel.toml` の形式で置く | 作者の判断 | ― | 当てはめない |

### 2.3 運用（OPS）

| ID | 要件 | 理由 | 確かめ方 | 状態 |
|---|---|---|---|---|
| `DESK-OPS-01` | novel-desk の org には、novel-desk.github.io のほかに GitHub Pages を置かない | 同じ origin になり、端末に保存した鍵と書きかけをそのサイトのスクリプトから使われるため | GitHub の API で org の Pages とメンバーを見る | 満たす（2026-10-25 に GitHub の API で、org の Pages が novel-desk.github.io だけ、メンバーが作者 1 人であることを確かめた） |
