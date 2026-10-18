'use strict';

// Read-only checkpoint summaries. This module never invokes an application,
// sends machine input, retries a command, or treats a click as physical completion.
const fs = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_WAIT_MS = 45_000;
const ID_RE = /^[a-f0-9]{32}$/i;
const STATUSES = new Set([
  'needs_attention', 'blocked', 'failed', 'cancelled', 'timeout',
  'controls_observed', 'private_viewport_captured', 'private_print_evidence_observed',
  'captured', 'observation_only',
  'rectangle_drag_sent_requires_visual_readback',
  'region_control_clicked_requires_visual_readback',
  'scan_input_about_to_be_sent', 'print_input_about_to_be_sent',
  'scan_click_sent_requires_machine_and_ui_verification',
  'print_click_sent_requires_machine_and_ui_verification',
  'print_click_sent_requires_software_and_physical_readback',
  'single_input_started_outcome_requires_readback',
  'input_returned_requires_dialog_verification',
  'target_input_sent_requires_ui_verification',
]);
const ACTIONS = new Set([
  'scan', 'print', 'inspect', 'observe', 'verify', 'select',
  'select_target', 'status', 'capture', 'verify-product',
]);
const JOB_STATES = new Set([
  'none', 'idle', 'active', 'queued', 'busy', 'running', 'printing', 'paused',
  'stopped', 'cancelled', 'failed', 'present', 'absent', 'unknown',
]);
const FLAGS = ['targetInputSent', 'scanButtonClicked', 'printStartButtonClicked'];
const BUTTON_IDS = ['17070', '17075', '17061', '17099', '17077'];

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Own data properties only: callers cannot make a summary execute getters.
function field(object, name) {
  const descriptor = Object.getOwnPropertyDescriptor(object, name);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function compact(report) {
  if (!plainObject(report)) return { status: 'needs_attention' };
  const status = field(report, 'status');
  const summary = { status: STATUSES.has(status) ? status : 'needs_attention' };
  const action = field(report, 'action');
  if (action !== undefined) summary.action = ACTIONS.has(action) ? action : 'unknown';
  for (const flag of FLAGS) {
    const value = field(report, flag);
    if (typeof value === 'boolean') summary[flag] = value;
  }
  const activeJobState = field(report, 'activeJobState');
  if (activeJobState !== undefined) {
    summary.activeJobState = JOB_STATES.has(activeJobState) ? activeJobState : 'unknown';
  }
  const count = field(report, 'count');
  if (Number.isSafeInteger(count) && count >= 0) summary.count = count;
  const buttons = field(report, 'buttons');
  if (buttons !== undefined) {
    summary.buttons = {};
    for (const id of BUTTON_IDS) {
      const value = plainObject(buttons) ? field(buttons, id) : undefined;
      summary.buttons[id] = value === 'enabled' || value === 'disabled' ? value : 'unknown';
      if (summary.buttons[id] === 'unknown') summary.status = 'needs_attention';
    }
  }
  return summary;
}

function delta(previous, current) {
  return { changed: JSON.stringify(compact(previous)) !== JSON.stringify(compact(current)) };
}

function compactTree(tree) {
  if (typeof tree !== 'string' || Buffer.byteLength(tree, 'utf8') > MAX_BYTES) {
    return { status: 'needs_attention' };
  }
  const buttons = {};
  const duplicates = new Set();
  for (const line of tree.split(/\r?\n/)) {
    // UI row indices change. Only a final, exact numeric native ID identifies a control.
    const match = /^\s*\d+\s+.+\bID:\s*(\d+)\s*$/.exec(line);
    if (!match || !BUTTON_IDS.includes(match[1])) continue;
    const id = match[1];
    if (Object.hasOwn(buttons, id)) duplicates.add(id);
    buttons[id] = line.includes('(disabled)') ? 'disabled' : 'enabled';
  }
  for (const id of duplicates) buttons[id] = 'unknown';
  return compact({ status: 'controls_observed', buttons });
}

function attention() {
  return { checkpoint: 'needs_attention', report: { status: 'needs_attention' } };
}

function validateAbsolute(input) {
  if (typeof input !== 'string' || !path.isAbsolute(input) || input.includes('\0')) {
    throw new Error('invalid_path');
  }
  // A mapped local drive is accepted; explicit remote shares are not local checkpoints.
  if (process.platform === 'win32' && /^(?:\\\\|\/\/)/.test(input)) {
    throw new Error('invalid_path');
  }
  return path.resolve(input);
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

// Check every ancestor, including the supplied runtime, to reject links and junctions.
async function verifyDirectory(directory) {
  const root = path.parse(directory).root;
  const relative = path.relative(root, directory);
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const stat = await fs.lstat(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('unsafe_path');
  }
  if (!samePath(await fs.realpath(directory), directory)) throw new Error('unsafe_path');
}

async function readBounded(file, parentDirectory) {
  await verifyDirectory(parentDirectory);
  const initial = await fs.lstat(file);
  if (initial.isSymbolicLink() || !initial.isFile() || initial.size > MAX_BYTES) {
    throw new Error('unsafe_file');
  }
  if (!samePath(await fs.realpath(file), file)) throw new Error('unsafe_path');
  const flags = require('node:fs').constants;
  const handle = await fs.open(file, flags.O_RDONLY | (flags.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > MAX_BYTES ||
        opened.dev !== initial.dev || opened.ino !== initial.ino) {
      throw new Error('changed_file');
    }
    await verifyDirectory(parentDirectory);
    if (!samePath(await fs.realpath(file), file)) throw new Error('unsafe_path');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_BYTES) throw new Error('oversized_file');
    const final = await handle.stat();
    const current = await fs.lstat(file);
    await verifyDirectory(parentDirectory);
    if (current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino ||
        final.size !== opened.size || final.mtimeMs !== opened.mtimeMs ||
        !samePath(await fs.realpath(file), file)) {
      throw new Error('changed_file');
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (!plainObject(parsed)) throw new Error('invalid_report');
    return parsed;
  } finally {
    await handle.close();
  }
}

async function readCommand(runtime, id) {
  try {
    const runtimePath = validateAbsolute(runtime);
    if (typeof id !== 'string' || !ID_RE.test(id)) return attention();
    await verifyDirectory(runtimePath);
    const runs = path.join(runtimePath, 'runs');
    try { await verifyDirectory(runs); }
    catch (error) { return error.code === 'ENOENT' ? { checkpoint: 'missing' } : attention(); }
    const directory = path.join(runs, id);
    try { await verifyDirectory(directory); }
    catch (error) { return error.code === 'ENOENT' ? { checkpoint: 'missing' } : attention(); }
    // A malformed or inaccessible result must never fall back to a started record.
    try {
      return { checkpoint: 'result', report: compact(await readBounded(path.join(directory, 'result.json'), directory)) };
    } catch (error) {
      if (error.code !== 'ENOENT') return attention();
    }
    try {
      await readBounded(path.join(directory, 'started.json'), directory);
      return { checkpoint: 'started' };
    } catch (error) {
      return error.code === 'ENOENT' ? { checkpoint: 'missing' } : attention();
    }
  } catch {
    return attention();
  }
}

async function waitCommand(runtime, id, options = {}) {
  const timeoutMs = options.timeoutMs === undefined ? MAX_WAIT_MS : options.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_WAIT_MS) return attention();
  const deadline = performance.now() + timeoutMs;
  let latest = { checkpoint: 'missing' };
  let pauseMs = 40;
  for (;;) {
    const remaining = Math.max(0, deadline - performance.now());
    let timer;
    const expired = Symbol('expired');
    const next = await Promise.race([
      readCommand(runtime, id),
      new Promise(resolve => { timer = setTimeout(() => resolve(expired), remaining); }),
    ]);
    clearTimeout(timer);
    if (next === expired) return { ...latest, timedOut: true };
    latest = next;
    if (latest.checkpoint === 'result' || latest.checkpoint === 'needs_attention') return latest;
    const left = deadline - performance.now();
    if (left <= 0) return { ...latest, timedOut: true };
    await new Promise(resolve => setTimeout(resolve, Math.min(pauseMs, left)));
    pauseMs = Math.min(pauseMs * 2, 1000);
  }
}

// The supplied callback must only read and return an observation. This helper
// has no application adapter and cannot submit, retry, or resume any action.
async function waitForChange(readCompact, previous, options = {}) {
  const timeoutMs = options.timeoutMs === undefined ? MAX_WAIT_MS : options.timeoutMs;
  const pollMs = options.pollMs === undefined ? 2000 : options.pollMs;
  if (typeof readCompact !== 'function' || !Number.isInteger(timeoutMs) ||
      timeoutMs < 0 || timeoutMs > MAX_WAIT_MS || !Number.isInteger(pollMs) ||
      pollMs < 20 || pollMs > 10000) return { changed: false, report: { status: 'needs_attention' } };
  const baseline = compact(previous);
  const deadline = performance.now() + timeoutMs;
  let latest = baseline;
  let pauseMs = pollMs;
  for (;;) {
    let timer;
    const expired = Symbol('expired');
    const next = await Promise.race([
      Promise.resolve().then(readCompact).then(compact).catch(() => ({ status: 'needs_attention' })),
      new Promise(resolve => {
        timer = setTimeout(() => resolve(expired), Math.max(0, deadline - performance.now()));
      }),
    ]);
    clearTimeout(timer);
    if (next === expired) return { changed: false, timedOut: true, report: latest };
    latest = next;
    const changed = delta(baseline, latest).changed;
    if (changed || latest.status === 'needs_attention') return { changed, report: latest };
    const remaining = deadline - performance.now();
    if (remaining <= 0) return { changed: false, timedOut: true, report: latest };
    await new Promise(resolve => setTimeout(resolve, Math.min(pauseMs, remaining)));
    pauseMs = Math.min(pauseMs * 2, 10000);
  }
}

async function cli(args) {
  try {
    const [command, ...rest] = args;
    const options = Object.create(null);
    for (let index = 0; index < rest.length; index += 2) {
      const key = rest[index];
      if (!['--file', '--runtime', '--id', '--timeout-ms'].includes(key) ||
          index + 1 >= rest.length || Object.hasOwn(options, key)) return attention();
      options[key] = rest[index + 1];
    }
    if (command === 'summary' && Object.keys(options).length === 1 && options['--file']) {
      const file = validateAbsolute(options['--file']);
      return compact(await readBounded(file, path.dirname(file)));
    }
    if (command === 'wait' && options['--runtime'] && options['--id'] && !options['--file']) {
      const timeout = options['--timeout-ms'];
      if (timeout !== undefined && !/^\d+$/.test(timeout)) return attention();
      return waitCommand(options['--runtime'], options['--id'], {
        timeoutMs: timeout === undefined ? MAX_WAIT_MS : Number(timeout),
      });
    }
    return attention();
  } catch {
    return attention();
  }
}

module.exports = { compact, compactTree, delta, readCommand, waitCommand, waitForChange, cli, MAX_BYTES, MAX_WAIT_MS };

if (require.main === module) {
  cli(process.argv.slice(2)).then(
    value => { process.stdout.write(`${JSON.stringify(value)}\n`); },
    () => { process.stdout.write(`${JSON.stringify(attention())}\n`); },
  );
}
