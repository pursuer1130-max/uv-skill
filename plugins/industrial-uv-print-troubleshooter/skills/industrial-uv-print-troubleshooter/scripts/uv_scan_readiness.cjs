'use strict';

// This diagnostic has no desktop, process-launch, command, or release capability.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_AGE_MS = 60_000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_RUNS = 4096;
const RUN_ID = /^[a-f0-9]{32}$/i;
const EXPECTED_STATUSES = ['controls_observed', 'z_panel_observed_readonly'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertLocalPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('INVALID_PATH');
  // Do not allow network shares, device paths, or Windows alternate data streams.
  if (/^[\\/]{2}/.test(value) || /:/.test(value.replace(/^[A-Za-z]:[\\/]/, ''))) {
    throw new Error('NONLOCAL_OR_SPECIAL_PATH_REJECTED');
  }
}

function guardedPath(workspace, value, { missingLeaf = false } = {}) {
  assertLocalPath(value);
  const absolute = path.resolve(workspace, value);
  if (!within(workspace, absolute)) throw new Error('PATH_OUTSIDE_WORKSPACE');
  const parts = path.relative(workspace, absolute).split(path.sep).filter(Boolean);
  let current = workspace;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT' && missingLeaf && i === parts.length - 1) return absolute;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error('LINK_PATH_REJECTED');
    if (i !== parts.length - 1 && !stat.isDirectory()) throw new Error('PARENT_NOT_DIRECTORY');
    if (!within(workspace, fs.realpathSync(current))) throw new Error('RESOLVED_PATH_OUTSIDE_WORKSPACE');
  }
  return absolute;
}

function readJsonFile(workspace, file) {
  const guarded = guardedPath(workspace, file);
  const stat = fs.statSync(guarded);
  if (!stat.isFile() || stat.size > MAX_JSON_BYTES) throw new Error('INVALID_OR_OVERSIZED_JSON_FILE');
  const bytes = fs.readFileSync(guarded);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  try {
    const value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    if (!isObject(value)) throw new Error('JSON_OBJECT_REQUIRED');
    return { value, sha256 };
  } catch (error) {
    error.sha256 = sha256;
    throw error;
  }
}

