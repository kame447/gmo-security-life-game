export interface IdTokenConfiguration {
  issuer: string;
  clientId: string;
  /** Explicit opt-in; default 0 seconds. */
  clockToleranceSeconds?: number;
}
export class IdTokenError extends Error {
  readonly code: 'UNAUTHENTICATED' | 'UNAVAILABLE';
  constructor(code?: 'UNAUTHENTICATED' | 'UNAVAILABLE');
}
export function verifyCognitoIdToken(token: string, jwks: unknown,
  config: IdTokenConfiguration & { nowSeconds: number }): { sub: string };
export function createCognitoIdTokenVerifier(config: IdTokenConfiguration & {
  getJwks: () => unknown | Promise<unknown>;
  nowSeconds?: () => number;
}): (token: string) => Promise<{ sub: string }>;
