'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { compact, compactTree, delta, readCommand, waitCommand, waitForChange, cli, MAX_BYTES } = require('../scripts/uv_economy.cjs');

const ID = '0123456789abcdef0123456789abcdef';
const OTHER_ID = 'fedcba9876543210fedcba9876543210';
const ATTENTION = { checkpoint: 'needs_attention', report: { status: 'needs_attention' } };

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uv-economy-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = path.join(root, 'runtime');
  await fs.mkdir(runtime);
  return {
    root, runtime,
    async record(name, value, id = ID) {
      const directory = path.join(runtime, 'runs', id);
      await fs.mkdir(directory, { recursive: true });
      const file = path.join(directory, name);
      await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
      return file;
    },
  };
}

test('compact strips names, paths, coordinates, raw logs, and unknown keys', () => {
  const report = compact({
    status: 'controls_observed', action: 'inspect', targetInputSent: false,
    scanButtonClicked: false, printStartButtonClicked: false,
    activeJobState: 'idle', count: 3,
    name: 'SECRET CUSTOMER', target: 'SECRET CUSTOMER',
    path: 'D:\\private\\job.pdf', x: 844, y: 119,
    log: 'SECRET LOG', error: 'SECRET ERROR',
    nested: { password: 'SECRET PASSWORD' }, timestamp: 'SECRET DATE',
  });
  assert.deepEqual(report, {
    status: 'controls_observed', action: 'inspect', targetInputSent: false,
    scanButtonClicked: false, printStartButtonClicked: false,
    activeJobState: 'idle', count: 3,
  });
  assert.doesNotMatch(JSON.stringify(report), /SECRET|D:|private|844|119/);
});

test('unknown status and active job state never become ready or successful', () => {
  assert.deepEqual(compact({
    status: 'ready SECRET D:\\private', action: 'arbitrary SECRET',
    activeJobState: 'completed SECRET', count: '12',
  }), { status: 'needs_attention', action: 'unknown', activeJobState: 'unknown' });
  assert.deepEqual(compact({ status: 'completed', activeJobState: 'ready' }), {
    status: 'needs_attention', activeJobState: 'unknown',
  });
});

test('scan and print clicks remain machine and UI verification required', () => {
  for (const status of [
    'scan_click_sent_requires_machine_and_ui_verification',
    'print_click_sent_requires_machine_and_ui_verification',
    'print_click_sent_requires_software_and_physical_readback',
    'private_viewport_captured',
  ]) {
    const result = compact({ status, scanButtonClicked: true, printStartButtonClicked: true });
    assert.equal(result.status, status);
    assert.doesNotMatch(JSON.stringify(result), /completed|physical_completion/);
  }
});

test('only boolean input flags and nonnegative safe integer counts survive', () => {
  for (const count of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '4', null]) {
    assert.deepEqual(compact({ status: 'controls_observed', count,
      targetInputSent: 'true', scanButtonClicked: 1, printStartButtonClicked: {} }),
    { status: 'controls_observed' });
  }
  assert.deepEqual(compact({ status: 'controls_observed', count: 0 }), {
    status: 'controls_observed', count: 0,
  });
});

test('compact does not evaluate getters', () => {
  const value = { status: 'controls_observed' };
  Object.defineProperty(value, 'action', { get() { throw new Error('must not execute'); } });
  assert.deepEqual(compact(value), { status: 'controls_observed' });
});

test('invalid reports are needs_attention', () => {
  for (const value of [undefined, null, [], 'success', 1, new Date()]) {
    assert.deepEqual(compact(value), { status: 'needs_attention' });
  }
});

test('delta ignores timestamps and private metadata', () => {
  assert.deepEqual(delta({ status: 'controls_observed', count: 2, timestamp: 'old', path: 'secret' },
    { status: 'controls_observed', count: 2, timestamp: 'new', path: 'different secret' }),
  { changed: false });
});

test('delta detects meaningful status, state, flag, and count changes', () => {
  const base = { status: 'controls_observed', activeJobState: 'idle', count: 1, scanButtonClicked: false };
  for (const change of [{ status: 'needs_attention' }, { activeJobState: 'printing' },
    { count: 2 }, { scanButtonClicked: true }]) {
    assert.deepEqual(delta(base, { ...base, ...change }), { changed: true });
  }
});

test('missing run folders and checkpoints report missing', async t => {
  const f = await fixture(t);
  assert.deepEqual(await readCommand(f.runtime, ID), { checkpoint: 'missing' });
  await fs.mkdir(path.join(f.runtime, 'runs', ID), { recursive: true });
  assert.deepEqual(await readCommand(f.runtime, ID), { checkpoint: 'missing' });
});

