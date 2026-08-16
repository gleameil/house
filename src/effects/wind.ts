// wind.ts — balcony wind ambience.
//
// assets/wind-loop.mp3 does not exist. Nora will eventually trim it from
// the desolation/gray-weather track in /out/, and there is no ffmpeg on
// this machine to do that here. The brief for this is explicit that
// absence is the ordinary case, not a failure — but that has one real
// consequence for how this file is written, worth spelling out because it
// is not obvious:
//
// This module deliberately does NOT do `import x from 'url:../assets/
// wind-loop.mp3'`, even though that is the pattern every other asset in
// this game uses (see house.constants.ts). I confirmed empirically, in an
// isolated scratch project against this repo's own Parcel install, that
// Parcel's bundler resolves `url:` import specifiers at BUILD time and
// hard-fails the whole build if the target file does not exist — for both
// static and dynamic import forms, try/catch does not help, because the
// failure happens during bundling, before any of this module's code runs.
// A missing file behind a `url:` import is therefore a build error, not a
// runtime one, and "silent no-op" is not achievable that way.
//
// So WIND_LOOP_SRC below is a plain string — never touched by Parcel's
// asset pipeline — pointing at the path the file will live at once it's
// real. Requesting a path nothing serves is an ordinary runtime 404, which
// is precisely the kind of failure Audio.play()'s rejected promise (and
// the audio element's `error` event) already exist to represent, and both
// are swallowed below the same way playSound() in house.ts already
// swallows a blocked-autoplay rejection — same idiom, not a second audio
// path, just applied to a source that may not resolve to anything yet.
//
// THE ONE-LINE INTEGRATION STEP once wind-loop.mp3 is real: replace the
// WIND_LOOP_SRC string with a proper Parcel import, e.g.
//
//   import windLoop from 'url:../assets/wind-loop.mp3';
//   const WIND_LOOP_SRC = windLoop;
//
// so the file gets fingerprinted and bundled like every other asset. Until
// then, this plays nothing, on every browser, and throws nowhere.

import { readSound } from '../state/inventory';

const WIND_LOOP_SRC = 'assets/wind-loop.mp3';

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
