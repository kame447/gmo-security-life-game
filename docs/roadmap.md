# 開発ロードマップ

幼少期から老後までの人生シミュレーションを段階的に完成させる。具体的なIssueとPRの現在地は [開発の現在地（2026-11-18）](development-status.md) に記録する。

## 成立している探索・生活の基盤

幼少期のマップ探索はPR #14で試作し、ミニマップ、駅と別街への移動、踏切、自転車、学校の家具表示、町の配置とNPCの画風調整を順次mainに統合した（PR #48・#57・#59・#60・#69・#72など）。現状の町や年代は完成形ではなく、地理・描画・操作性の細部は [#7](https://github.com/kame447/gmo-security-life-game/issues/7) と [#15](https://github.com/kame447/gmo-security-life-game/issues/15) で継続する。

バッグ・ホットバー（PR #54）、店員との会話から始まる買い物の基本画面（#55）、スマホホームとチャット（#49）、状態変化のあるイベント基盤（#51）も統合済みである。全店舗の販売機能やセーブ全体を完成扱いにしない。

## 次に受け入れ・統合を進める範囲

実際の町・屋内・NPCを直接編集し、ゲームへ永続反映するエディタと7店舗の内装を、Draft PR #65および [#23](https://github.com/kame447/gmo-security-life-game/issues/23)・[#24](https://github.com/kame447/gmo-security-life-game/issues/24)・[#25](https://github.com/kame447/gmo-security-life-game/issues/25)・[#33](https://github.com/kame447/gmo-security-life-game/issues/33) に沿って確認する。実画面での利用者の受け入れ前に完成扱いしない。

生活基盤は [#20](https://github.com/kame447/gmo-security-life-game/issues/20) の安全なセーブ・復元・クラウド連携と、[#50](https://github.com/kame447/gmo-security-life-game/issues/50) のオープニング接続を整合させる。保存データの保護を緩めてゲーム開始を優先しない。メール [#73](https://github.com/kame447/gmo-security-life-game/issues/73) とスマホ・会話・自転車の操作改修も、各Issue・PRの受け入れを進める。

## 人生全体への展開

[#18](https://github.com/kame447/gmo-security-life-game/issues/18) の年代進行方式を決定し、学校・交友・仕事などの生活経験とイベントを年代をまたいで接続する。序章と時間制限・強制イベントの方式は [ストーリー案](features/story.md) にあるが、現時点では合意待ちの提案であり、従来の進行方針を勝手に置き換えない。幸福度・最終評価は [#62](https://github.com/kame447/gmo-security-life-game/issues/62) で検討する。

その後、年代ごとの町とイベントを拡充し、日常とセキュリティのイベント配分、遊びやすさ、リスクと対処方法の伝わり方を検証する。

## 管理

機能の受け入れ条件と決定はGitHub Issues、取り込み状態はPRとmain、共通仕様は [機能仕様](features/README.md) に記載する。マージ済み・レビュー待ち・提案段階を混同しない。