test('an old started record stays started and cannot imply physical completion', async t => {
  const f = await fixture(t);
  await f.record('started.json', { timestamp: '2000-01-01', status: 'completed', name: 'SECRET' });
  assert.deepEqual(await readCommand(f.runtime, ID), { checkpoint: 'started' });
});

test('resuming the same ID reads its result without creating a new command', async t => {
  const f = await fixture(t);
  await f.record('started.json', { timestamp: '2000-01-01' });
  const resultFile = await f.record('result.json', {
    status: 'scan_click_sent_requires_machine_and_ui_verification',
    action: 'scan', scanButtonClicked: true, path: 'D:\\SECRET', timestamp: '2000-01-01',
  });
  const before = await fs.readFile(resultFile, 'utf8');
  const expected = { checkpoint: 'result', report: {
    status: 'scan_click_sent_requires_machine_and_ui_verification', action: 'scan', scanButtonClicked: true,
  } };
  assert.deepEqual(await readCommand(f.runtime, ID), expected);
  assert.deepEqual(await readCommand(f.runtime, ID), expected);
  assert.equal(await fs.readFile(resultFile, 'utf8'), before);
  assert.deepEqual(await fs.readdir(path.join(f.runtime, 'runs')), [ID]);
});

test('another ID result is never used as the requested checkpoint', async t => {
  const f = await fixture(t);
  await f.record('result.json', { status: 'controls_observed' }, OTHER_ID);
  assert.deepEqual(await readCommand(f.runtime, ID), { checkpoint: 'missing' });
});

test('malformed result fails closed even when a valid started record exists', async t => {
  const f = await fixture(t);
  await f.record('started.json', {});
  await f.record('result.json', '{"status":"controls_observed"');
  assert.deepEqual(await readCommand(f.runtime, ID), ATTENTION);
});

test('malformed started and primitive result JSON fail closed', async t => {
  const f = await fixture(t);
  await f.record('started.json', '{');
  assert.deepEqual(await readCommand(f.runtime, ID), ATTENTION);
  await f.record('result.json', 'true');
  assert.deepEqual(await readCommand(f.runtime, ID), ATTENTION);
});

test('unknown result status remains needs_attention inside its result checkpoint', async t => {
  const f = await fixture(t);
  await f.record('result.json', { status: 'success SECRET', activeJobState: 'ready' });
  assert.deepEqual(await readCommand(f.runtime, ID), {
    checkpoint: 'result', report: { status: 'needs_attention', activeJobState: 'unknown' },
  });
});

test('oversized and invalid UTF-8 files fail closed', async t => {
  const f = await fixture(t);
  const file = await f.record('result.json', ' '.repeat(MAX_BYTES + 1));
  assert.deepEqual(await readCommand(f.runtime, ID), ATTENTION);
  await fs.writeFile(file, Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]));
  assert.deepEqual(await readCommand(f.runtime, ID), ATTENTION);
});

test('invalid IDs and relative runtime paths cannot escape the runtime', async t => {
  const f = await fixture(t);
  for (const id of ['../secret', `${ID}/..`, '', 'a'.repeat(33), null, '..\\secret']) {
    assert.deepEqual(await readCommand(f.runtime, id), ATTENTION);
  }
  assert.deepEqual(await readCommand('runtime', ID), ATTENTION);
});

