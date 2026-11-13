# スマホの通信容量

対象: [Issue #22](https://github.com/kame447/gmo-security-life-game/issues/22)。通信容量の計算・設定・保存欄の契約。画面とゲームへの接続はスマホ機能で扱う。

## 利用者の指定と未決定事項

スマホを所持して開いている間、自宅の外では経過時間に比例して通信残量を減らす。自宅の中では減らさず、残量は0未満にしない。自宅の判定には既存のエリア・施設IDを使う。他の施設を無料利用できる場所として追加しない。

上限・速度・回復タイミング・枯渇時の制限は未決定。pause中・タブ非表示中・ゲームを閉じている間の扱いも未決定で、暫定の既定値は消費しない。以下の数値・設定の組合せは比較用の候補であり、最終仕様ではない。

## ファイルと設定

| ファイル | 責務 |
| --- | --- |
| game/src/phone/budget-config.ts | 暫定の数値・ポリシーと型 |
| game/src/phone/budget.ts | 時刻を明示して渡す残量計算、自宅判定、容量欄の修復 |
| game/tests/phone-budget.test.ts | 境界・時間・保存・イベント順序の単体検証 |

| 設定 | 暫定の既定値 | 切替可能な扱い |
| --- | --- | --- |
| capacityMb | 5000 | 正の有限値。表示と計算のゲーム内単位MB |
| consumptionMbPerSecond | 0.1 | 非負の有限値。0なら消費しない |
| homeAreaIds | home-family-interior | 自宅とする既存の屋内エリアID |
| homeFacilityIds | home-family | 自宅とする既存施設ID。解決済みの屋内施設だけを渡す |
| pausedUsage / hiddenUsage | ignore / ignore | ignore または consume |
| offlineUsage | ignore | ignore または consume-if-active |
| recovery | manual | 明示的な回復イベント、または on-home-entry |
| exhaustion | none | 制限なし、または block-network |
| largeGapMs / largeGapUsage | 60000 / consume | 大きな時刻差を丸ごと消費、または丸ごと無視 |

施設IDの一致だけで、屋外の家の前を自宅内と判定しない。areaKind が indoor で、エリアIDまたは解決済み施設IDが設定に一致する場合に自宅とする。

largeGapUsage の consume は、表示中・非pauseの通常の経過に一定速度を使うための暫定値。pause/非表示/オフラインの既定値とは別である。ignore を選んだ場合は、連続するサンプルの間隔が閾値を超えた区間全体を消費しない。フレームごとに dt を小さく丸める処理は行わない。どちらを選ぶかは今後の判断対象。

on-home-entry は、自宅外から自宅内へ変わるイベントで補充する。保存を自宅で読み込むだけでは補充しない。block-network は networkAllowed の値を変え、画面側が通信操作の可否へ接続する。既定の none では残量0でも制限を加えない。閉じる・戻るやオフラインの画面まで強制的に閉じる設定ではない。

## 接続API

```ts
const budget = new PhoneDataBudget(settings, savedPhone?.dataBudget, Date.now());

// 時刻は同じセッションの単調時計。イベント後の状態を渡す。
budget.update(performance.now(), {
  owned, open, areaId, areaKind, facilityId, paused, visible,
});

const display = { remainingMb: budget.remainingMb, capacityMb: budget.capacityMb };
const canUseNetwork = budget.networkAllowed;
```

update は、保存していた直前の状態でその時刻までを精算してから、新しい状態へ切り替える。フレームの更新に加え、開く/閉じる、所有の変更、エリア移動、pauseの開始/終了、visibilitychange の時刻でも呼ぶ。同じ時刻の複数イベントは時間を重ねて消費しない。会話や他パネルがスマホを閉じる場合も、同じ契約で open=false を渡す。

remainingMb/capacityMb/networkAllowed の読取は時計を進めない。描画前・保存前に呼び出し側で update する。設定は生成時に複製し、入力の配列を後から書き換えても既存の計算へ影響しない。モジュール自身はタイマー、保存、画面・ゲームの変更を行わない。

同じ消費区間の開始時刻と残量を基準に計算するため、フレーム数に応じて小数の誤差が積み重ならない。無効な時刻と同一セッション内の時計の逆行は無視する。別セッションでは保存欄から新しいインスタンスを作り、新しい単調時計で開始する。

明示的な回復イベントは `budget.replenish(nowMs, context, amountMb?)` を呼ぶ。先にその時刻までの消費を精算し、量を省略すれば上限まで、指定すれば上限を超えない範囲で加算する。回復イベントを発生させる物語や画面の採用はこの契約で決めない。

## phone欄への保存と修復

保存直前に update し、既存の phone 欄の中へ次を格納する。

```ts
phone: {
  v: 1,
  owned: phoneModel.isOwned,
  dataBudget: budget.save(Date.now()),
}
```

dataBudget は `v: 1`・`remainingMb`・`capacityMb`、任意の `savedAtEpochMs`・`activeAtSave` を持つ。parsePhoneDataSave はこの容量欄だけを修復する。欠落した旧保存や壊れた残量は設定上限へ戻し、有効な0は保持する。現在の設定が容量上限を決め、保存残量が新上限を超えれば上限までにする。保存された古い上限で新しい設定を上書きしない。所有フラグ、位置、外見、所持品は呼び出し側で別々に保持する。

通常の保存は `budget.save()` でもよく、単調時計の時刻や開いている画面を復元しない。既定の offlineUsage=ignore は、ゲームを閉じていた時間を計算へ入れない。

consume-if-active を明示的に選んだ場合だけ、有効な savedAtEpochMs と activeAtSave=true、および読込時のepoch時刻が揃えば、その差を消費する。これは保存時の消費条件が続くという比較用の扱い。保存がpause中や自宅内なら activeAtSave=false となる。欠落・逆行した壁時計の組は無視する。日付変更での回復やバックグラウンド進行は、この設定以外に追加しない。

## 検証と接続の境界

`cd game && npm test` と `npm run build` で確認する。単体テストは既存の自宅IDの存在、内外、1/15/30/60/144回毎秒の同じ残量、0下限、pause/非表示、時刻逆行・大きな飛び、保存・新しい時計での復帰、旧/壊れた容量欄、回復、所有変更・会話/他パネル・エリア移動のイベント順序を扱う。

このブランチで検証したのは独立したロジックと保存欄の契約。PhoneModel/Game、通常セーブ、UIの実イベントへの接続、入力の隔離、画面の採否はスマホの結合版で確認する。UI採用前のPRやマージは行わない。
