'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const emit = (stage, status, detail = {}) => console.log(JSON.stringify({stage, status, ...detail}));

function canonical(value) {
  let text;
  if (Array.isArray(value)) text = '[' + value.map(canonical).join(',') + ']';
  else if (value !== null && typeof value === 'object') {
    text = '{' + Object.keys(value).sort().map(k => canonical(k) + ':' + canonical(value[k])).join(',') + '}';
  } else {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || Object.is(value, -0))) {
      throw new Error('Unsupported license numeric representation');
    }
    text = JSON.stringify(value);
  }
  return text.replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function deviceId() {
  const digest = sha(os.hostname().trim().toLowerCase()).slice(0, 16).toUpperCase();
  return 'UV-' + digest.match(/.{4}/g).join('-');
}
function license(skillRoot) {
  const dir = path.join(skillRoot, 'license');
  const device = deviceId();
  const matched = path.join(dir, 'devices', device + '.json');
  const files = [fs.existsSync(matched) ? matched : path.join(dir, 'license.json'), path.join(dir, 'public_key.txt')];
  if (files.some(f => !fs.existsSync(f))) throw new Error('LICENSE_MISSING');
  const doc = JSON.parse(fs.readFileSync(files[0], 'utf8'));
  const hex = fs.readFileSync(files[1], 'utf8').trim();
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error('LICENSE_INVALID: public key');
  const key = crypto.createPublicKey({key: Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(hex, 'hex')
  ]), format: 'der', type: 'spki'});
  if (!doc.payload || typeof doc.signature !== 'string' || !crypto.verify(null,
    Buffer.from(canonical(doc.payload)), key, Buffer.from(doc.signature, 'base64'))) {
    throw new Error('LICENSE_INVALID: signature');
  }
  const expiry = doc.payload.expires_at;
  if (expiry && (!Number.isFinite(Date.parse(expiry)) || Date.now() > Date.parse(expiry))) {
    throw new Error('LICENSE_EXPIRED');
  }
  if (doc.payload.device_id && doc.payload.device_id !== device) throw new Error('LICENSE_INVALID: device');
  return {code: 'LICENSE_OK', device_id: device, licenseFile: files[0], deviceBound: !!doc.payload.device_id, expiresAt: expiry || null};
}

