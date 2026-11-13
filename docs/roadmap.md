# 開発ロードマップ

幼少期から老後までの全年代を含む人生シミュレーションを完成させます。

## 開発の進め方

幼少期のマップ探索基盤は [PR #14](https://github.com/kame447/gmo-security-life-game/pull/14) で試作として `main` に取り込みました。現在の実装には四方向移動、カメラ追従、衝突、自宅・教室・コンビニへの出入り、外見変更、保存があります。数値・ビジュアル・町の構成は仮置きで、完成形の確定ではありません。詳細は [マップと探索](features/map.md) と [ゲームの起動・検証記録](../game/README.md) を参照してください。

ユーザーが確認した細かな違和感の改善は、後続の [子Issue #15](https://github.com/kame447/gmo-security-life-game/issues/15) に集約します。現段階では細部の修正に着手せず、他のゲーム体験の具体化を優先します。マップ全体や年代・イベント接続の残課題は [親Issue #7](https://github.com/kame447/gmo-security-life-game/issues/7) に残します。

次に、[Issue #18](https://github.com/kame447/gmo-security-life-game/issues/18) と [遊びの進行](features/gameplay.md) に基づき、各年代の生活内容とイベント、主要・任意タスク、節目の移行処理を設計・実装します。過去の選択が後の人生に影響する仕組みを全段階へ展開します。

最後に、ゲーム全体の遊びやすさ、日常とセキュリティイベントの配分、リスクと対処方法の伝わり方を検証します。

## タスク管理

具体的な作業と進捗は GitHub Issues / Projects、機能仕様は [機能仕様](features/README.md) で管理します。
