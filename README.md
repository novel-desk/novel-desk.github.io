# Novel Writer（JavaScript 版）

サーバーなしで動く Novel Writer です。GitHub のリポジトリに置いた小説を、話ごとにブラウザーで書き、GitHub へ送ります。
アプリは GitHub Pages から配る静的なファイルだけでできていて、画面は GitHub の API とだけ通信します。

- 公開の場所: https://novel-desk.github.io/
- 作品の形式は、サーバー版の Novel Writer（kurogane255/novel-writer）と同じです（`novel.toml`、「番号_題名.md」、章のフォルダ）

## 置き場所について

アプリは組織 novel-desk の `novel-desk.github.io` リポジトリに置き、GitHub Pages で https://novel-desk.github.io/ の直下から配ります。

**novel-desk の Pages に、ほかのサイトを置かないでください。** ほかのサイトを置くと同じオリジンになり、
パスキー（rp.id は `novel-desk.github.io`）と、この端末に置いたトークンや書きかけ（IndexedDB）を、そのサイトのスクリプトからも使えてしまいます。

リポジトリは Public で、アプリのページは誰でも開けます。作品はトークンがなければ読めません。
このリポジトリのコードと試験には、トークン、メールアドレス、作品の本文を入れません（試験の作品は試験のために作った短い文です）。

## 作者がすること

### 1. トークンを作る

GitHub の fine-grained personal access token を 1 つ作ります。作品のリポジトリだけを読み書きできるトークンにします。

いちばん簡単なのは、アプリの最初の画面の「GitHub でトークンを作る」を押すことです。名前、説明、期限（366 日）、Contents の読み書きが入った状態で GitHub の画面が開くので、Repository access で作品のリポジトリを選び、Generate token を押すだけで済みます。手で作るときの手順は次のとおりです。

1. GitHub の Settings → Developer settings → Personal access tokens → Fine-grained tokens を開き、Generate new token を押す
2. Token name に分かる名前（例: `novel-desk`）を入れ、Expiration（期限）を選ぶ
3. Resource owner に、作品のリポジトリの持ち主を選ぶ
4. Repository access で Only select repositories を選び、作品のリポジトリ（例: dennou）だけを選ぶ
5. Permissions の Repository permissions で、次の 2 つだけを付ける
   - Contents: Read and write（話を読み、commit を作り、ブランチを進める）
   - Metadata: Read-only（Contents を選ぶと自動で付きます）
6. Generate token を押し、表示された `github_pat_…` をコピーする

トークンの期限が切れたら、同じ手順で作り直し、アプリで「トークンを忘れる」を押してから入れ直します。

### 2. GitHub Pages を有効にする（最初の 1 回だけ）

リポジトリの Settings → Pages で、Source を Deploy from a branch、Branch を `main`、フォルダを `/ (root)` にして保存します。
コマンドで有効にする場合は次のとおりです。

```sh
gh api -X POST repos/novel-desk/novel-desk.github.io/pages -f 'source[branch]=main' -f 'source[path]=/'
```

main に push すると、数分で https://novel-desk.github.io/ に反映されます。

## 使い方

1. https://novel-desk.github.io/ を開き、作ったトークンを貼って「パスキーで保管する」を押す。パスキーを作る画面が出るので、iPhone なら Face ID で作る
2. 作品のリポジトリを選ぶ（選んだものは覚えていて、次からはそのまま開きます）
3. 目次から話を選んで書く。入力するたびに、書いた文章をこの端末（IndexedDB）に保存します。保存した話には「未送信」と出ます
4. 「送る」を押すと、変えた話を全部まとめて 1 つの commit にして、作品のブランチに送ります
5. 次に開くときは「パスキーで開く」を押し、Face ID を通します

ほかの操作は次のとおりです。

- 「プレビュー」: 見出し、箇条書き、ルビ（漢字《かんじ》、|文字《もじ》）、画像を表示します。画像はリポジトリから読みます
- 「再読み込み」: GitHub から作品を読み直します。未送信の書きかけがある話は、書きかけのまま表示します
- 「ほかの作品」: リポジトリを選び直します。トークンを消す「トークンを忘れる」もこの画面にあります
- ホーム画面に追加すると、全画面のアプリとして開きます（iPhone の Safari なら共有 → ホーム画面に追加）
- 一度開いた作品は、オフラインでも開いて書けます。送るのは、つながってからです

### 送るときの動き

