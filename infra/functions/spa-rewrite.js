// 拡張子のないパス（/ や /play など）はフロントエンドのエントリポイントを返す。
// SPA を前提にした仮置き。/api/* には付けていない。
function handler(event) {
  var request = event.request;
  var last = request.uri.split('/').pop();
  if (last.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
