import { EditorValidationError, type EditOperation, type EditorDocument, type EditorInteraction } from '../editor/index.ts';

/** EditorSession and the GUI's EditorModel can both provide this shared history port. */
export interface NpcEditPort {
  readonly document: EditorDocument;
  commit(operations: readonly EditOperation[]): EditorDocument;
}

export type NpcAttributes = Pick<EditorInteraction, 'name' | 'sprite' | 'facing' | 'solid' | 'w' | 'h' | 'eventKey' | 'lines'>;
export interface NpcPosition { areaId: string; x: number; y: number }

const ATTRIBUTES: ReadonlySet<string> = new Set(['name', 'sprite', 'facing', 'solid', 'w', 'h', 'eventKey', 'lines']);
function fail(path: string, code: string, message: string): never {
  throw new EditorValidationError([{ path, code, message }]);
}

/** The backend validates all common shape, ID, collision, bounds and reference rules. */
function validateNpc(npc: EditorInteraction): void {
  if (!npc || typeof npc !== 'object' || Array.isArray(npc) || npc.kind !== 'npc') {
    fail('interaction.kind', 'npc-kind', 'Expected an NPC interaction');
  }
  if (!Array.isArray(npc.lines) || npc.lines.length === 0) {
    fail('interaction.lines', 'required', 'An NPC needs at least one non-empty dialogue line');
  }
}

/**
 * NPC-specific operations over the shared editor session. Selection remains in the
 * caller: select() looks up a stable ID without creating a second UI selection state.
 */
export class NpcEditor {
  private readonly port: NpcEditPort;
  constructor(port: NpcEditPort) { this.port = port; }

  list(areaId?: string): EditorInteraction[] {
    return this.port.document.interactions.filter(i => i.kind === 'npc' && (areaId === undefined || i.areaId === areaId))
      .map(i => structuredClone(i));
  }
  select(id: string): EditorInteraction | null { return this.list().find(i => i.id === id) ?? null; }

  add(npc: EditorInteraction): EditorDocument {
    validateNpc(npc);
    return this.port.commit([{ type: 'add', table: 'interactions', id: npc.id, after: npc }]);
  }
  move(id: string, position: NpcPosition): EditorDocument {
    const before = this.requireNpc(id);
    if (!position || typeof position !== 'object' || Array.isArray(position)) fail('position', 'type', 'Expected an NPC position');
    const after = { ...before, areaId: position.areaId, x: position.x, y: position.y };
    validateNpc(after);
    return this.port.commit([{ type: 'move', table: 'interactions', id, before, after }]);
  }
  update(id: string, changes: Partial<NpcAttributes>): EditorDocument {
    const before = this.requireNpc(id);
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) fail('changes', 'type', 'Expected NPC attributes');
    for (const key of Object.keys(changes)) if (!ATTRIBUTES.has(key)) fail(`changes.${key}`, 'unknown-field', 'This attribute cannot be edited here');
    const after = { ...before, ...changes };
    validateNpc(after);
    return this.port.commit([{ type: 'update', table: 'interactions', id, before, after }]);
  }
  remove(id: string): EditorDocument {
    const before = this.requireNpc(id);
    return this.port.commit([{ type: 'delete', table: 'interactions', id, before }]);
  }

  private requireNpc(id: string): EditorInteraction {
    return this.select(id) ?? fail('interaction.id', 'missing-npc', `NPC ${id} does not exist`);
  }
}