- commit メッセージはサーバー版と同じ形です（例: `10/24 はじまり ＋320字、駅で −12字`。日付は日本時間）
- Git Data API で、blob、tree、commit を作り、ブランチを進めます。force はしません
- 読んだ後にほかの端末がブランチを進めていたら、新しい木を読み直します。ここで変えた話のうち、ほかで変わっていない話は、その上に積み直します
- ほかでも変わっていた話は、どちらの版も消さずに、両方を並べて送ります。並べた所には「――― ここから、ほかの端末で書かれた版 ―――」の行が入り、目次に「両方の版」と出ます。その行を探して整理してから、もう一度送ってください

### トークンの保管

- トークンは、パスキーの PRF 拡張の出力から HKDF で作った AES-GCM の鍵で暗号化し、IndexedDB に置きます（置くのは credential ID、salt、iv、暗号文だけです）。開くたびにパスキーで復号し、復号したトークンはページを開いている間だけメモリーに置きます
- PRF に対応していないブラウザーや認証器では、WebCrypto の取り出せない鍵（extractable: false）を IndexedDB に置いて暗号化します。この場合はパスキーを使わずに開きます。この端末でそのブラウザーを開ける人はトークンを使えるので、画面でもそう伝えます
- 「トークンを忘れる」は、この端末からトークンを消します。パスキーはパスワードの管理（iPhone なら設定 → パスワード）に残るので、要らなければそこで消してください
- ページには CSP を付けています。スクリプトはこのサイトのものだけを実行し、通信先は `https://api.github.com` だけです

## 読む novel.toml の項目

- `title`: 作品の題名
- `manuscript.dir`: 本文のフォルダ。中の「番号_題名.md」が話、「番号_題名/」が章
- `manuscript.files`: 話にするファイル名（例 `"[0-9][0-9].md"`。配列も可）
- `manuscript.exclude`: 話から外すファイル（本文のフォルダからのパス）
- `manuscript.title = "heading"`: 話の題名を 1 行目の「# 第1話 題名」から取る
- `manuscript.naming = "chapter-number"`: 「2-09.md」を第 2 章の第 9 話として読む
- `[titles]`: 話や章の題名（本文のフォルダからのパスをキーにする）
- `git.branch`: 読み書きするブランチ（無ければリポジトリの既定のブランチ）

ほかの項目（`notes`、`plot` など）は読み飛ばします。読めない形の novel.toml（文字列を "" で囲んでいない、複数行の文字列など）は、
何行目の何が読めないかを目次の上に出し、本文のフォルダを一番上として読みます。

## できないこと

この版では、次のことはできません。サーバー版か、GitHub の画面で行ってください。

- 資料、プロット、キャラクター、記録、履歴の画面
- 話や章の追加、削除、並べ替え、題名（ファイル名）の変更
- 画像の追加
- novel.toml の書き換え
- UTF-8 でない話を開くこと

## 開発

開発用のツールだけを npm で入れます。アプリ本体はライブラリを使わず、ビルドもしません。

```sh
npm install
npm run serve       # http://localhost:4173/ で開く
npm run check:all   # 整形、書き方、型、単体試験（lib は 100%）、画面の試験（Chrome と WebKit）
```

- 決める部分は `lib/` の純粋な関数にし、vitest で試験します（`tests/unit/`。行・分岐とも 100%）
- 画面は Playwright で試験します（`tests/ui/`）。GitHub の API は偽物（`tests/ui/lib/fake-github.mjs`）で、本物の GitHub には通信しません
- WebKit は Playwright の Docker イメージで実行します。`NW_NO_WEBKIT=1` で WebKit を外せます
- パスキーの試験は Chrome の仮想認証器で実行します。WebKit には Playwright から操作できる仮想認証器がないので、Chrome だけで実行します
- オフラインの試験も Chrome だけで実行します。WebKit では、service worker が付いたページの通信を Playwright の route が受け取れず、偽物の GitHub に届かないためです

ファイルの置き場所は次のとおりです。

- `index.html`、`style.css`、`app.js`: 画面と、トークン・リポジトリの選択
- `ui/`: I/O の層（IndexedDB、パスキー、GitHub の API、目次と本文、送る処理）
- `lib/`: 純粋な関数（TOML、novel.toml と目次、Markdown、commit メッセージ、積み直し）
- `sw.js`、`manifest.webmanifest`: オフライン用の控えと、ホーム画面に追加するための設定
