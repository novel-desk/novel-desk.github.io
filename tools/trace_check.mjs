#!/usr/bin/env node
// 試験で書いた手順の記録を、formal/ のモデルの手順でたどれるかを TLC で確かめる（トレース検証、NFR-MAINT-03）。
// `node tools/trace_check.mjs`（check:all が実行する）
//
// 記録は、画面の試験（tests/ui/trace.spec.mjs）が test-results/traces/ に書く（tests/ui/lib/trace.mjs）。1 本の記録は
// 1 行 1 手順の ndjson で、1 行目が {"model": "<モデル>"}。この道具は、記録の 1 本ずつについて:
// 1. モデルごとの置き換え（tools/trace/<モデル>.mjs）で、記録をモデルの値に置き換える
// 2. formal/<モデル>TraceData.tla として書き出し、formal/<モデル>Trace.tla を TLC で実行する
// 3. 最後の行までたどれたら「合う」。たどれなければ、たどれた最後の行と、そのときのモデルの値を出して、終了コード 1 で終わる
// 4. 最後に、モデルごとに、モデルの操作（<モデル>.tla の Next）のうち、どの記録でもたどらなかった操作を出す。
//    <モデル>Trace.tla の Steps（数える操作）が Next の操作と合わないとき、記録が 1 本も無いモデルがあるときも出す。
//    どれも終了コード 1 で終わる
//
// 引数: 記録のフォルダー（省略すると test-results/traces）。TLC は formal/tla2tools.jar（コミットしない。formal/README.md）
// を、java があれば java で、無ければ podman のコンテナで実行する。サーバー版の tools/trace_check.mjs と同じ形
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const FORMAL = join(ROOT, 'formal');
const TOOLS = join(ROOT, 'tools/trace');
const JAR = join(FORMAL, 'tla2tools.jar');
const dir = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'test-results/traces');

// the model a trace is of (its first line), and its steps
/** @param {string} text */
function parse(text) {
  const lines = text
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l));
  return { model: String(lines[0]?.model ?? ''), steps: lines.slice(1) };
}

const JAVA = spawnSync('java', ['-version']).status === 0;
// a command run to its end: what it wrote, or the error that kept it from running
/** @param {string} cmd @param {string[]} args @param {object} opts @returns {Promise<{ error?: Error, out: string }>} */
const run = (cmd, args, opts) =>
  new Promise(done => {
    const p = spawn(cmd, args, opts);
    let out = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (out += d));
    p.on('error', error => done({ error, out }));
    p.on('close', () => done({ out }));
  });

// the steps of a model: the operators its Next names (each `\E x \in S :` left out, with its set)
/** @param {string} model */
function nextOf(model) {
  const src = readFileSync(join(FORMAL, `${model}.tla`), 'utf8');
  const defined = new Set([...src.matchAll(/^([A-Z]\w*)(?:\([^)]*\))? ==/gm)].map(m => m[1]));
  const next = (src.match(/^Next ==([\s\S]*?)\n(?=\S)/m) ?? ['', ''])[1].replace(/\\E\s+\w+(?:\s*,\s*\w+)*\s+\\in\s+[^:]+:/g, '');
  return [...new Set([...next.matchAll(/\b[A-Z]\w*\b/g)].map(m => m[0]).filter(n => defined.has(n)))].sort();
}
// the steps a trace spec counts (its Steps)
/** @param {string} model */
const stepsOf = model =>
  [...(readFileSync(join(FORMAL, `${model}Trace.tla`), 'utf8').match(/^Steps == \{([^}]*)\}/m)?.[1] ?? '').matchAll(/"(\w+)"/g)].map(m => m[1]);

