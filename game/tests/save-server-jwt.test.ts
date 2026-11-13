import { describe, expect, it } from 'vitest';
import { createCognitoIdTokenVerifier, IdTokenError, verifyCognitoIdToken } from '../src/save-server/jwt.mjs';
import { authConfig, signer } from './save-server-fixtures.mjs';

const keys = signer();
const verify = (token: string, jwks: unknown = keys.jwks, clockToleranceSeconds = 0) =>
  verifyCognitoIdToken(token, jwks, { ...authConfig, clockToleranceSeconds });

describe('Cognito ID token signature verification (generated keys only)', () => {
  it('accepts RS256 and exposes only the verified subject', () => {
    expect(verify(keys.token({ userId: 'bob', canSave: false }))).toEqual({ sub: 'alice' });
  });
  it.each([
    ['other pool', { iss: `${authConfig.issuer}-other` }],
    ['other client', { aud: 'other-client' }],
    ['audience list', { aud: [authConfig.clientId] }],
    ['access token', { token_use: 'access' }],
    ['missing use', { token_use: null }],
    ['expired', { exp: authConfig.nowSeconds - 1 }],
    ['at expiry', { exp: authConfig.nowSeconds }],
    ['string expiry', { exp: String(authConfig.nowSeconds + 3600) }],
    ['missing expiry', { exp: null }],
    ['future not-before', { nbf: authConfig.nowSeconds + 1 }],
    ['empty subject', { sub: '' }],
    ['oversized subject', { sub: 'x'.repeat(129) }],
    ['invalid Unicode subject', { sub: '\ud800' }],
  ] as const)('rejects %s', (_name, claims) => {
    expect(() => verify(keys.token(claims))).toThrow(IdTokenError);
  });
  it('applies explicit skew to expiry and not-before, including its strict expiry boundary', () => {
    expect(verify(keys.token({ exp: authConfig.nowSeconds - 29, nbf: authConfig.nowSeconds + 30 }), keys.jwks, 30))
      .toEqual({ sub: 'alice' });
    expect(() => verify(keys.token({ exp: authConfig.nowSeconds - 30 }), keys.jwks, 30)).toThrow('UNAUTHENTICATED');
    expect(() => verify(keys.token({ nbf: authConfig.nowSeconds + 31 }), keys.jwks, 30)).toThrow('UNAUTHENTICATED');
  });
  it.each(['none', 'HS256', 'RS512'])('rejects algorithm %s before using a key', alg => {
    expect(() => verify(keys.token({}, { alg }))).toThrow('UNAUTHENTICATED');
  });
  it('rejects an unsigned token and a changed signed payload', () => {
    const parts = keys.token().split('.');
    expect(() => verify(`${parts[0]}.${parts[1]}.`)).toThrow('UNAUTHENTICATED');
    const alternate = keys.token({ sub: 'bob' }).split('.');
    expect(() => verify(`${parts[0]}.${alternate[1]}.${parts[2]}`)).toThrow('UNAUTHENTICATED');
  });
  it('rejects a different signing key with the same kid', () => {
    const other = signer();
    expect(() => verify(other.token())).toThrow('UNAUTHENTICATED');
  });
  it('selects kid from trusted JWKS, rejects absent or duplicate matches and ignores token URLs', () => {
    const other = signer('rotated-key');
    const jwks = { keys: [...keys.jwks.keys, ...other.jwks.keys] };
    expect(verify(other.token({}, { jku: 'https://untrusted.invalid/keys', jwk: keys.jwks.keys[0] }), jwks)).toEqual({ sub: 'alice' });
    expect(() => verify(other.token())).toThrow('UNAUTHENTICATED');
    expect(() => verify(keys.token(), { keys: [...keys.jwks.keys, ...keys.jwks.keys] })).toThrow('UNAUTHENTICATED');
    expect(() => verify(keys.token({}, { kid: null }))).toThrow('UNAUTHENTICATED');
  });
  it.each([{ kty: 'oct' }, { alg: 'HS256' }, { use: 'enc' }, { key_ops: ['sign'] }, { n: 'invalid' }])(
    'rejects a key that cannot verify the expected RS256 signature (%#)', patch => {
      expect(() => verify(keys.token(), { keys: [{ ...keys.jwks.keys[0], ...patch }] })).toThrow('UNAUTHENTICATED');
    });
  it.each(['', 'a.b.c', 'a.b', 'a.b.c.d', 'x'.repeat(17000)])('rejects malformed or overlong JWT (%#)', token => {
    expect(() => verify(token)).toThrow('UNAUTHENTICATED');
  });
  it('rejects unsupported critical extensions and noncanonical base64url', () => {
    expect(() => verify(keys.token({}, { crit: ['custom'] }))).toThrow('UNAUTHENTICATED');
    expect(() => verify(keys.token({}, { b64: false }))).toThrow('UNAUTHENTICATED');
    expect(() => verify(keys.token() + '=')).toThrow('UNAUTHENTICATED');
  });
  it('uses injected JWKS and a clock evaluated after retrieval, without retaining old keys', async () => {
    const rotated = signer('new-key'); let current = keys.jwks; let now = authConfig.nowSeconds;
    const verifier = createCognitoIdTokenVerifier({ ...authConfig, getJwks: async () => current, nowSeconds: () => now });
    expect(await verifier(keys.token())).toEqual({ sub: 'alice' }); current = rotated.jwks;
    await expect(verifier(keys.token())).rejects.toThrow('UNAUTHENTICATED');
    expect(await verifier(rotated.token())).toEqual({ sub: 'alice' }); now += 3600;
    await expect(verifier(rotated.token())).rejects.toThrow('UNAUTHENTICATED');
  });
  it('hides JWKS provider errors and distinguishes unavailability from invalid credentials', async () => {
    const verifier = createCognitoIdTokenVerifier({ ...authConfig, nowSeconds: () => authConfig.nowSeconds,
      getJwks: () => { throw new Error('provider detail'); } });
    await expect(verifier(keys.token())).rejects.toMatchObject({ code: 'UNAVAILABLE', message: 'UNAVAILABLE' });
    expect(() => verify(keys.token(), null)).toThrow('UNAUTHENTICATED');
  });
  it('rejects unusable verifier configuration', () => {
    expect(() => createCognitoIdTokenVerifier({ ...authConfig, nowSeconds: () => authConfig.nowSeconds,
      issuer: '', getJwks: () => keys.jwks })).toThrow('INVALID_AUTH_CONFIGURATION');
    expect(() => verifyCognitoIdToken(keys.token(), keys.jwks, { ...authConfig, clockToleranceSeconds: -1 }))
      .toThrow('INVALID_AUTH_CONFIGURATION');
  });
});
