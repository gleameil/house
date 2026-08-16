// wind.ts — the balcony's wind ambience.
//
// Source is the desolation/gray-weather track from /out/, trimmed and
// compressed to assets/wind.mp3 (67 KB, well under the 300 KB the asset
// contract asks for).
//
// Note the history here, because it is a trap worth remembering: while the
// file was missing this could NOT use Parcel's `url:` import, because Parcel
// hard-fails the whole build on a missing url: asset — static or dynamic —
// rather than resolving it to a 404 at runtime. "Build against the path with
// a placeholder committed" only works when a placeholder actually exists. Now
// that the real loop is here, the import is the ordinary one.

import windLoop from 'url:../../assets/wind.mp3';
import { readSound } from '../state/inventory';

const WIND_LOOP_SRC = windLoop;

let windAudio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!windAudio) {
    windAudio = new Audio(WIND_LOOP_SRC);
    windAudio.loop = true;
    windAudio.volume = 0.5;
    // Belt-and-braces alongside the play().catch() below: some browsers
    // surface a bad source as an `error` event rather than (or in addition
    // to) a rejected play() promise. Either path is silent from here.
    windAudio.addEventListener('error', () => {});
  }
  return windAudio;
}

/** Starts the balcony wind loop, unless the shared sound setting is off.
 *  A missing file, a blocked autoplay, or sound being off all resolve to
 *  "nothing plays" — none of them are errors from this function's point
 *  of view. Safe to call more than once; it does not restart a loop
 *  that's already going. */
export function startWindAmbience(): void {
  if (readSound() === 'off') return;
  getAudio()
    .play()
    .catch(() => {}); // missing file, decode failure, or blocked autoplay: silent
}

/** Pauses the loop. Does not tear down the Audio element — calling
 *  startWindAmbience() again resumes rather than reloading. */
export function stopWindAmbience(): void {
  windAudio?.pause();
}

/** Boot-time call site not wired — see the special-effects lane report.
 *  Suggested wiring: call startWindAmbience() on entering the balcony room
 *  and stopWindAmbience() on leaving it (e.g. `if (room.id === 'balcony')
 *  startWindAmbience(); else stopWindAmbience();` inside enterRoom(), after
 *  state.room is set), rather than once at true page boot — the balcony is
 *  the only room this ambience belongs to. */
export function initWindAmbience(): void {
  startWindAmbience();
}
