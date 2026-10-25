// Once before the run: the counts of an earlier run taken away (each worker writes its own: global-teardown.mjs)
import { rmSync } from 'node:fs';
import { OUT } from './coverage.mjs';

export default function globalSetup() {
  rmSync(OUT, { recursive: true, force: true });
}
