# 開発の現在地（2026-11-18）

これは2026-11-18時点でmain・Issue・PRを照合した記録である。実装の正本はmain、要件と受け入れ条件の正本は各Issue、未統合の変更は各PRとする。マージ済みとは関連機能すべての受け入れを意味しない。

## mainに統合済みのもの

マップ探索の試作（PR #14）、ミニマップ（#48・#58）、自転車の基本操作（#57）、駅の往復移動と踏切（#59）、町の配置とコンビニ移転（#69）、NPC・車・猫のドット絵調整（#72）はmainにある。町の見た目・HUD・地理の細部は [#15](https://github.com/kame447/gmo-security-life-game/issues/15) で継続する。駅・踏切と別街への移動は [#35](https://github.com/kame447/gmo-security-life-game/issues/35)・[#36](https://github.com/kame447/gmo-security-life-game/issues/36) の受け入れ条件を別途確認する。

生活基盤ではバッグ・ホットバー（PR #54）、店員との会話から始まる買い物の基本導線（#55）、スマホホーム・チャット（#49）、選択肢と状態変化を扱うイベント基盤（#51）が統合済みである。買い物の共通UIと既存店舗の動作はあっても、すべての店の商品・販売機能まで完了したわけではない。[#21](https://github.com/kame447/gmo-security-life-game/issues/21) は購入機能、[#33](https://github.com/kame447/gmo-security-life-game/issues/33) は店舗内部・店員配置を扱う。

タイトルの仮オープニングA・B・CはPR #53でmainに入り、序章とステージ進行の提案文書はPR #75で追加された。どちらも本編の進行方式まで確定させたものではない。

## 未統合・レビュー待ち

実際の町・屋内・NPCを編集してゲームへ永続反映する編集機能と、7店舗の内装再構成は [Draft PR #65](https://github.com/kame447/gmo-security-life-game/pull/65) にまとまっている。[#23](https://github.com/kame447/gmo-security-life-game/issues/23)・[#24](https://github.com/kame447/gmo-security-life-game/issues/24)・[#25](https://github.com/kame447/gmo-security-life-game/issues/25)・[#33](https://github.com/kame447/gmo-security-life-game/issues/33) は実操作・保存・再読込・利用者の明示的な受け入れまで開いたままにする。従来のサンプルエディタPR #31・#42は独立した完成版として扱わず、#65との整理が必要である。

スマホのメールは [PR #74](https://github.com/kame447/gmo-security-life-game/pull/74) と [#73](https://github.com/kame447/gmo-security-life-game/issues/73) で画面レビュー待ち。HUDはDraft PR #70、会話中のタッチ操作はDraft PR #71、看板のドット文字はDraft PR #61。自転車のタッチ操作での加速は [#66](https://github.com/kame447/gmo-security-life-game/issues/66) に残る。スマホ縦画面で屋内を拡大する案は不採用とし、[#68](https://github.com/kame447/gmo-security-life-game/issues/68) をクローズした。

探索中のBGMは [#63](https://github.com/kame447/gmo-security-life-game/issues/63) で比較案Cの採用が記録され、[PR #64](https://github.com/kame447/gmo-security-life-game/pull/64) はまだ未統合である。

## 仕様・データ保全で未完了のもの

[#20](https://github.com/kame447/gmo-security-life-game/issues/20) のローカル保存・人生イベント履歴・AWS接続・認証連携は担当者 @misanga1225 に移管済み。既存のCognitoを利用し、独自の認証を追加しない。現行セーブと別に復元可能な過去データを最大3世代保持し、唯一の復旧可能データを失う経路を作らない。退避や書込みに失敗した場合は破壊的なゲーム開始を禁止する。既存の作業ブランチをmainに統合済みとして扱わない。

オープニングはC案を初期表示にする要望があるが、本編開始・セーブとの接続とともに [#50](https://github.com/kame447/gmo-security-life-game/issues/50)・#20 の未完了事項である。保存後のタイトル復帰と「つづきから」に前回保存日時を表示する仕様も受け入れ確認が必要。

人生の進行は [#18](https://github.com/kame447/gmo-security-life-game/issues/18) を正本とする。中学生から始まる序章、制限時間と強制イベントの方式は [ストーリー案](features/story.md) の提案であり、既存の主要タスク・節目方式を置き換えるかは未決定。幸福度の評価軸と重みは [#62](https://github.com/kame447/gmo-security-life-game/issues/62) で検討中。セキュリティイベント候補も採用未決定であり、資料化を実装済みとはしない。

## 更新の原則

進捗は既存Issueへの追記を優先し、同じ修正を重複Issueにしない。PRが統合されただけで親Issueを閉じない。作業の重複は [チーム運用](team-workflow.md) と [#43](https://github.com/kame447/gmo-security-life-game/issues/43) で確認する。この文書は固定日付の記録であり、後日の判断ではGitHubの最新状態を優先する。