test('directory links and linked runtime ancestors are rejected', async t => {
  const f = await fixture(t);
  const outside = path.join(f.root, 'outside');
  await fs.mkdir(path.join(outside, ID), { recursive: true });
  await fs.writeFile(path.join(outside, ID, 'result.json'), '{"status":"controls_observed"}');
  await fs.symlink(outside, path.join(f.runtime, 'runs'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepEqual(await readCommand(f.runtime, ID), ATTENTION);
  const linked = path.join(f.root, 'linked-runtime');
  await fs.symlink(f.runtime, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepEqual(await readCommand(linked, ID), ATTENTION);
});

test('linked checkpoint entries are rejected', async t => {
  const f = await fixture(t);
  const directory = path.join(f.runtime, 'runs', ID);
  await fs.mkdir(directory, { recursive: true });
  const outside = path.join(f.root, 'outside.json');
  await fs.writeFile(outside, '{"status":"controls_observed"}');
  try { await fs.symlink(outside, path.join(directory, 'result.json'), 'file'); }
  catch (error) {
    // Windows without symlink privilege still permits a junction. A checkpoint
    // named result.json must reject that link as well, before reading anything.
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    const outsideDirectory = path.join(f.root, 'outside-directory');
    await fs.mkdir(outsideDirectory);
    await fs.symlink(outsideDirectory, path.join(directory, 'result.json'), 'junction');
  }
  assert.deepEqual(await readCommand(f.runtime, ID), ATTENTION);
});

test('pending watcher times out within its bound and preserves started state', async t => {
  const f = await fixture(t);
  await f.record('started.json', {});
  const start = performance.now();
  assert.deepEqual(await waitCommand(f.runtime, ID, { timeoutMs: 100 }), {
    checkpoint: 'started', timedOut: true,
  });
  assert.ok(performance.now() - start < 500, 'short timeout must be bounded');
});

test('watcher observes the result of the same command without retrying it', async t => {
  const f = await fixture(t);
  await f.record('started.json', {});
  const pendingWrite = new Promise((resolve, reject) => {
    setTimeout(() => f.record('result.json', { status: 'controls_observed', count: 1 }).then(resolve, reject), 60);
  });
  const output = await waitCommand(f.runtime, ID, { timeoutMs: 1000 });
  await pendingWrite;
  assert.deepEqual(output, { checkpoint: 'result', report: { status: 'controls_observed', count: 1 } });
  assert.deepEqual(await fs.readdir(path.join(f.runtime, 'runs')), [ID]);
});

test('watcher immediately stops at malformed records and rejects excessive timeouts', async t => {
  const f = await fixture(t);
  await f.record('result.json', '{');
  assert.deepEqual(await waitCommand(f.runtime, ID, { timeoutMs: 1000 }), ATTENTION);
  for (const timeoutMs of [45_001, -1, Infinity, '100', 0.5]) {
    assert.deepEqual(await waitCommand(f.runtime, ID, { timeoutMs }), ATTENTION);
  }
});

test('summary and wait CLI routes return only compact data and strict option errors', async t => {
  const f = await fixture(t);
  const file = await f.record('result.json', { status: 'private_viewport_captured', path: 'SECRET', count: 2 });
  assert.deepEqual(await cli(['summary', '--file', file]), { status: 'private_viewport_captured', count: 2 });
  assert.deepEqual(await cli(['wait', '--runtime', f.runtime, '--id', ID, '--timeout-ms', '1000']), {
    checkpoint: 'result', report: { status: 'private_viewport_captured', count: 2 },
  });
  for (const args of [[], ['summary', '--file', 'relative.json'],
    ['summary', '--file', file, '--file', file], ['summary', '--file', file, '--unknown', 'x'],
    ['wait', '--runtime', f.runtime, '--id', ID, '--timeout-ms', '45001'],
    ['wait', '--runtime', f.runtime, '--id', ID, '--timeout-ms', '1e3']]) {
    assert.deepEqual(await cli(args), ATTENTION);
  }
});

test('read and wait do not mutate checkpoint contents or create machine-input artifacts', async t => {
  const f = await fixture(t);
  const started = await f.record('started.json', { status: 'started', name: 'SECRET' });
  const before = await fs.readFile(started);
  await readCommand(f.runtime, ID);
  await waitCommand(f.runtime, ID, { timeoutMs: 50 });
  assert.deepEqual(await fs.readFile(started), before);
  assert.deepEqual(await fs.readdir(path.dirname(started)), ['started.json']);
  const source = await fs.readFile(path.join(__dirname, '../scripts/uv_economy.cjs'), 'utf8');
  const imports = [...source.matchAll(/require\('([^']+)'\)/g)].map(match => match[1]);
  assert.deepEqual(imports.sort(), ['node:fs', 'node:fs/promises', 'node:path', 'node:perf_hooks'].sort());
  assert.doesNotMatch(source, /\b(?:spawn|execFile|execSync|fetch|writeFile|appendFile|mkdir|unlink|rename)\s*\(/);
});

test('waitForChange suppresses unchanged snapshots and reports busy then idle as observations', async () => {
  const idle = { status: 'controls_observed', activeJobState: 'idle', timestamp: 'first' };
  const busy = { status: 'controls_observed', activeJobState: 'busy' };
  let calls = 0;
  const first = await waitForChange(async () => (++calls < 3 ? { ...idle, timestamp: calls } : busy),
    idle, { timeoutMs: 1000, pollMs: 20 });
  assert.deepEqual(first, { changed: true, report: busy });
  const second = await waitForChange(async () => idle, first.report, { timeoutMs: 1000, pollMs: 20 });
  assert.deepEqual(second, { changed: true, report: { status: 'controls_observed', activeJobState: 'idle' } });
  assert.doesNotMatch(JSON.stringify([first, second]), /completed|physical/);
});

test('waitForChange returns unchanged compact data only on timeout', async () => {
  const before = { status: 'controls_observed', activeJobState: 'idle' };
  const start = performance.now();
  const output = await waitForChange(async () => ({ ...before, timestamp: Date.now(), secret: 'SECRET' }),
    before, { timeoutMs: 75, pollMs: 20 });
  assert.deepEqual(output, { changed: false, timedOut: true, report: before });
  assert.ok(performance.now() - start < 400);
});

test('waitForChange bounds a stalled callback and strips callback errors', async () => {
  const before = { status: 'controls_observed' };
  const start = performance.now();
  assert.deepEqual(await waitForChange(() => new Promise(() => {}), before, { timeoutMs: 40, pollMs: 20 }), {
    changed: false, timedOut: true, report: before,
  });
  assert.ok(performance.now() - start < 300);
  assert.deepEqual(await waitForChange(async () => { throw new Error('SECRET PATH D:\\private'); },
    before, { timeoutMs: 100, pollMs: 20 }), { changed: true, report: { status: 'needs_attention' } });
});

test('waitForChange rejects invalid bounds without calling its callback', async () => {
  let calls = 0;
  const callback = async () => { calls++; return { status: 'controls_observed' }; };
  for (const options of [{ timeoutMs: 45_001 }, { timeoutMs: -1 }, { pollMs: 0 }, { pollMs: 10001 }]) {
    assert.deepEqual(await waitForChange(callback, { status: 'controls_observed' }, options), {
      changed: false, report: { status: 'needs_attention' },
    });
  }
  assert.equal(calls, 0);
});

test('button state delta preserves only the five fixed controls', () => {
  const buttons = { '17070': 'enabled', '17075': 'disabled', '17061': 'disabled',
    '17099': 'enabled', '17077': 'enabled', secret: 'SECRET' };
  const before = compact({ status: 'controls_observed', buttons });
  assert.equal(Object.keys(before.buttons).length, 5);
  assert.doesNotMatch(JSON.stringify(before), /SECRET|secret/);
  assert.deepEqual(delta(before, { status: 'controls_observed', buttons: { ...buttons, '17070': 'disabled' } }),
    { changed: true });
  assert.equal(compact({ status: 'controls_observed', buttons: {} }).status, 'needs_attention');
});

const IDLE_TREE = [
  '79 窗格 开始扫描 ID:17070', '86 窗格 产品验证 ID:17075', '88 窗格 打印 ID:17061',
  '89 窗格 (disabled) 暂停 ID:17099', '90 窗格 (disabled) 取消 ID:17077',
].join('\n');
const BUSY_TREE = [
  '146 窗格 (disabled) 开始扫描 ID: 17070', '153 窗格 (disabled) 产品验证 ID: 17075',
  '155 窗格 (disabled) 打印 ID: 17061', '156 窗格 暂停 ID: 17099', '157 窗格 取消 ID: 17077',
].join('\n');

test('compactTree follows fixed native IDs across changing row indexes without leaking labels', () => {
  const idle = compactTree(`1 窗口 SECRET CUSTOMER D:\\private\n${IDLE_TREE}`);
  const busy = compactTree(BUSY_TREE);
  assert.deepEqual(idle, { status: 'controls_observed', buttons: {
    '17070': 'enabled', '17075': 'enabled', '17061': 'enabled', '17099': 'disabled', '17077': 'disabled',
  } });
  assert.deepEqual(busy, { status: 'controls_observed', buttons: {
    '17070': 'disabled', '17075': 'disabled', '17061': 'disabled', '17099': 'enabled', '17077': 'enabled',
  } });
  assert.deepEqual(delta(idle, busy), { changed: true });
  assert.doesNotMatch(JSON.stringify([idle, busy]), /SECRET|CUSTOMER|private|窗格|暂停/);
});

test('compactTree rejects missing, duplicate, and near-match target IDs', () => {
  assert.equal(compactTree(IDLE_TREE.split('\n').slice(1).join('\n')).status, 'needs_attention');
  assert.equal(compactTree(`${IDLE_TREE}\n99 窗格 ID:17070`).status, 'needs_attention');
  assert.equal(compactTree(IDLE_TREE.replace('ID:17070', 'ID:170700')).status, 'needs_attention');
  assert.equal(compactTree(IDLE_TREE.replace('ID:17070', 'ID:17070suffix')).status, 'needs_attention');
  assert.deepEqual(compactTree({ tree: IDLE_TREE }), { status: 'needs_attention' });
});

test('waitForChange detects control changes without submitting machine input', async () => {
  let reads = 0;
  const result = await waitForChange(async () => compactTree(++reads === 1 ? IDLE_TREE : BUSY_TREE),
    compactTree(IDLE_TREE), { timeoutMs: 500, pollMs: 20 });
  assert.equal(result.changed, true);
  assert.deepEqual(result.report, compactTree(BUSY_TREE));
  assert.doesNotMatch(JSON.stringify(result), /completed|physical/);
});