// TLC on the trace: { took } (the model's steps taken) when the whole trace was taken; otherwise { error }
/** @param {string} name @param {{ model: string, steps: any[] }} trace @returns {Promise<{ took?: string[], error?: string }>} */
async function check(name, { model, steps }) {
  if (!/^[A-Za-z]+$/.test(model) || !existsSync(join(TOOLS, `${model.toLowerCase()}.mjs`)) || !existsSync(join(FORMAL, `${model}Trace.tla`)))
    return { error: `モデル「${model}」のトレース検証がありません（tools/trace/ と formal/<モデル>Trace.tla）` };
  if (!existsSync(JAR)) return { error: 'formal/tla2tools.jar がありません（formal/README.md の「実行のしかた」）' };
  const { toModel } = await import(join(TOOLS, `${model.toLowerCase()}.mjs`));
  let data;
  try {
    ({ data } = toModel(steps));
  } catch (e) {
    return { error: `記録をモデルの値に置き換えられません: ${/** @type {Error} */ (e).message}` };
  }
  const work = mkdtempSync(join(tmpdir(), 'nwjs-trace-'));
  try {
    for (const f of [`${model}.tla`, `${model}Trace.tla`, `${model}Trace.cfg`]) copyFileSync(join(FORMAL, f), join(work, f));
    writeFileSync(join(work, `${model}TraceData.tla`), `---- MODULE ${model}TraceData ----\n\\* ${name} (tools/trace_check.mjs)\n${data}====\n`);
    /** @param {string} jar */
    const tlc = jar => ['-cp', jar, 'tlc2.TLC', '-deadlock', '-workers', '1', '-config', `${model}Trace.cfg`, `${model}Trace.tla`];
    const r = JAVA
      ? await run('java', tlc(JAR), { cwd: work })
      : await run(
          'podman',
          [
            'run',
            '--rm',
            '-v',
            `${work}:/w:Z`,
            '-v',
            `${FORMAL}:/f:ro,z`,
            '-w',
            '/w',
            'docker.io/library/eclipse-temurin:21-jre',
            'java',
            ...tlc('/f/tla2tools.jar'),
          ],
          {},
        );
    if (r.error) return { error: `TLC を実行できません（java も podman もありません）: ${r.error.message}` };
    const out = r.out;
    // (the steps taken: the last state of the trace TLC prints)
    if (/Invariant NotDone is violated/.test(out))
      return { took: [...([...out.matchAll(/\/\\ took = \{([^}]*)\}/g)].at(-1)?.[1] ?? '').matchAll(/"(\w+)"/g)].map(m => m[1]) };
    // (stopped before it began: a module that does not parse, a value it cannot compare)
    if (!/Finished computing initial states/.test(out) || (/^Error:/m.test(out) && !/Model checking completed/.test(out)))
      return { error: `TLC が止まりました:\n${out}` };
    // the farthest line taken, and the model after it: the last one printed. None: not even the first
    const last = out
      .split(/<<\s*"reached",/)
      .slice(1)
      .at(-1);
    const n = last ? parseInt(last, 10) : 0;
    const values = last
      ? last
          .slice(last.indexOf(',') + 1)
          .split(/\n(?=\S)/)[0]
          .replace(/\s*>>\s*$/, '')
          .trim()
      : '';
    return {
      error:
        `${n} 行目までたどれました（全 ${steps.length} 行）。${n + 1} 行目をモデルの手順でたどれません:\n  ${JSON.stringify(steps[n])}\n` +
        (values ? `${n} 行目のあとのモデルの値:\n  ${values}` : ''),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const files = existsSync(dir)
  ? readdirSync(dir)
      .filter(f => f.endsWith('.ndjson'))
      .sort()
      .map(f => join(dir, f))
  : [];
if (!files.length) {
  console.error(`記録がありません: ${dir}（先に画面の試験を実行する）`);
  process.exit(1);
}
// (a few at once: each starts a JVM)
/** @type {string[]} */
const said = new Array(files.length);
/** @type {Map<string, Set<string>>} the steps taken, by model */
const taken = new Map();
let next = 0;
await Promise.all(
  [...Array(4)].map(async () => {
    while (next < files.length) {
      const k = next++;
      const trace = parse(readFileSync(files[k], 'utf8'));
      const name = files[k].slice(ROOT.length + 1);
      const r = await check(name, trace);
      if (r.took) taken.set(trace.model, new Set([...(taken.get(trace.model) ?? []), ...r.took]));
      said[k] = r.error ? `✗ ${name}（${trace.model}）: ${r.error}` : `✓ ${name}（${trace.model}）: ${trace.steps.length} 行を、モデルの手順でたどれました`;
    }
  }),
);
for (const line of said) console.log(line);
// each model's steps that no trace took (with the folder of the tests: every model with a trace spec has traces)
const models = readdirSync(FORMAL)
  .map(f => f.match(/^(\w+)Trace\.tla$/)?.[1])
  .filter(m => m && (taken.has(m) || !process.argv[2]))
  .map(m => /** @type {string} */ (m))
  .sort();
for (const model of models) {
  const all = nextOf(model);
  const counted = stepsOf(model);
  const missed = counted.filter(n => !taken.get(model)?.has(n));
  said.push(
    [...counted].sort().join() !== all.join()
      ? `✗ ${model}: ${model}Trace.tla の Steps（${counted.join('、')}）が、${model}.tla の Next の操作（${all.join('、')}）と合いません`
      : !taken.has(model)
        ? `✗ ${model}: 記録が 1 本もありません`
        : missed.length
          ? `✗ ${model}: モデルの操作 ${counted.length} 個のうち、${missed.join('、')} をどの記録でもたどっていません`
          : `✓ ${model}: モデルの操作 ${counted.length} 個を全部、記録でたどりました`,
  );
  console.log(said.at(-1));
}
process.exit(said.some(l => l.startsWith('✗')) ? 1 : 0);