function readInputs({ workspace, runtime, operatorRecord, siteState }) {
  const root = fs.realpathSync(path.resolve(workspace));
  const runtimePath = guardedPath(root, runtime);
  const operatorPath = guardedPath(root, operatorRecord);
  if (!fs.statSync(runtimePath).isDirectory()) throw new Error('RUNTIME_DIRECTORY_REQUIRED');
  const operator = readJsonFile(root, operatorPath);
  const markerPath = path.join(runtimePath, 'height-transition.json');
  const issues = [];
  let marker;
  try {
    const input = readJsonFile(root, markerPath);
    marker = { state: 'read', ...input };
  } catch (error) {
    marker = { state: error.code === 'ENOENT' ? 'missing' : 'unreadable', error: error.message, sha256: error.sha256 ?? null };
  }
  let siteMarker = { state: 'not_supplied' };
  let sitePath = null;
  if (siteState !== undefined) {
    assertLocalPath(siteState);
    sitePath = path.resolve(root, siteState);
    // The USB source is explicitly supplied, read-only, and never inferred from JSON.
    if (path.basename(sitePath).toLowerCase() !== 'height-safety.json') throw new Error('SITE_STATE_FILENAME_REQUIRED');
    try {
      const input = readJsonFile(path.parse(sitePath).root, sitePath);
      siteMarker = { state: 'read', ...input };
    } catch (error) {
      siteMarker = { state: error.code === 'ENOENT' ? 'missing' : 'unreadable', error: error.message, sha256: error.sha256 ?? null };
    }
  }
  const observations = [];
  const sources = [{ role: 'operator-record', path: operatorPath, sha256: operator.sha256 }];
  if (marker.sha256) sources.push({ role: 'height-marker', path: markerPath, sha256: marker.sha256 });
  if (siteMarker.sha256) sources.push({ role: 'site-height-marker', path: sitePath, sha256: siteMarker.sha256 });
  try {
    const runsPath = guardedPath(root, path.join(runtimePath, 'runs'));
    const entries = fs.readdirSync(runsPath, { withFileTypes: true });
    if (entries.length > MAX_RUNS) throw new Error('TOO_MANY_RUN_ENTRIES');
    for (const entry of entries) {
      if (!RUN_ID.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) {
        issues.push({ code: 'UNEXPECTED_RUN_ENTRY_SKIPPED', name: entry.name });
        continue;
      }
      const file = path.join(runsPath, entry.name, 'result.json');
      try {
        const input = readJsonFile(root, file);
        sources.push({ role: 'result', runId: entry.name, path: file, sha256: input.sha256 });
        // Never follow screenshots or other paths contained in input JSON.
        if (EXPECTED_STATUSES.includes(input.value.status)) {
          observations.push({ runId: entry.name, result: input.value });
        }
      } catch (error) {
        issues.push({ code: 'RESULT_UNREADABLE', runId: entry.name, error: error.message });
        if (error.sha256) sources.push({ role: 'unreadable-result', runId: entry.name, path: file, sha256: error.sha256 });
      }
    }
  } catch (error) {
    issues.push({ code: 'RUNS_UNAVAILABLE', error: error.message });
  }
  return { workspace: root, runtime: runtimePath, marker, siteMarker, operatorRecord: operator.value, observations, inputIssues: issues, sources };
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latest(observations, status, now, maxAgeMs) {
  const candidates = observations.filter(entry => isObject(entry) && isObject(entry.result) && entry.result.status === status);
  if (!candidates.length) return { state: 'unknown', reason: 'NO_OBSERVATION', result: null };
  if (candidates.some(entry => timestamp(entry.result.at) === null || timestamp(entry.result.at) > now + 5000)) {
    return { state: 'unknown', reason: 'AMBIGUOUS_OR_INVALID_OBSERVATION_TIME', result: null };
  }
  const sorted = candidates.slice().sort((a, b) => timestamp(b.result.at) - timestamp(a.result.at));
  if (sorted.length > 1 && timestamp(sorted[0].result.at) === timestamp(sorted[1].result.at)) {
    return { state: 'unknown', reason: 'AMBIGUOUS_LATEST_OBSERVATION', result: null };
  }
  const winner = sorted[0];
  const ageMs = Math.max(0, now - timestamp(winner.result.at));
  return { state: ageMs > maxAgeMs ? 'stale' : 'observed', runId: winner.runId, at: winner.result.at, ageMs, result: winner.result };
}

function field(observation, value, valid, reason) {
  const provenance = { runId: observation.runId ?? null, at: observation.at ?? null, ageMs: observation.ageMs ?? null };
  if (!observation.result || !valid) return { state: 'unknown', value: null, reason: reason || observation.reason || 'FIELD_MISSING_OR_INVALID', ...provenance };
  return { state: observation.state, value, ...provenance };
}

function uniqueControl(observation, id, type) {
  const controls = observation.result?.controls;
  if (!Array.isArray(controls)) return null;
  const matches = controls.filter(control => isObject(control) && String(control.automationId ?? control.id) === id && (control.controlType ?? control.type) === type);
  return matches.length === 1 ? matches[0] : null;
}

function numericText(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function assess({ marker = { state: 'missing' }, siteMarker = { state: 'not_supplied' }, observations = [], operatorRecord = {}, inputIssues = [], sources = [], now = Date.now(), maxAgeMs = MAX_AGE_MS } = {}) {
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) throw new Error('INVALID_ASSESSMENT_TIME');
  const controls = latest(observations, 'controls_observed', now, maxAgeMs);
  const zPanel = latest(observations, 'z_panel_observed_readonly', now, maxAgeMs);
  const scan = uniqueControl(controls, '17070', 'ControlType.Button');
  const scanHeight = uniqueControl(controls, '35008', 'ControlType.Edit');
  const actualZ = uniqueControl(zPanel, '110', 'ControlType.Text');
  const targetZ = uniqueControl(zPanel, '118', 'ControlType.Edit');
  const actualMatch = typeof actualZ?.name === 'string' ? /^\s*Z\s*位置\s*[:：]\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*mm\s*$/i.exec(actualZ.name) : null;
  const actualMm = actualMatch ? numericText(actualMatch[1]) : null;
  const targetMm = numericText(targetZ?.numericValue);
  const scanMm = numericText(scanHeight?.numericValue);
  const mainEnabled = controls.result?.mainWindowEnabled;
  const jobState = controls.result?.activeJobState;
  const knownJobStates = ['idle', 'active', 'running', 'scanning', 'printing', 'paused', 'stopping', 'busy'];
  const software = {
    mainWindowEnabled: field(controls, mainEnabled, typeof mainEnabled === 'boolean'),
    activeJobState: field(controls, jobState, knownJobStates.includes(jobState)),
    scanButtonEnabled: field(controls, scan?.enabled, typeof scan?.enabled === 'boolean', 'UNIQUE_SCAN_BUTTON_AND_ENABLED_FIELD_REQUIRED'),
    scanButtonOffscreen: field(controls, scan?.offscreen, typeof scan?.offscreen === 'boolean', 'UNIQUE_SCAN_BUTTON_AND_OFFSCREEN_FIELD_REQUIRED'),
    // A ready caption is only a caption; it cannot substitute for main/job state.
    readyCaption: field(controls, uniqueControl(controls, '31028', 'ControlType.Button')?.name,
      typeof uniqueControl(controls, '31028', 'ControlType.Button')?.name === 'string'),
  };
  const required = ['mainWindowEnabled', 'activeJobState', 'scanButtonEnabled', 'scanButtonOffscreen'].map(key => software[key]);
  const unavailable = (software.mainWindowEnabled.state === 'observed' && !software.mainWindowEnabled.value)
    || (software.activeJobState.state === 'observed' && software.activeJobState.value !== 'idle')
    || (software.scanButtonEnabled.state === 'observed' && !software.scanButtonEnabled.value)
    || (software.scanButtonOffscreen.state === 'observed' && software.scanButtonOffscreen.value);
  software.availability = unavailable ? 'unavailable'
    : inputIssues.length || required.some(item => item.state === 'unknown') ? 'unknown'
      : required.some(item => item.state === 'stale') ? 'stale' : 'available';
  const validRecord = input => input.state === 'read' && isObject(input.value) && typeof input.value.followUpMotionBlocked === 'boolean';
  const validMarker = validRecord(marker);
  const validSiteMarker = validRecord(siteMarker);
  const recordsMatch = validMarker && validSiteMarker && canonical(marker.value) === canonical(siteMarker.value);
  // Historical files are read-only archive provenance, never command gates.
  const differentDeviceReported = isObject(operatorRecord.currentDevice)
    && operatorRecord.currentDevice.differentFromHistoricalMachine === true;
  const heightProtection = {
    state: 'retired_archive_only', blockRemains: false, adapterBlockRecorded: false,
    markerReadState: marker.state, siteMarkerReadState: siteMarker.state,
    markerSha256: marker.sha256 ?? null, siteMarkerSha256: siteMarker.sha256 ?? null,
    sourceConsistency: recordsMatch ? 'consistent' : 'unknown',
    sourceConsistencyReason: recordsMatch ? null : !validMarker || !validSiteMarker ? 'SOURCE_MISSING_OR_INVALID' : 'SOURCE_RECORDS_DIFFER',
    historicalRecord: marker.state === 'read' ? marker.value : null,
    siteHistoricalRecord: siteMarker.state === 'read' ? siteMarker.value : null,
    currentDeviceBinding: differentDeviceReported ? 'operator_reports_different_machine' : 'unknown',
    currentDeviceFaultEstablished: false, historicalApplicability: 'archive_only_not_a_current_action_gate',
    explanation: 'Historical height software locks were permanently retired by the operator on 2026-10-14. Archive data cannot authorize or reject a current action; current device evidence and native interlocks still apply.',
  };
  const reportedAuthorization = isObject(operatorRecord) && operatorRecord.requestedAction === 'scan-once'
    && isObject(operatorRecord.authorization) && operatorRecord.authorization.explicit === true;
  const conditions = [];
  if (software.availability !== 'available') conditions.push({ code: 'FRESH_COMPLETE_SOFTWARE_STATE_REQUIRED', requirement: 'Read mainWindowEnabled, activeJobState and the unique scan button from a fresh, consistent observation.' });
  const actualPosition = field(zPanel, actualMm, actualMm !== null, 'UNIQUE_Z_POSITION_TEXT_ID_110_REQUIRED');
  const observationRecommendations = actualPosition.state === 'observed' ? [] : [{ code: 'CURRENT_Z_READBACK_RECOMMENDED', requirement: 'Use a fresh main-footer or Z-panel readback with the current operator manual-height confirmation; historical Z and scan fields cannot substitute.' }];
  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    mode: 'read-only-diagnostic',
    actionScope: 'scan-once',
    motionAuthorizedByAssessment: false,
    releasePerformed: false,
    targetInputSent: false,
    scanStartedByAssessment: false,
    printStartedByAssessment: false,
    commandGenerated: false,
    sourceRecordsModified: false,
    maxObservationAgeMs: maxAgeMs,
    heightProtection,
    software,
    heightReadings: {
      actualPositionMm: { ...actualPosition, controlId: '110', controlType: 'ControlType.Text', rawText: actualZ?.name ?? null, interpretation: 'Software actual-position readback; not a measurement of physical clearance.' },
      positioningTargetMm: { ...field(zPanel, targetMm, targetMm !== null, 'UNIQUE_TARGET_EDIT_ID_118_REQUIRED'), controlId: '118', controlType: 'ControlType.Edit', interpretation: 'Positioning target input only.' },
      scanHeightFieldMm: { ...field(controls, scanMm, scanMm !== null, 'UNIQUE_SCAN_HEIGHT_EDIT_ID_35008_REQUIRED'), controlId: '35008', controlType: 'ControlType.Edit', interpretation: 'Scan field only; semantics are not inferred from its numeric value.' },
    },
    operatorReport: {
      evidenceLevel: 'reported',
      recordVerbatim: operatorRecord,
      manufacturerEvidenceEstablished: false,
      repeatConfirmedSafetyQuestions: false,
      explanation: 'Preserve the operator statements as reported; they do not become vendor evidence through this diagnostic.',
    },
    actionAuthorization: {
      source: 'operator-record',
      evidenceLevel: 'reported',
      explicitScanOnceAuthorizationReported: reportedAuthorization,
      authorizedActionScope: reportedAuthorization ? 'scan-once' : null,
      otherActionsAuthorized: false,
      expandsPriorAuthorization: false,
    },
    formalReviewConditions: conditions,
    observationRecommendations,
    inputIssues,
    sources,
  };
}

