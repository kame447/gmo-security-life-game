import { isIP } from 'node:net';

const fields = ['SAVE_API_HOST', 'SAVE_API_PORT', 'SAVE_API_TABLE_NAME', 'AWS_REGION', 'COGNITO_ISSUER',
  'COGNITO_CLIENT_ID', 'SAVE_API_JWKS_PARAMETER', 'SAVE_API_HEALTH_PATH', 'SAVE_API_BACKEND_MODULE'];
const codes = new Set(['INVALID_CONFIGURATION', 'BACKEND_MODULE_FAILED', 'BACKEND_INITIALIZATION_FAILED',
  'LISTEN_FAILED', 'ADDRESS_IN_USE', 'STOP_FAILED']);

/** Errors expose known item names and fixed categories, never supplied values. */
export class SaveStartupError extends Error {
  constructor(code, invalidFields = []) {
    const safeCode = codes.has(code) ? code : 'BACKEND_INITIALIZATION_FAILED';
    const safeFields = fields.filter(field => invalidFields.includes(field));
    super(safeCode + (safeFields.length ? `: ${safeFields.join(', ')}` : ''));
    this.code = safeCode;
    this.fields = Object.freeze(safeFields);
  }
}

/** Pure validation; no process.env mutation, files, DNS, SDK or configuration defaults. */
export function readSaveServerConfig(environment) {
  const invalid = [];
  const value = field => typeof environment[field] === 'string' ? environment[field] : '';
  const check = (field, valid) => { if (!valid) invalid.push(field); };
  const host = value('SAVE_API_HOST');
  const port = value('SAVE_API_PORT');
  const tableName = value('SAVE_API_TABLE_NAME');
  const region = value('AWS_REGION');
  const issuer = value('COGNITO_ISSUER');
  const clientId = value('COGNITO_CLIENT_ID');
  const jwksParameterName = value('SAVE_API_JWKS_PARAMETER');
  const healthPath = value('SAVE_API_HEALTH_PATH');
  check('SAVE_API_HOST', isIP(host) !== 0 && !host.includes('%'));
  // Zero explicitly selects a local ephemeral port; no port is selected by default.
  check('SAVE_API_PORT', /^(0|[1-9][0-9]{0,4})$/.test(port) && Number(port) <= 65535);
  check('SAVE_API_TABLE_NAME', /^[A-Za-z0-9_.-]{3,255}$/.test(tableName));
  check('AWS_REGION', /^[a-z]{2}(?:-[a-z]+)+-[0-9]+$/.test(region));
  const issuerParts = /^https:\/\/cognito-idp\.([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?\/([a-z0-9-]+_[A-Za-z0-9]+)$/.exec(issuer);
  check('COGNITO_ISSUER', !!issuerParts && issuerParts[1] === region && issuerParts[2].startsWith(`${region}_`) &&
    issuer.includes(region.startsWith('cn-') ? '.amazonaws.com.cn/' : '.amazonaws.com/'));
  check('COGNITO_CLIENT_ID', /^[A-Za-z0-9]{1,128}$/.test(clientId));
  // The source identifies the current Terraform SSM parameter; acquisition is injected.
  check('SAVE_API_JWKS_PARAMETER', jwksParameterName.length <= 1024 &&
    /^\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)+jwks$/.test(jwksParameterName));
  check('SAVE_API_HEALTH_PATH', /^\/api\/[a-z0-9/_-]+$/.test(healthPath) &&
    healthPath !== '/api/saves' && !healthPath.startsWith('/api/saves/'));
  if (invalid.length) throw new SaveStartupError('INVALID_CONFIGURATION', invalid);
  return Object.freeze({ host, port: Number(port), tableName, region, issuer, clientId, jwksParameterName, healthPath });
}
