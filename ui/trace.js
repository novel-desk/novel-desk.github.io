// The steps of the screen, written down for the trace checks of the models in formal/ (tools/trace_check.mjs,
// NFR-MAINT-03): only when a screen test gave the page a function to write them with (globalThis.__nwTrace,
// tests/ui/lib/trace.mjs); nothing is written otherwise. Each step goes with what the screen holds after it (the state
// the desk gives, traceWith): the work read, the changes not sent, the episode open and its text box
/** @type {() => Record<string, unknown>} the desk's (given before any step) */
let state;
// the errors whose step is written down already (a send that stopped there): no 「Failed」 after them
const told = new WeakSet();

/** @param {() => Record<string, unknown>} f */
export const traceWith = f => {
  state = f;
};
/** A step, with what the screen holds after it @param {string} a @param {Record<string, unknown>} [more] */
export async function trace(a, more = {}) {
  const write = /** @type {{ __nwTrace?: (json: string) => Promise<void> }} */ (globalThis).__nwTrace;
  if (write) await write(JSON.stringify({ a, ...state(), ...more }));
}
/** The step that stopped a send (its error then is told) @param {string} a @param {object} err */
export async function traceStop(a, err) {
  told.add(err);
  await trace(a);
}
/** A send that failed: 「Failed」, unless its step is written down already @param {object} err */
export const traceFailed = err => (told.has(err) ? undefined : trace('Failed'));
