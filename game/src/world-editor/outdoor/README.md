# 屋外の操作と方針

型の先行公開。実装は次のcommitで同じAPIへ接続する。

- `assertOutdoorEdit(before, after, { areaId })`: エリア局所の方針。ワールドの登録表から呼ぶ。グローバルなメタデータと屋内出口の戻り先は既存の`assertWorldEdit`が検査する。
- `new OutdoorModel(host, areaId = 'town-main')`: `host`は既存WorldEditorModelの`initial`/`document`/`context`と`commit`を使う。別EditorSessionを作らず、屋内と屋外で同じUndo/Redo・未保存変更を共有する。
- `candidate(object, adding?)`は履歴を変えず、建物・入口・屋内出口の戻り先・人以外の調べる場所を一緒に移す候補を返す。`issues(candidate)`は導出・ワールド方針・既存の全World検証を行い、理由を返す。ドラッグはマスが変わった時だけこれを呼ぶ。
- `move`/`remove`はhostの検証つき`commit`へ渡す。`create(entryId)`/`duplicate(id)`は未確定の物を返す。`candidate(value, true)`を経てhostで確定する。
- `readOnlyReason`（移動不可）、`protectedReason`（削除/複製不可）、`rotationReason`をUIの無効理由に使う。屋外の回転は非対応で、`rotate`は理由を返して拒否する。
- 発行済みIDはモデルが保持する。モデルはエリア移動やUndo/Redoごとに作り直さず、同じ編集セッションで使い続ける。取消・削除・UndoでもIDを再利用しない。

画面・配置JSON・描画・保存口は変更しない。施設の連動の基本検証は既存`facility-link`を使う。
