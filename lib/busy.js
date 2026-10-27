// 待ちの帯 (DESK-OPS-05, B4): an operation that waits (GitHub, the device's store) says what it is doing over the
// screen once it has taken longer than BUSY_WAIT, so that one ending at once shows nothing for an instant. Several at
// once: the band stays until the last one ends, and says what the one started last is doing. A button given cannot be
// pressed again meanwhile (put back as it was when the operation ends, failed or not). As spin-delay's useSpinDelay
// (github.com/smeijer/spin-delay: a delay before the spinner is shown), without its least time shown. The band and the
// timer are given (ui/dom.js: the page's), so that this is run without a browser (tests/unit/busy.test.mjs)

export const BUSY_WAIT = 300;

/**
 * @typedef {object} Band
 * @property {(text: string) => void} show the band shown with this text (or its text changed, while shown)
 * @property {() => void} hide
 * @property {(f: () => void, ms: number) => unknown} later
 * @property {(timer: unknown) => void} cancel
 */
/** @typedef {{ disabled: boolean }} Pressable a button */

/**
 * @param {Band} band
 * @returns {<T>(text: string, work: () => Promise<T>, button?: Pressable | null) => Promise<T>}
 */
export function busyBand(band) {
  /** @type {{ text: string }[]} the operations running, in the order they started */
  const running = [];
  /** @type {unknown} the band waited for (null: none) */
  let timer = null;
  let shown = false;
  const latest = () => /** @type {{ text: string }} */ (running.at(-1)).text;
  return async (text, work, button = null) => {
    const op = { text };
    running.push(op);
    const was = button?.disabled ?? false;
    if (button) button.disabled = true;
    if (shown) band.show(text);
    else if (timer === null)
      timer = band.later(() => {
        timer = null;
        shown = true;
        band.show(latest());
      }, BUSY_WAIT);
    try {
      return await work();
    } finally {
      running.splice(running.indexOf(op), 1);
      if (button) button.disabled = was;
      if (running.length) {
        if (shown) band.show(latest());
      } else {
        if (timer !== null) band.cancel(timer);
        timer = null;
        if (shown) band.hide();
        shown = false;
      }
    }
  };
}
