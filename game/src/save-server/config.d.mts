export interface SaveServerConfig {
  readonly host: string;
  readonly port: number;
  readonly tableName: string;
  readonly region: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly jwksParameterName: string;
  readonly healthPath: string;
}
export type StartupCode = 'INVALID_CONFIGURATION' | 'BACKEND_MODULE_FAILED' | 'BACKEND_INITIALIZATION_FAILED' |
  'LISTEN_FAILED' | 'ADDRESS_IN_USE' | 'STOP_FAILED';
export class SaveStartupError extends Error {
  readonly code: StartupCode;
  readonly fields: readonly string[];
  constructor(code: StartupCode, invalidFields?: readonly string[]);
}
export function readSaveServerConfig(environment: Readonly<Record<string, string | undefined>>): SaveServerConfig;
