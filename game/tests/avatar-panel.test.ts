import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/session/game';
import { AvatarPanel } from '../src/ui/avatar-panel';
import { UiController } from '../src/ui/controller';
import { buildWorld } from '../src/world';

afterEach(() => vi.unstubAllGlobals());

function openDraft() {
  const game = new Game(buildWorld());
  const original = { ...game.appearance };
  game.setAppearance({ ...original, hairColor: 'black' });
  const cancel = { id: 'avatar-cancel' }, confirm = { id: 'avatar-ok' }, panelTarget = { id: 'avatar-panel' };
  vi.stubGlobal('document', { querySelector: (selector: string) => selector === '#avatar-cancel' ? cancel : null });
  const onClose = vi.fn();
  const avatar = Object.assign(Object.create(AvatarPanel.prototype), {
    game, original, selected: 0, rows: [], onClose,
    panel: { hidden: false }, stage: { classList: { remove: vi.fn() } },
  }) as AvatarPanel;
  const controller = Object.assign(Object.create(UiController.prototype), {
    game, avatar, minimap: { isOpen: false },
  }) as { onKeyDown(event: KeyboardEvent): void };
  const send = (code: string, target: object = panelTarget) => {
    const preventDefault = vi.fn();
    controller.onKeyDown({ code, target, repeat: false, preventDefault } as unknown as KeyboardEvent);
    return preventDefault;
  };
  return { game, original, avatar, onClose, cancel, confirm, send };
}

describe('appearance panel keyboard actions', () => {
  it.each(['Enter', 'Space'])('leaves %s on cancel to the button instead of committing the draft', code => {
    const { game, original, avatar, onClose, cancel, send } = openDraft();
    const preventDefault = send(code, cancel);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(avatar.isOpen).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    // The browser's native button activation invokes the existing cancel click handler.
    avatar.close(false);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(false);
    expect(game.appearance).toEqual(original);
  });

  it.each(['Enter', 'Space'])('keeps %s on confirm as a committed change', code => {
    const { game, avatar, onClose, confirm, send } = openDraft();
    expect(send(code, confirm)).toHaveBeenCalledOnce();
    expect(avatar.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(true);
    expect(game.appearance.hairColor).toBe('black');
  });

  it('Escape cancels and restores the appearance', () => {
    const { game, original, avatar, onClose, send } = openDraft();
    expect(send('Escape')).toHaveBeenCalledOnce();
    expect(avatar.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(false);
    expect(game.appearance).toEqual(original);
  });

  it('keeps arrow and WASD editing inside the panel without moving the player', () => {
    const { game, original, avatar, send } = openDraft();
    const player = { ...game.player };
    send('ArrowDown'); send('ArrowRight');
    expect(game.appearance.hairStyle).not.toBe(original.hairStyle);
    send('KeyS'); send('KeyD');
    expect(game.appearance.hairColor).not.toBe('black');
    send('KeyW'); send('KeyA');
    expect(game.appearance.hairStyle).toBe(original.hairStyle);
    expect(game.player).toEqual(player);
    expect(avatar.isOpen).toBe(true);
  });
});
