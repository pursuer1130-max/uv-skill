'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { assess, run, parseArgs } = require('../scripts/uv_scan_readiness.cjs');

const NOW = Date.parse('2026-09-23T12:00:00Z');
const AT = '2026-09-23T11:59:55Z';
const markerValue = { schemaVersion: 1, followUpMotionBlocked: true, targetMm: 9, postScanDisplayedZMm: 7.1, releaseRequirement: 'Reviewed vendor-supported procedure and fresh actual clearance verification.' };
const marker = { state: 'read', value: markerValue, sha256: 'test-marker' };
const operatorRecord = { requestedAction: 'scan-once', authorization: { explicit: true }, statements: ['安全，z轴高度在9.65没有问题', '扫描高度 0.5 mm 不会改变当前 Z 位置'], vendorDocument: { note: 'Only a user-reported document claim' } };
function freshObservations(at = AT) {
  return [
    { runId: '1'.repeat(32), result: { at, status: 'controls_observed', mainWindowEnabled: true, activeJobState: 'idle', controls: [
      { automationId: '17070', controlType: 'ControlType.Button', name: '开始扫描', enabled: true, offscreen: false },
      { automationId: '35008', controlType: 'ControlType.Edit', name: '扫描高度:', numericValue: '0.5' },
      { automationId: '31028', controlType: 'ControlType.Button', name: '设备就绪', enabled: false },
    ] } },
    { runId: '2'.repeat(32), result: { at, status: 'z_panel_observed_readonly', controls: [
      { id: '110', type: 'ControlType.Text', name: 'Z位置: 9.65 mm  ' },
      { id: '118', type: 'ControlType.Edit', numericValue: '8.2' },
    ] } },
  ];
}
function baseline(overrides = {}) {
  return assess({ marker, siteMarker: marker, observations: freshObservations(), operatorRecord, now: NOW, ...overrides });
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(__dirname, '.test-'));
  const runtime = path.join(root, 'runtime');
  fs.mkdirSync(path.join(runtime, 'runs'), { recursive: true });
  const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  json(path.join(runtime, 'height-transition.json'), markerValue);
  json(path.join(root, 'height-safety.json'), markerValue);
  json(path.join(root, 'operator.json'), operatorRecord);
  for (const entry of freshObservations()) {
    const directory = path.join(runtime, 'runs', entry.runId);
    fs.mkdirSync(directory);
    json(path.join(directory, 'result.json'), entry.result);
  }
  t.after(() => {
    // Only remove this verified, newly generated test directory.
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(__dirname));
    assert.match(path.basename(resolved), /^\.test-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { root, runtime, args: { workspace: root, runtime, operatorRecord: path.join(root, 'operator.json'), siteState: path.join(root, 'height-safety.json'), out: path.join(root, 'report.json'), now: NOW } };
}
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('historical lock is archive only under fresh software and reported authorization', () => {
  const report = baseline();
  assert.equal(report.heightProtection.state, 'retired_archive_only');
  assert.equal(report.heightProtection.blockRemains, false);
  assert.equal(report.software.availability, 'available');
  assert.equal(report.motionAuthorizedByAssessment, false);
  assert.equal(report.releasePerformed, false);
  assert.equal(report.actionAuthorization.authorizedActionScope, 'scan-once');
  assert.deepEqual(report.formalReviewConditions, []);
});

test('missing observations and markers remain unknown, never ready', () => {
  const report = assess({ now: NOW });
  assert.equal(report.heightProtection.state, 'retired_archive_only');
  assert.equal(report.software.availability, 'unknown');
  for (const key of ['mainWindowEnabled', 'activeJobState', 'scanButtonEnabled']) assert.equal(report.software[key].state, 'unknown');
  assert.equal(report.heightReadings.actualPositionMm.state, 'unknown');
  assert.equal(report.motionAuthorizedByAssessment, false);
});

test('actual 9.65, target 8.2 and scan 0.5 stay separate', () => {
  const report = baseline();
  assert.equal(report.heightReadings.actualPositionMm.value, 9.65);
  assert.equal(report.heightReadings.positioningTargetMm.value, 8.2);
  assert.equal(report.heightReadings.scanHeightFieldMm.value, 0.5);
  assert.equal(report.heightReadings.actualPositionMm.controlId, '110');
});

test('reported statements and vendorDocument are preserved without creating manufacturer evidence', () => {
  const before = JSON.stringify(operatorRecord);
  const report = baseline();
  assert.deepEqual(report.operatorReport.recordVerbatim, operatorRecord);
  assert.equal(report.operatorReport.evidenceLevel, 'reported');
  assert.equal(report.operatorReport.manufacturerEvidenceEstablished, false);
  assert.equal(report.operatorReport.repeatConfirmedSafetyQuestions, false);
  assert.equal(report.motionAuthorizedByAssessment, false);
  assert.equal(JSON.stringify(operatorRecord), before);
});

test('old readings are stale and preserve their provenance', () => {
  const report = baseline({ observations: freshObservations('2026-09-23T11:00:00Z') });
  assert.equal(report.software.availability, 'stale');
  assert.equal(report.heightReadings.actualPositionMm.state, 'stale');
  assert.equal(report.heightReadings.actualPositionMm.value, 9.65);
  assert.equal(report.heightReadings.actualPositionMm.ageMs, 3_600_000);
});

test('ready caption never fills missing main window or active job state', () => {
  const observations = freshObservations();
  delete observations[0].result.mainWindowEnabled;
  delete observations[0].result.activeJobState;
  const report = baseline({ observations });
  assert.equal(report.software.readyCaption.value, '设备就绪');
  assert.equal(report.software.mainWindowEnabled.state, 'unknown');
  assert.equal(report.software.activeJobState.state, 'unknown');
  assert.equal(report.software.availability, 'unknown');
});

test('actual Z requires unique Text id110 and never falls back to target', () => {
  const observations = freshObservations();
  observations[1].result.controls = [{ id: '118', type: 'ControlType.Edit', numericValue: '9.65' }];
  assert.equal(baseline({ observations }).heightReadings.actualPositionMm.state, 'unknown');
  observations[1].result.controls.push({ id: '110', type: 'ControlType.Edit', numericValue: '9.65' });
  assert.equal(baseline({ observations }).heightReadings.actualPositionMm.state, 'unknown');
  const duplicates = freshObservations();
  duplicates[1].result.controls.push({ id: '110', type: 'ControlType.Text', name: 'Z位置: 9.65 mm' });
  assert.equal(baseline({ observations: duplicates }).heightReadings.actualPositionMm.state, 'unknown');
});

test('latest supported observation selected by timestamp, invalid or tied time stays unknown', () => {
  const observations = freshObservations('2026-09-23T11:00:00Z').concat(freshObservations());
  assert.equal(baseline({ observations }).heightReadings.actualPositionMm.state, 'observed');
  observations.push({ runId: '3'.repeat(32), result: { status: 'z_panel_observed_readonly', at: 'not-a-time', controls: [] } });
  assert.equal(baseline({ observations }).heightReadings.actualPositionMm.state, 'unknown');
  const tied = freshObservations().concat(freshObservations());
  assert.equal(baseline({ observations: tied }).software.availability, 'unknown');
});

test('true, false, missing and corrupt historical sources never become current action gates', () => {
  const clear = { state: 'read', value: { ...markerValue, followUpMotionBlocked: false } };
  for (const [runtime, site] of [[marker, clear], [clear, marker], [{ state: 'missing' }, marker], [marker, { state: 'unreadable' }]]) {
    const report = baseline({ marker: runtime, siteMarker: site });
    assert.equal(report.heightProtection.state, 'retired_archive_only');
    assert.equal(report.heightProtection.blockRemains, false);
    assert.equal(report.heightProtection.sourceConsistency, 'unknown');
  }
  assert.equal(baseline({ marker: clear, siteMarker: { state: 'missing' } }).heightProtection.state, 'retired_archive_only');
});

test('both matching false records still do not authorize action', () => {
  const clear = { state: 'read', value: { ...markerValue, followUpMotionBlocked: false } };
  const report = baseline({ marker: clear, siteMarker: clear });
  assert.equal(report.heightProtection.state, 'retired_archive_only');
  assert.equal(report.motionAuthorizedByAssessment, false);
  assert.equal(report.releasePerformed, false);
});

test('non-scan requests never broaden the reported action scope', () => {
  const report = baseline({ operatorRecord: { ...operatorRecord, requestedAction: 'print-once' } });
  assert.equal(report.actionScope, 'scan-once');
  assert.equal(report.actionAuthorization.authorizedActionScope, null);
  assert.equal(report.actionAuthorization.otherActionsAuthorized, false);
  for (const key of ['targetInputSent', 'scanStartedByAssessment', 'printStartedByAssessment', 'commandGenerated']) assert.equal(report[key], false);
});

test('filesystem assessment leaves all original inputs unchanged and binds hashes', t => {
  const { root, runtime, args } = fixture(t);
  const inputs = [path.join(runtime, 'height-transition.json'), args.siteState, args.operatorRecord,
    ...freshObservations().map(entry => path.join(runtime, 'runs', entry.runId, 'result.json'))];
  const before = inputs.map(hash);
  const { report } = run(args);
  assert.deepEqual(inputs.map(hash), before);
  assert.equal(report.sourceRecordsModified, false);
  assert.equal(report.sources.length, inputs.length);
  assert.equal(report.heightProtection.siteMarkerSha256, hash(args.siteState));
  assert.equal(report.heightProtection.markerSha256, hash(path.join(runtime, 'height-transition.json')));
  assert.equal(fs.existsSync(path.join(runtime, 'command.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'report.json')), true);
});

test('missing or malformed marker stays unknown in real file reads', t => {
  const { runtime, args } = fixture(t);
  fs.writeFileSync(path.join(runtime, 'height-transition.json'), '{broken');
  fs.writeFileSync(args.siteState, '{}');
  const { report } = run(args);
  assert.equal(report.heightProtection.state, 'retired_archive_only');
  assert.equal(report.heightProtection.markerReadState, 'unreadable');
  assert.equal(report.heightProtection.markerSha256, hash(path.join(runtime, 'height-transition.json')));
  assert.equal(report.motionAuthorizedByAssessment, false);
});

test('refuses overwriting output and output anywhere inside runtime', t => {
  const { runtime, args } = fixture(t);
  fs.writeFileSync(args.out, 'existing');
  assert.throws(() => run(args), /OUTPUT_ALREADY_EXISTS/);
  assert.equal(fs.readFileSync(args.out, 'utf8'), 'existing');
  assert.throws(() => run({ ...args, out: path.join(runtime, 'new-report.json') }), /OUTPUT_INSIDE_RUNTIME_REJECTED/);
  assert.equal(fs.existsSync(path.join(runtime, 'new-report.json')), false);
});

test('rejects workspace escape, network, device and alternate data-stream paths', t => {
  const { root, args } = fixture(t);
  assert.throws(() => run({ ...args, runtime: path.dirname(root) }), /PATH_OUTSIDE_WORKSPACE/);
  for (const value of ['\\\\server\\share\\runtime', '\\\\?\\C:\\runtime', 'runtime:stream']) {
    assert.throws(() => run({ ...args, runtime: value }), /NONLOCAL_OR_SPECIAL_PATH_REJECTED/);
  }
  assert.throws(() => run({ ...args, siteState: '\\\\server\\share\\height-safety.json' }), /NONLOCAL_OR_SPECIAL_PATH_REJECTED/);
});

test('does not follow input JSON screenshot or file references', t => {
  const { runtime, args } = fixture(t);
  const file = path.join(runtime, 'runs', '1'.repeat(32), 'result.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  value.screenshot = '../../../../never-read.png';
  value.sourcePath = '\\\\server\\share\\never-read.json';
  value.controls[0].screenshot = 'C:\\not-an-input.json';
  fs.writeFileSync(file, JSON.stringify(value));
  const { report } = run(args);
  assert.equal(report.inputIssues.length, 0);
  assert.equal(report.sources.some(source => /never-read|not-an-input/.test(source.path)), false);
});

test('run directory junction cannot redirect reads', t => {
  const { root, runtime, args } = fixture(t);
  const foreign = path.join(root, 'foreign');
  fs.mkdirSync(foreign);
  fs.writeFileSync(path.join(foreign, 'result.json'), JSON.stringify({ status: 'controls_observed', at: AT }));
  const linked = path.join(runtime, 'runs', 'a'.repeat(32));
  try { fs.symlinkSync(foreign, linked, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Host does not permit links'); throw error; }
  const { report } = run(args);
  assert.equal(report.sources.some(source => source.runId === 'a'.repeat(32)), false);
  assert.equal(report.inputIssues.some(issue => issue.code === 'UNEXPECTED_RUN_ENTRY_SKIPPED'), true);
});

test('CLI only accepts diagnostic flags and rejects release or override', () => {
  assert.deepEqual(parseArgs(['--runtime', 'runtime', '--operator-record', 'operator.json', '--out', 'new.json']), { runtime: 'runtime', operatorRecord: 'operator.json', out: 'new.json' });
  assert.equal(parseArgs(['--runtime', 'runtime', '--operator-record', 'operator.json', '--out', 'new.json', '--site-state', 'height-safety.json']).siteState, 'height-safety.json');
  for (const flag of ['--release', '--override']) assert.throws(() => parseArgs(['--runtime', 'runtime', '--operator-record', 'operator.json', '--out', 'new.json', flag, 'true']), /INVALID_ARGUMENTS/);
});

 test('a hash-bound different-machine report separates historical scope from current fault',()=>{
 const report=baseline({operatorRecord:{...operatorRecord,historicalRecordSha256:'test-marker',currentDevice:{differentFromHistoricalMachine:true,scanHeightMeaning:'material_thickness'}}});
 assert.equal(report.heightProtection.currentDeviceBinding,'operator_reports_different_machine');
 assert.equal(report.heightProtection.currentDeviceFaultEstablished,false);
 assert.equal(report.heightProtection.blockRemains,false);
 assert.deepEqual(report.formalReviewConditions,[]);
 assert.equal(report.motionAuthorizedByAssessment,false);
});
test('current different-machine statement does not require an old marker hash',()=>{
 const report=baseline({operatorRecord:{...operatorRecord,historicalRecordSha256:'other',currentDevice:{differentFromHistoricalMachine:true}}});
 assert.equal(report.heightProtection.currentDeviceBinding,'operator_reports_different_machine');
 assert.equal(report.heightProtection.blockRemains,false);
});
