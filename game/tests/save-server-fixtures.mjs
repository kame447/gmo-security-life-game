import { generateKeyPairSync, sign } from 'node:crypto';
import { request as httpRequest } from 'node:http';

export const authConfig = { issuer: 'https://cognito-idp.ap-northeast-1.amazonaws.com/test-pool',
  clientId: 'test-client', nowSeconds: 1_800_000_000 };
export function signer(kid = 'test-key') {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] };
  return { jwks, token(claims = {}, header = {}) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = `${encode({ alg: 'RS256', kid, ...header })}.${encode({ iss: authConfig.issuer,
      aud: authConfig.clientId, token_use: 'id', sub: 'alice', exp: authConfig.nowSeconds + 3600, ...claims })}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
  } };
}
export async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  return `http://127.0.0.1:${server.address().port}`;
}
export async function close(server) {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  });
}
/** Raw chunking and repeated headers; errors deliberately hide all request bytes. */
export function rawRequest(url, { method = 'PUT', headers = {}, chunks = [], finish = true } = {}) {
  return new Promise((resolve, reject) => {
    const requestHeaders = Array.isArray(headers) ? ['Host', new URL(url).host, ...headers] : headers;
    const request = httpRequest(url, { method, headers: requestHeaders }, response => {
      const received = [];
      response.on('data', chunk => received.push(chunk));
      response.on('error', () => reject(new Error('TEST_RESPONSE_FAILED')));
      response.on('end', () => {
        try { resolve({ status: response.statusCode, headers: response.headers,
          body: JSON.parse(Buffer.concat(received).toString('utf8')) }); }
        catch { reject(new Error('TEST_RESPONSE_INVALID')); }
        finally { request.destroy(); }
      });
    });
    request.on('error', () => reject(new Error('TEST_REQUEST_FAILED')));
    request.setTimeout(2500, () => request.destroy(new Error('TEST_REQUEST_TIMEOUT')));
    request.flushHeaders();
    for (const chunk of chunks) request.write(chunk);
    if (finish) request.end();
  });
}