function iniPlan(bytes) {
  // Latin-1 is a reversible byte mapping: keep the installation's GBK comments intact.
  const raw = bytes.toString('latin1');
  if (raw.includes('\0')) throw new Error('INI_ENCODING_UNSUPPORTED');
  const sections = [...raw.matchAll(/^\[([^\]\r\n]+)\][^\r\n]*(?:\r?\n|$)/gm)];
  const matches = sections.filter(m => m[1].trim().toUpperCase() === 'TCP_IP');
  if (matches.length !== 1) throw new Error('INI_TCP_IP_SECTION_MISSING_OR_AMBIGUOUS');
  const section = matches[0];
  const start = section.index + section[0].length;
  const next = sections.find(m => m.index >= start);
  const end = next ? next.index : raw.length;
  let body = raw.slice(start, end);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const before = {};
  for (const [key, value] of Object.entries({ADDR: '0.0.0.0', PORT: '9100'})) {
    const active = new RegExp('^[ \\t]*' + key + '[ \\t]*=([^\\r\\n]*)', 'gmi');
    const found = [...body.matchAll(active)];
    if (found.length > 1) throw new Error('INI_DUPLICATE_' + key);
    before[key] = found.length ? found[0][1].trim() : null;
    if (found.length) {
      body = body.replace(active, (_, old) => {
        const comment = old.match(/[ \\t]*[;#].*$/);
        return key + '=' + value + (comment ? comment[0] : '');
      });
    } else {
      const commented = new RegExp('^[ \\t]*[;#][ \\t]*' + key + '[ \\t]*=[^\\r\\n]*', 'mi');
      if (commented.test(body)) body = body.replace(commented, key + '=' + value);
      else body = key + '=' + value + eol + body;
    }
  }
  const prefix = raw.slice(0, start) + (section[0].endsWith('\n') ? '' : eol);
  const updated = Buffer.from(prefix + body + raw.slice(end), 'latin1');
  return {before, after: {ADDR: '0.0.0.0', PORT: '9100'}, changed: !updated.equals(bytes), updated};
}

async function configureIni(file, apply = false, permit) {
  const absolute = path.resolve(file);
  const original = await fsp.readFile(absolute);
  const plan = iniPlan(original);
  const report = {path: absolute, before: plan.before, after: plan.after, changed: plan.changed, applied: false};
  if (!apply || !plan.changed) return report;
  require('./uv_core.cjs').checkPermit(permit,{action:'ini',file:fs.realpathSync(file)});
  const stamp = Date.now() + '-' + crypto.randomUUID();
  const backup = absolute + '.uv-' + stamp + '.bak';
  const temporary = absolute + '.uv-' + stamp + '.tmp';
  await fsp.writeFile(backup, original, {flag: 'wx'});
  try {
    await fsp.writeFile(temporary, plan.updated, {flag: 'wx'});
    if (sha(await fsp.readFile(absolute)) !== sha(original)) throw new Error('INI_CHANGED_DURING_UPDATE');
    await fsp.rename(temporary, absolute);
    if (sha(await fsp.readFile(absolute)) !== sha(plan.updated)) throw new Error('INI_VERIFY_FAILED');
    return {...report, applied: true, backup, listener_verified: false};
  } finally { await fsp.rm(temporary, {force: true}); }
}

async function inspectFile(file) {
  const handle = await fsp.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size === 0) throw new Error('FILE_EMPTY_OR_NOT_REGULAR');
    const head = Buffer.alloc(32);
    await handle.read(head, 0, 32, 0);
    const signature = head.subarray(0, 4).toString('hex');
    let kind = 'receiver-specific';
    if (['49492a00', '4d4d002a', '49492b00', '4d4d002b'].includes(signature)) kind = 'TIFF';
    if (head.subarray(0, 4).toString('ascii') === '8BPS') kind = 'PSD';
    if(head.subarray(0,8).toString('hex')==='89504e470d0a1a0a')kind='PNG';
    if(head.subarray(0,3).toString('hex')==='ffd8ff')kind='JPEG';
    if(head.subarray(0,2).toString('ascii')==='BM')kind='BMP';
    const hash = crypto.createHash('sha256');
    for await (const chunk of handle.createReadStream({start: 0, autoClose: false})) hash.update(chunk);
    return {file: path.resolve(file), bytes: stat.size, mtimeMs: stat.mtimeMs, sha256: hash.digest('hex'), kind};
  } finally { await handle.close(); }
}

function shouldRetry(error, attempt, maxAttempts) {
  return !error.connected && attempt < maxAttempts &&
    ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', 'ECONNRESET'].includes(error.code);
}

function sendAttempt(info, options) {
  return new Promise((resolve, reject) => {
    let connected = false, finished = false, settled = false, input;
    const socket = new net.Socket();
    const totalTimer = setTimeout(() => fail(Object.assign(new Error('Transfer deadline'), {code: 'ETIMEDOUT'})), options.totalTimeoutMs);
    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      if (input) input.destroy();
      error.connected = connected;
      error.bytesWritten = socket.bytesWritten;
      error.outcome = connected ? 'unknown_no_auto_retry' : 'not_sent';
      socket.destroy();
      reject(error);
    }
    socket.setTimeout(options.timeoutMs);
    socket.once('timeout', () => fail(Object.assign(new Error('Socket timeout'), {code: 'ETIMEDOUT'})));
    socket.once('error', fail);
    socket.once('connect', () => {
      connected = true;
      input = fs.createReadStream(info.file);
      input.once('error', fail);
      input.pipe(socket); // Native pipe handles backpressure and drain.
    });
    socket.once('finish', () => { finished = true; });
    socket.resume();
    socket.once('close', hadError => {
      if (settled) return;
      if (hadError || !finished || socket.bytesWritten !== info.bytes) {
        return fail(Object.assign(new Error('Receiver closed before complete transfer'), {code: 'EARLY_CLOSE'}));
      }
      settled = true;
      clearTimeout(totalTimer);
      resolve({bytes: socket.bytesWritten, transport: 'complete', application: 'unverified', physical_print: 'unverified'});
    });
    socket.connect({host: options.host, port: options.port});
  });
}