function run({ workspace = process.cwd(), runtime, operatorRecord, siteState, out, now = Date.now() }) {
  const root = fs.realpathSync(path.resolve(workspace));
  const runtimePath = guardedPath(root, runtime);
  const outPath = guardedPath(root, out, { missingLeaf: true });
  if (within(runtimePath, outPath)) throw new Error('OUTPUT_INSIDE_RUNTIME_REJECTED');
  if (fs.existsSync(outPath)) throw new Error('OUTPUT_ALREADY_EXISTS');
  const input = readInputs({ workspace: root, runtime: runtimePath, operatorRecord, siteState });
  const report = assess({ ...input, now });
  // Recheck the output parent immediately before exclusive creation.
  guardedPath(root, path.dirname(outPath));
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { out: outPath, report };
}

function parseArgs(args) {
  const names = { '--runtime': 'runtime', '--operator-record': 'operatorRecord', '--out': 'out', '--site-state': 'siteState' };
  const result = {};
  if (args.length !== 6 && args.length !== 8) throw new Error('USAGE: --runtime <stagedDir> --operator-record <json> --out <new-local-file> [--site-state <height-safety.json>]');
  for (let i = 0; i < args.length; i += 2) {
    const key = names[args[i]];
    if (!key || result[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('INVALID_ARGUMENTS');
    result[key] = args[i + 1];
  }
  if (!result.runtime || !result.operatorRecord || !result.out) throw new Error('REQUIRED_ARGUMENT_MISSING');
  return result;
}

if (require.main === module) {
  try {
    const result = run(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ status: 'diagnostic_written', out: result.out, motionAuthorizedByAssessment: false, heightProtection: result.report.heightProtection.state, softwareAvailability: result.report.software.availability })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'diagnostic_failed', error: error.message, motionAuthorizedByAssessment: false, targetInputSent: false })}\n`);
    process.exitCode = 1;
  }
}

module.exports = { assess, readInputs, run, parseArgs, MAX_AGE_MS };
