# 買い物画面の実行画像

2026-11-15に利用者が承認した `434938b` の画面を、main `ceedf04` に統合した `5903d4d` で撮影した。ShopPanel・CSS・アイコンは承認版と同一の内容。画像は加工せず、ゲームをブラウザで操作して取得した。

| 画面 | あいさつ | 商品の選択と説明 | 個数2の購入確認 |
| --- | --- | --- | --- |
| PC 1280×800 | [画像](desktop-greeting.png) | [画像](desktop-selected.png) | [画像](desktop-confirm.png) |
| スマホ縦 390×844 | [画像](portrait-greeting.png) | [画像](portrait-selected.png) | [画像](portrait-confirm.png) |
| スマホ横 844×390 | [画像](landscape-greeting.png) | [画像](landscape-selected.png) | [画像](landscape-confirm.png) |

PCはマウス、スマホサイズはタッチを有効にしたheadlessブラウザ。実機での確認は含まない。所持金・商品・価格はレビュー用の暫定データで、通常の保存データは読み書きしない。

`game/scripts/shots-shop-pr.mjs` で再撮影できる。あいさつの撮影中だけブラウザの時計を止め、挨拶が終わる前のフレームを撮る。文字・CSS・配置・ゲームの処理は書き換えない。撮影後は時計を再開する。
