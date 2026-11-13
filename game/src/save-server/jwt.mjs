import { constants, createPublicKey, verify } from 'node:crypto';

/** Deliberately contains no token, key, provider exception or claim values. */
export class IdTokenError extends Error {
  constructor(code = 'UNAUTHENTICATED') { super(code); this.code = code; }
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const reject = () => { throw new IdTokenError(); };
function segment(text) {
  if (!text || !/^[A-Za-z0-9_-]+$/.test(text)) reject();
  const bytes = Buffer.from(text, 'base64url');
  if (bytes.toString('base64url') !== text) reject();
  return bytes;
}
function json(text) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(segment(text)));
  if (!object(value)) reject();
  return value;
}
function configuration(config) {
  if (typeof config.issuer !== 'string' || !config.issuer || typeof config.clientId !== 'string' || !config.clientId ||
      !Number.isFinite(config.clockToleranceSeconds ?? 0) || (config.clockToleranceSeconds ?? 0) < 0) {
    throw new Error('INVALID_AUTH_CONFIGURATION');
  }
}

/** Pure verification: no network, cache, global clock or token-derived key URL. */
export function verifyCognitoIdToken(token, jwks, config) {
  configuration(config);
  try {
    if (typeof token !== 'string' || token.length > 16 * 1024) reject();
    const parts = token.split('.');
    if (parts.length !== 3) reject();
    const [encodedHeader, encodedClaims, encodedSignature] = parts;
    const header = json(encodedHeader);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid ||
        header.crit !== undefined || header.b64 !== undefined) reject();
    if (!object(jwks) || !Array.isArray(jwks.keys)) reject();
    const matches = jwks.keys.filter(key => object(key) && key.kid === header.kid);
    if (matches.length !== 1) reject();
    const jwk = matches[0];
    if (jwk.kty !== 'RSA' || jwk.alg !== 'RS256' || jwk.use !== 'sig' ||
        (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes('verify')))) reject();
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048 ||
        !verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedClaims}`, 'ascii'),
          { key, padding: constants.RSA_PKCS1_PADDING }, segment(encodedSignature))) reject();
    const claims = json(encodedClaims);
    const tolerance = config.clockToleranceSeconds ?? 0;
    if (claims.iss !== config.issuer || claims.aud !== config.clientId || claims.token_use !== 'id' ||
        !Number.isFinite(config.nowSeconds) || !Number.isFinite(claims.exp) || claims.exp <= config.nowSeconds - tolerance ||
        (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > config.nowSeconds + tolerance)) ||
        typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) reject();
    // SaveService uses encodeURIComponent(sub); reject invalid Unicode before that call.
    encodeURIComponent(claims.sub);
    return { sub: claims.sub };
  } catch { throw new IdTokenError(); }
}

/** The caller owns trusted JWKS source, caching, refresh and acquisition deadlines. */
export function createCognitoIdTokenVerifier(config) {
  configuration(config);
  if (typeof config.getJwks !== 'function') throw new Error('INVALID_AUTH_CONFIGURATION');
  return async token => {
    let jwks;
    try { jwks = await config.getJwks(); }
    catch { throw new IdTokenError('UNAVAILABLE'); }
    return verifyCognitoIdToken(token, jwks, { ...config,
      nowSeconds: config.nowSeconds ? config.nowSeconds() : Date.now() / 1000 });
  };
}
