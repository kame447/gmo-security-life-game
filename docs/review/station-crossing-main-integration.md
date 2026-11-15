# 駅・街間移動・踏切の main 統合と検証

2026-11-15。対象は [#35](https://github.com/kame447/gmo-security-life-game/issues/35)・[#36](https://github.com/kame447/gmo-security-life-game/issues/36)、親は #7。新規 Issue は作成していない。

## 統合範囲

独立 worktree の `feat/station-crossing-main-integration` で、元候補 `feat/crossing-gates` の `e80a421` に `origin/main` の `8c9e1a8` を取り込んだ。共通祖先は `ee756d5`。main にあるスマホ・人生イベント・横向きスプライトと文書を維持し、駅と踏切の変更を残した。

衝突を解消したのは次の3ファイル。

| ファイル | 残した処理と接続 |
| --- | --- |
| `game/src/main.ts` | main のスマホ、人生イベント、共通モーダル、レビュー時の保存隔離を維持。改札の操作を駅へ渡し、それ以外は人生イベントへ渡す。 |
| `game/src/session/game.ts` | main の資産・スマホ・保存を維持し、列車の安全な到着検証と通常の `area-enter` 通知を追加。位置の setter で通信場所も切り替えてから通知する。 |
| `game/src/ui/controller.ts` | main のモーダル登録と入力処理を維持し、乗車中は移動・ほかのモーダル・地図・リセット・タッチ入力を抑止する。 |

`game/src/map/explorer.ts`、`game/src/render/renderer.ts`、`game/src/app/loop.ts`、`game/src/world/`、`game/src/town-train/`、`travel/session.ts`、`travel/choreo.ts` は `e80a421` と同一。駅構内のホーム1面・線路1本、屋外の2線と分岐、鉄道橋、2町5踏切、防護柵、内側からの退出を保った。

PR #57（i2rin、`feat/bicycle-ride`）とは `explorer.ts`・`renderer.ts` の範囲が重なる。これは元候補からの差分で、今回は両ファイルを追加編集していない。共有の `session/game.ts`・`ui/controller.ts` も #57 と重なるため、後の統合順の調整が必要。#54・#55・#57 の変更は取り込んでいない。既存 worktree と main への変更は行わず、この枝から main へのマージも行わない。

## 統合検証で再現して修正した不具合

到着位置の確定後、下車して改札外まで歩く演出中に入力が戻っていた。PC の実キー操作で、到着側の主人公が `station-neighbor-interior` の x=120 から108.6へ動き、向きも下から左に変わった。

「乗車の決定から改札外まで入力を受け付けない」という明示要件の違反として修正した。L=8、S=4、優先度=32。出発側の検査は通り、到着側だけで失敗したため、両方を検査する E2E を追加した。

原因は、到着時に `TrainTravelSession.commitArrival()` が状態を閉じ、パネルの `isOpen` がその状態だけを読んでいたこと。`TrainTravelPanel` は演出中の状態も保持し、改札外に着くまで `isOpen` を維持するよう修正した。キーの処理と、旧い保存からホーム側を出る動きも同じ終了処理へそろえた。

元の `e80a421` にも同じ `isOpen` と到着時の状態遷移があり、旧 UI も `travel.isOpen` を入力抑止の条件にしていた。親が main の資産・スマホを前提にする試験用の準備と検査だけを外し、旧5288へ新しいブラウザ context で実行したところ、同じ到着側の入力で x=120→108.6、下向き→左向きの変化を再現した。出発側の同じ検査は通過。サーバー・作業ツリーは変更せず、元 worktree は `e80a421` の clean な状態を維持した。main 統合で生じた回帰ではなく、元候補にあった欠陥と確認した。旧5288には修正を加えていない。

## 検証結果

ビルドと単体試験はこの worktree で実行した。ブラウザは子セッションの Chromium 起動が macOS の MachPort 権限で拒否されたため、親 SolarNoether が同じ worktree の配信を確認して実行した。検証用サーバーは `127.0.0.1:5297`。既存の5288は変更していない。

| 検査 | 結果 |
| --- | --- |
| `npm run build` | PASS。編集データ検証・TypeScript・Vite build。 |
| `npm test` | Vitest 42ファイル482件、CLI 13件 PASS。 |
| `git diff --check` | PASS。ソースの衝突マーカーなし。 |
| 統合 UI E2E | 修正後9/9 PASS。PC1280×800・スマホ390×844/844×390で往復。出発側・到着側の入力抑止、到着通知1回、改札外での操作復帰、資産・外見・スマホと保存再開を検査。 |
| 乗降車 E2E | 修正後11/11 PASS。元の町から駅までの徒歩、行き先の決定、乗降車と帰路、保存再開、動きを減らす設定、スマホ縦横のタッチ。 |
| 踏切 E2E | 修正後170項目 PASS。全5踏切×3画面、北南・歩走の手動退出60ケース、新規進入の拒否、開放、全体地図中の退避、保存再開。安全検査3465フレームで列車との重なりなし、ページ・コンソールエラー0。 |
| 撮影 | 修正後87枚・27本、エラー0。 |
| 踏切の実操作録画 | 3/3 PASS。上キーで閉鎖中の内側から退出、下キーで再進入拒否、列車通過と開放後に下キーで横断。 |
| 定期列車・駅構造・ミニマップ | 3/3、19項目、15/15 PASS。 |
| 人生イベント | 7項目 PASS。選択・結果、履歴による台詞、タッチ、リセット、エラーなし。 |
| スマホ・チャット | 4項目・5項目 PASS。入力排他、保存、通信場所、レビュー時の保存隔離、IME、タッチ等。 |
| メニュー配置 | 390×720・640×360の2/2 PASS。それぞれ12地点。 |
| 基本探索 E2E | exit 0、PASS24項目、FAIL0、ページ・コンソールエラー0。屋内外、衝突、外見、地図、保存再開、フォーカス離脱を含む。 |

追加単体試験は、駅と人生イベントの受け口の共存、往復時の資産・外見・スマホ・人生履歴の維持、保存された到着の復元、通信場所を切り替える境界、共通モーダルとの排他を扱う。人生イベントの状態・履歴の永続保存は main と同じく未対応。

## 再実行と証跡

`game/` でサーバーを起動し、空いているポートを `SLG_URL` に指定する。

```sh
npm run build
npm test
SLG_URL=http://127.0.0.1:5297 node scripts/e2e-station-main-integration.mjs
SLG_URL=http://127.0.0.1:5297 node scripts/e2e-train-travel.mjs
SLG_URL=http://127.0.0.1:5297 node scripts/e2e-crossing-gates.mjs
SLG_URL=http://127.0.0.1:5297 node scripts/capture-crossing-gates.mjs
```

今回のローカル証跡は `/private/tmp/slg-audit/OliveDarwin/station-crossing-main-integration/`。`build-final.log`・`unit-final.log`、`logs/fixed/`、`fixed/` が修正後の記録。修正前の `logs/e2e-station-main-integration-r2.log` は実際の移動を検出した失敗記録。旧候補での再現は `logs/arrival-input-probe-on-e80a421.log` と `probe-e80a421/probe-script.mjs`。`source-manifest-final.json` は修正後のソース102ファイルの SHA-256。

PR 本文用の動画は、`attachments/crossing-controls.webm`（PC1280×800、15.64秒、5,811,820bytes）と `attachments/station-boarding.webm`（スマホ390×844、16.72秒、1,392,794bytes）。異なる2操作を収録し、両方の全フレームのデコードと動画コマを確認した。いずれもVP9/WebM、10MB未満。`attachments/metadata.json` に形式とSHA-256を記録した。

撮影用の初期位置・時刻の準備と、実際のキー／タッチ操作による検査を区別する。ブラウザのスマホ表示での検査であり、実機 GPU の表示確認や最終的な数値の採用を意味しない。[PR #59](https://github.com/kame447/gmo-security-life-game/pull/59) に実操作動画2本を添付済み。mainへのマージは行わない。

既存Issueへの結果追記は親が代行した。[#35の結果](https://github.com/kame447/gmo-security-life-game/issues/35#issuecomment-6889452875)・[#36の結果](https://github.com/kame447/gmo-security-life-game/issues/36#issuecomment-6889453104)。新規Issueは作成していない。

## PR #59 の Ubuntu CI と出力先

[初回のBrowser E2E](https://github.com/kame447/gmo-security-life-game/actions/runs/43679055459) では、踏切・main統合UIの2本がMac固有の既定パスへ書こうとして、Ubuntuで `mkdir` の `EACCES` になった。CIは `SLG_SHOTS` を渡していたが、この2本は読んでいなかった。

`scripts/browser-output.mjs` で出力先を `SLG_OUTPUT` → `SLG_SHOTS` → `RUNNER_TEMP/slg-e2e/<script名>` → `os.tmpdir()/slg-e2e/<script名>` の順に解決する。明示した出力先はそのまま使い、環境変数がない場合もOSに合った一時フォルダへ保存する。踏切・main統合UI・定期列車・乗降車のE2Eと、踏切撮影・旧版比較録画に適用した。旧版録画の `SLG_OUT` と乗降車録画の `SLG_VIDEO` も保持する。ゲームの製品コードとCIの実行対象は変更しない。

Browser E2Eの証拠は `browser-e2e-<run_id>-<attempt>` artifact（7日保持）へ保存する。展開したルートには各 `e2e-*.log` と画像フォルダがあり、踏切は `e2e-crossing-gates/e2e-summary.json`、main統合UIは `e2e-station-main-integration/summary.json` と画像が入る。`tests/browser-output.test.ts` は出力先の優先順、OSの既定値、両テストの出力フォルダで実際にJSONを書けることを検査する。