async function send(file, options = {}, report = emit) {
  const settings = {host: '127.0.0.1', port: 9100, maxAttempts: 3, timeoutMs: 10000,
    totalTimeoutMs: 300000, backoffMs: 400, ...options};
  if (['0.0.0.0', '::', ''].includes(settings.host)) throw new Error('Use a destination address, not the bind address');
  if(!Number.isInteger(settings.maxAttempts)||settings.maxAttempts<1||settings.maxAttempts>3)throw new Error('Attempt limit must be 1..3');
  if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) throw new Error('Invalid port');
  const info = await inspectFile(file);
  require('./uv_core.cjs').checkPermit(settings.permit,{action:'send',file:fs.realpathSync(file),host:settings.host,port:settings.port,sha256:info.sha256});
  if (!settings.formatVerified) throw new Error('RIP_FORMAT_UNVERIFIED: ' + info.kind);
  if (!settings.preparedMachine) throw new Error('PREPARED_MACHINE_REQUIRED');
  report('preflight', 'ok', info);
  for (let attempt = 1; attempt <= settings.maxAttempts; attempt++) {
    const current = await fsp.stat(info.file);
    if (current.size !== info.bytes || current.mtimeMs !== info.mtimeMs) throw new Error('FILE_CHANGED');
    try {
      const result = await sendAttempt(info, settings);
      report('socket_send', 'ok', {attempt, ...result});
      return result;
    } catch (error) {
      const retry = shouldRetry(error, attempt, settings.maxAttempts);
      report('socket_send', retry ? 'retrying' : 'blocked', {attempt, code: error.code,
        bytes: error.bytesWritten, outcome: error.outcome});
      if (!retry) throw error;
      await new Promise(r => setTimeout(r, settings.backoffMs * attempt));
    }
  }
  throw new Error('Invalid attempt limit');
}

function args(argv) {
  const result = {action: argv[0] || 'help'};
  for (let i = 1; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error('Expected named argument');
    const key = argv[i].slice(2);
    result[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return result;
}

async function main() {
  const a = args(process.argv.slice(2));
  if (a.action === 'help') return emit('help', 'ok', {actions: ['license --skill-root PATH',
    'ini --ini PATH [--apply --printexp-stopped]', 'file --file PATH',
    'send --file PATH --host IP --format-verified --prepared-machine']});
  emit('license', 'ok', license(a['skill-root'] || path.resolve(__dirname, '..')));
  if (a.action === 'license') return;
  if (a.action === 'file') return emit('preflight', 'ok', await inspectFile(a.file));
  if (a.action === 'ini') {
    if (a.apply) throw new Error('SAFETY_GATEWAY_REQUIRED: use uv_master.cjs plan/execute for PrintExp.ini_apply; preview remains compatible');
    if (a.apply && !a['printexp-stopped']) throw new Error('Stop PrintExp and verify no pending jobs before applying');
    return emit('project_ini', 'ok', await configureIni(a.ini, !!a.apply));
  }
  if (a.action === 'send') throw new Error('SAFETY_GATEWAY_REQUIRED: use uv_master.cjs plan/confirm/execute for PrintExp.send, or simulate for an owned localhost receiver');
  throw new Error('Unknown action');
}

if (require.main === module) main().catch(error => {
  emit('workflow', 'blocked', {error: error.message, code: error.code}); process.exitCode = 1;
});
module.exports = {license, deviceId, canonical, iniPlan, configureIni, inspectFile, send, shouldRetry};
