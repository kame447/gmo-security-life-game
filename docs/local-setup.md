# ローカルでの起動と動作確認

ゲームとエディタを手元で動かし、変更や PR を確認するための最短手順です。テストの詳細、E2E の環境変数、計測結果は [game/README.md](../game/README.md) にあります。

## 必要なもの

- Node.js 24 以上と npm（CI は Node.js 24）
- Canvas 2D に対応したブラウザ（Chrome / Edge / Safari / Firefox の最新版を想定。正式なサポート範囲は未決定）
- GitHub CLI `gh`（PR を手元で試す場合と、作業範囲の確認に使用）

## 初回だけ

```sh
git clone https://github.com/kame447/gmo-security-life-game.git
cd gmo-security-life-game
git config core.hooksPath .githooks   # 作業範囲チェックを有効化（チーム開発の運用ルール）
cd game
npm install
```

`core.hooksPath` の意味は [チーム開発の運用ルール](team-workflow.md) を参照してください。

## ゲームを起動する

`game/` で実行します。

```sh
npm run dev
```

ブラウザで <http://127.0.0.1:5173/> を開きます。ブラウザは自動では開きません。止めるときはターミナルで Ctrl + C を押します。

| 画面 | URL |
|---|---|
| ゲーム | <http://127.0.0.1:5173/> |
| サンプルエディタ | <http://127.0.0.1:5173/editor.html> |
| 適用済みサンプルでのゲーム | <http://127.0.0.1:5173/editor-preview.html> |

ファイルを保存すると画面に自動で反映されます。主な操作は矢印キー／WASD で移動、Shift で走る、Z／Space／Enter で調べる・話すです。操作の一覧は [game/README.md の操作](../game/README.md#操作) にあります。

## PR やブランチを手元で試す

レビュー中の PR は、番号を指定して手元に取り込めます。リポジトリのルートで実行します。

```sh
gh pr checkout 45            # PR 番号に置き換える
cd game
npm install                  # 依存関係が変わっていることがあるため毎回実行
npm run dev
```

PR のないブランチは `git switch <ブランチ名>` で切り替えます。確認が終わったら `git switch main` で戻ります。手元に未コミットの変更があると切り替えられないので、先にコミットするか `git stash` で退避してください。

進行中の PR とブランチの一覧は、リポジトリのルートで次のコマンドを実行すると表示されます。

```sh
node scripts/scope-guard/cli.mjs status
```

## 確認がうまくいかないとき

| 症状 | 対処 |
|---|---|
| 前回の位置や外見から始まる | 保存はブラウザの localStorage にあります。「さいしょから」は開始地点に戻すだけで外見は残ります。完全に初期化するには、開発者ツールで `127.0.0.1:5173` のサイトデータを削除します。 |
| キー操作が効かない | マップ画面を一度クリックしてフォーカスを戻します。 |
| `Port 5173 is in use` と出て別のポートで起動する | 別の開発サーバーが動いています。ターミナルに表示された URL を開くか、古いサーバーを止めます。 |
| `npm install` で `EPERM` が出る | `npm install --cache /tmp/slg-npm-cache` のように書き込める場所をキャッシュに指定します。 |
| ブランチを切り替えたら起動しない・型エラーが出る | `npm install` をやり直します。 |
| AI エージェントのサンドボックス内で起動した開発サーバーに変更が反映されない | サンドボックスの外のターミナルで `npm run dev` を実行します。 |

## コミット前の確認

`game/` で実行します。CI と同じ確認です。

```sh
npm run build   # 型検査とビルド
npm test        # 単体テスト
```

ブラウザでの自動テスト（E2E）は PR で CI が実行します。手元で実行する場合の準備は [game/README.md の検証](../game/README.md#検証) を参照してください。
