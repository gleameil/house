// sound-toggle.ts — the shared on/off sound control.
//
// Currently an emoji in /in/ and /out/, and buggy there. This is a small,
// framework-free component with a stable API: create it, get back an
// element plus a couple of methods, drop the element wherever a page wants
// it. It reads and writes the ONE shared setting through readSound() /
// writeSound() in src/state/inventory.ts — never localStorage directly, see
// doc-house-state.md's storage-layer section for why (same-origin sharing
// in production, silently separate origins in local dev, and the dev shim
// that papers over that).
//
// The emoji glyphs are the placeholder art. Swapping them for
// sound-on.png / sound-off.png (neither exists yet — see the special-
// effects lane report) is meant to be a one-file change: import the two
// images at the top of this file and swap the two lines marked below for
// an <img> whose src is chosen the same way the emoji is chosen now. The
// button element, its class names, and everything that calls this module
// stay exactly the same.
//
// No cursor: pointer — house.css's rule against it applies here too. A
// hover tell is a hint system, and hint systems get designed on purpose.

import { readSound, writeSound } from '../state/inventory';
import { STORAGE_KEYS } from '../state/state.constants';

// Placeholder art — swap for sound-on.png / sound-off.png imports when they
// land, and change the two lines in render() marked "placeholder glyph".
const ICON_ON = '\u{1F50A}'; // 🔊
const ICON_OFF = '\u{1F507}'; // 🔇

export interface SoundToggleHandle {
  /** The button element. Append it wherever the page wants the control. */
  element: HTMLButtonElement;
  /** Re-reads the shared setting and updates the button. Call this if
   *  something else on the page might have changed the setting without
   *  going through this handle (cross-tab writes already trigger this
   *  automatically via the `storage` event; same-tab writes from elsewhere
   *  do not, since `storage` only fires in other documents). */
  refresh(): void;
  /** Removes the button and its listeners. */
  destroy(): void;
}

/** Builds one sound-toggle button. Does not attach it to the page — see
 *  initSoundToggle() for that, or attach `element` yourself if you want
 *  more than one on screen at once (unlikely, but the API doesn't assume
 *  a singleton). */
export function createSoundToggle(): SoundToggleHandle {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'house sound-toggle';

  const render = () => {
    const setting = readSound();
    const isOn = setting === 'on';
    button.textContent = isOn ? ICON_ON : ICON_OFF; // placeholder glyph
    button.setAttribute('aria-label', isOn ? 'Sound on' : 'Sound off');
    button.setAttribute('aria-pressed', String(isOn));
    button.classList.toggle('sound-toggle-off', !isOn);
  };

  const onClick = () => {
    writeSound(readSound() === 'off' ? 'on' : 'off');
    render();
  };

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEYS.sound) render();
  };

  button.addEventListener('click', onClick);
  window.addEventListener('storage', onStorage);
  render();

  return {
    element: button,
    refresh: render,
    destroy: () => {
      button.removeEventListener('click', onClick);
      window.removeEventListener('storage', onStorage);
      button.remove();
    },
  };
}

/** Convenience boot-time entry point: builds a toggle and appends it to
 *  `container` (document.body by default). Not called from anywhere in
 *  this lane's work — see the special-effects lane report for the exact
 *  call site to add, and note the game currently has no persistent chrome
 *  to append it to, so the call site is likely near enterRoom()'s DOM
 *  setup rather than a true one-time boot call. */
export function initSoundToggle(container: HTMLElement = document.body): SoundToggleHandle {
  const toggle = createSoundToggle();
  container.appendChild(toggle.element);
  return toggle;
}
