// virus-modal.ts — the fake "YOUR COMPUT3R IS INFECTED111!!" popup.
//
// A joke about a 90s virus popup, and it has to read instantly as a joke.
// That job now belongs to Nora's drawing (assets/malwaremodal.png) rather
// than to CSS: the hand-drawn card IS the comic register, so this file
// supplies only the arrival, the wobble and the two ways out. The CSS
// placeholder it replaces built the same joke out of border-radius and a
// clashing drop shadow.
//
// It must never be mistaken for a real browser or OS dialogue — no window
// chrome, no title bar, no native-looking button, no system colors. A
// drawing cannot accidentally acquire any of those, which is rather the
// point of using one.
//
// Triggered by finding the thumb drive; see FLOURISHES in house.ts.

import malwareModal from 'url:../../assets/malwaremodal.png';

const AUTO_DISMISS_MS = 4000;

/** Pops the fake virus modal onto the page. Dismissible two ways, both
 *  routed through the same guarded dismiss() so clicking right before the
 *  auto-fade (or after it starts) can't double-fire the removal: a click
 *  anywhere on the drawing, or ~4s of nobody doing anything about it. */
export function showVirusModal(): void {
  const modal = document.createElement('img');
  modal.src = malwareModal;
  modal.className = 'house virus-modal';
  modal.alt = 'YOUR COMPUT3R IS INFECTED111!!';
  modal.draggable = false;
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
