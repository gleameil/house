// virus-modal.ts — the fake "YOUR COMPUT3R IS INFECTED111!!" popup.
//
// A joke about a 90s virus popup, and it has to read instantly as a joke:
// no window chrome, no title bar, no native-looking button — a rotated,
// wobbling, hand-drawn-edged card in clashing colors with a deliberately
// bad drop shadow, per house-briefs/00-CONTRACTS.md's "Fake virus modal"
// entry and the special-effects brief. It must never be mistaken for a
// real browser or OS dialogue.
//
// Not wired to anything yet — see showVirusModal()'s doc comment for the
// suggested trigger. Exported and uncalled, same as the sound toggle and
// the wind ambience in this directory.

const AUTO_DISMISS_MS = 4000;

/** Pops the fake virus modal onto the page. Dismissible two ways, both
 *  routed through the same guarded dismiss() so clicking right before the
 *  auto-fade (or after it starts) can't double-fire the removal: a click
 *  anywhere on the card, or ~4s of nobody doing anything about it.
 *
 *  Nothing calls this yet. The obvious trigger is finding `thumb-drive`
 *  ("the sketchy thumb drive," spare room) — it is already named for the
 *  joke. A one-line way to wire it once find() is free to change again:
 *  add `'thumb-drive': flourishVirus` to FLOURISHES, where flourishVirus
 *  calls showVirusModal() and returns 0 (no need to hold the found-fade
 *  for a full-screen popup the player has to dismiss anyway). */
export function showVirusModal(): void {
  const modal = document.createElement('div');
  modal.className = 'house virus-modal';
  modal.setAttribute('role', 'alert');

  const title = document.createElement('div');
  title.className = 'virus-modal-title';
  title.textContent = '!! WARNING !!';

  const body = document.createElement('div');
  body.className = 'virus-modal-body';
  body.textContent = 'YOUR COMPUT3R IS INFECTED111!!';

  const hint = document.createElement('div');
  hint.className = 'virus-modal-hint';
  hint.textContent = '(click to make it go away)';

  modal.append(title, body, hint);
  document.body.appendChild(modal);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    modal.classList.add('virus-modal-fading');
    modal.addEventListener('transitionend', () => modal.remove(), { once: true });
  };

  modal.addEventListener('click', dismiss);
  window.setTimeout(dismiss, AUTO_DISMISS_MS);
}
