/** Server-only module. Import directly; do not export through the browser-facing barrel. */
import { jsonText, MAX_SAVE_WIRE_BYTES, object, parseEnvelope, parseWriteRequest, revision, SaveError, slotId } from './contract';
import { authorize, type SaveKey, type SaveStorage, type StoredSave } from './server';

type Attribute = { S: string } | { N: string };
export interface DynamoSaveGetInput {
  TableName: string;
  Key: Record<string, { S: string }>;
  ConsistentRead: true;
}
export interface DynamoSavePutInput {
  TableName: string;
  Item: Record<string, Attribute>;
  ConditionExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues?: Record<string, Attribute>;
}
/** Inject SDK GetItemCommand/PutItemCommand wrappers. No credentials or SDK import here. */
export interface DynamoSaveClient {
  getItem(input: DynamoSaveGetInput): Promise<{ Item?: Record<string, unknown> }>;
  putItem(input: DynamoSavePutInput): Promise<unknown>;
}
const encoder = new TextEncoder();
const MAX_ITEM_BYTES = 400 * 1024;
function keySlot(key: SaveKey): string {
  const slot = key.sk.startsWith('SAVE#') ? key.sk.slice(5) : '';
  if (!key.pk.startsWith('USER#') || !slotId(slot) || encoder.encode(key.pk).length > 2048) {
    throw new SaveError('INVALID_REQUEST');
  }
  return slot;
}
function validate(key: SaveKey, stored: StoredSave): StoredSave {
  const save = parseEnvelope(stored.save, keySlot(key));
  const authorized = authorize({ sub: stored.ownerSub }, save.slotId);
  if ('status' in authorized || authorized.pk !== key.pk || authorized.sk !== key.sk || save.revision < 1) {
    throw new SaveError('INVALID_REQUEST');
  }
  const last = parseWriteRequest({ schemaVersion: 1, ...stored.lastWrite, data: save.data });
  if (last.expectedRevision !== save.revision - 1) throw new SaveError('INVALID_REQUEST');
  return { ownerSub: stored.ownerSub, save,
    lastWrite: { idempotencyKey: last.idempotencyKey, expectedRevision: last.expectedRevision } };
}
function stringAttribute(item: Record<string, unknown>, name: string): string {
  const value = item[name];
  if (!object(value) || typeof value.S !== 'string' || Object.keys(value).length !== 1) throw new SaveError('CORRUPT_SAVE');
  return value.S;
}
function numberAttribute(item: Record<string, unknown>, name: string): number {
  const value = item[name];
  if (!object(value) || typeof value.N !== 'string' || !/^(0|[1-9]\d*)$/.test(value.N) ||
      Object.keys(value).length !== 1 || !revision(Number(value.N))) throw new SaveError('CORRUPT_SAVE');
  return Number(value.N);
}

/** Single-item CAS matches infra/dynamodb.tf's string pk/sk composite primary key. */
export class DynamoSaveStorage implements SaveStorage {
  constructor(private readonly client: DynamoSaveClient, private readonly tableName: string) {
    if (!tableName.trim()) throw new SaveError('INVALID_REQUEST');
  }
  async read(key: SaveKey): Promise<StoredSave | undefined> {
    keySlot(key);
    const { Item: item } = await this.client.getItem({ TableName: this.tableName,
      Key: { pk: { S: key.pk }, sk: { S: key.sk } }, ConsistentRead: true });
    if (item === undefined) return undefined;
    try {
      if (stringAttribute(item, 'pk') !== key.pk || stringAttribute(item, 'sk') !== key.sk) throw new SaveError('CORRUPT_SAVE');
      const raw = stringAttribute(item, 'saveJson');
      if (encoder.encode(raw).length > MAX_SAVE_WIRE_BYTES) throw new SaveError('CORRUPT_SAVE');
      const stored = validate(key, { ownerSub: stringAttribute(item, 'ownerSub'), save: JSON.parse(raw),
        lastWrite: { idempotencyKey: stringAttribute(item, 'idempotencyKey'), expectedRevision: numberAttribute(item, 'expectedRevision') } });
      if (numberAttribute(item, 'revision') !== stored.save.revision) throw new SaveError('CORRUPT_SAVE');
      return stored;
    } catch (error) {
      if (error instanceof SaveError && error.code === 'UNSUPPORTED_VERSION') throw error;
      throw new SaveError('CORRUPT_SAVE');
    }
  }
  async compareAndSwap(key: SaveKey, expectedRevision: number, next: StoredSave): Promise<boolean> {
    const stored = validate(key, next);
    if (!revision(expectedRevision) || expectedRevision !== stored.lastWrite.expectedRevision) throw new SaveError('INVALID_REQUEST');
    const item: Record<string, Attribute> = {
      pk: { S: key.pk }, sk: { S: key.sk }, ownerSub: { S: stored.ownerSub },
      revision: { N: String(stored.save.revision) }, saveJson: { S: jsonText(stored.save, MAX_SAVE_WIRE_BYTES) },
      idempotencyKey: { S: stored.lastWrite.idempotencyKey }, expectedRevision: { N: String(expectedRevision) },
    };
    // All attributes are scalar. Counting decimal text plus one byte per N overestimates
    // DynamoDB's number encoding; count actual UTF-8 strings, not escaped HTTP JSON.
    const itemBytes = Object.entries(item).reduce((sum, [name, value]) => sum + encoder.encode(name).length +
      ('S' in value ? encoder.encode(value.S).length : encoder.encode(value.N).length + 1), 0);
    if (itemBytes > MAX_ITEM_BYTES) throw new SaveError('TOO_LARGE');
    const condition: Pick<DynamoSavePutInput, 'ConditionExpression' | 'ExpressionAttributeNames' | 'ExpressionAttributeValues'> = expectedRevision === 0 ? {
      ConditionExpression: 'attribute_not_exists(#pk)', ExpressionAttributeNames: { '#pk': 'pk' },
    } : {
      ConditionExpression: '#revision = :expected AND #owner = :owner',
      ExpressionAttributeNames: { '#revision': 'revision', '#owner': 'ownerSub' },
      ExpressionAttributeValues: { ':expected': { N: String(expectedRevision) }, ':owner': { S: stored.ownerSub } },
    };
    try {
      await this.client.putItem({ TableName: this.tableName, Item: item, ...condition });
      return true;
    } catch (error) {
      if (object(error) && error.name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }
}
