// Values written as TLA+ for the trace check (tools/trace_check.mjs): what the mappers of each model use.

// a string
export const str = (/** @type {string} */ s) => JSON.stringify(s);
// a boolean
export const bool = (/** @type {boolean} */ b) => (b ? 'TRUE' : 'FALSE');
// a record (fields written already)
export const rec = (/** @type {Record<string, string>} */ fields) =>
  `[${Object.entries(fields)
    .map(([k, v]) => `${k} |-> ${v}`)
    .join(', ')}]`;
// The letters of the models: typed on this device a, b, c (h1, h2, h3), written elsewhere x, y (t1, t2). A text is the
// set of them in it (the line that puts two versions side by side, the headings and the line ends are not letters)
const LETTERS = /** @type {Record<string, string>} */ ({ a: 'h1', b: 'h2', c: 'h3', x: 't1', y: 't2' });
export const CONSTANTS = 'CONSTANTS h1, h2, h3, t1, t2';
export const letters = (/** @type {string} */ text) =>
  `{${[...new Set([...text].filter(ch => ch in LETTERS))]
    .sort()
    .map(ch => LETTERS[ch])
    .join(', ')}}`;
