import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

function collectCanonicalValues(body, field, valuePattern) {
  const pattern = new RegExp(`^\\s*${field}\\s*:\\s*(${valuePattern})\\s*$`, 'gim');
  return Array.from(body.matchAll(pattern), (match) => String(match[1] || '').trim());
}

function collectEvidenceLines(body) {
  const pattern = /^\s*PHYSICAL_EVIDENCE\s*:\s*(.*?)\s*$/gim;
  return Array.from(body.matchAll(pattern), (match) => String(match[1] || '').trim());
}

export function validatePhysicalGate(pullRequest, eventNumber = '?') {
  if (!pullRequest) {
    return { ok: true, skipped: true, message: 'Event is not a pull request.' };
  }

  const number = pullRequest.number || eventNumber || '?';
  const body = String(pullRequest.body || '');
  const draft = pullRequest.draft === true;

  if (draft) {
    return {
      ok: true,
      skipped: false,
      message: `PR #${number} is Draft; PHYSICAL_GATE may remain PENDING while work continues.`,
    };
  }

  const gates = collectCanonicalValues(body, 'PHYSICAL_GATE', 'PASS|N\\/A|PENDING');
  if (gates.length === 0) {
    return {
      ok: false,
      message:
        `PR #${number} is Ready but has no canonical PHYSICAL_GATE declaration. ` +
        'Add exactly one line: PHYSICAL_GATE: PASS or PHYSICAL_GATE: N/A. ' +
        'Use PHYSICAL_GATE: PENDING while the PR remains Draft.',
    };
  }
  if (gates.length !== 1) {
    return {
      ok: false,
      message: `PR #${number} must declare exactly one PHYSICAL_GATE line; found ${gates.length}. Remove duplicate or conflicting declarations.`,
    };
  }

  const gate = gates[0].toUpperCase();
  if (gate === 'PENDING') {
    return {
      ok: false,
      message: `PR #${number} is Ready while PHYSICAL_GATE is PENDING. Return it to Draft or complete the physical gate.`,
    };
  }

  const evidenceLines = collectEvidenceLines(body);
  if (evidenceLines.length !== 1) {
    return {
      ok: false,
      message: `PR #${number} must declare exactly one PHYSICAL_EVIDENCE line; found ${evidenceLines.length}.`,
    };
  }

  const evidence = evidenceLines[0];
  if (!evidence || /^(pending|todo|tbd|none|-)$/i.test(evidence)) {
    return {
      ok: false,
      message:
        `PR #${number} declares PHYSICAL_GATE: ${gate} but does not provide PHYSICAL_EVIDENCE. ` +
        'For PASS, name the device/runtime and result. For N/A, state why no physical/runtime proof applies.',
    };
  }

  if (gate === 'N/A' && /^n\/?a$/i.test(evidence)) {
    return {
      ok: false,
      message: `PR #${number}: PHYSICAL_EVIDENCE must explain why the physical gate is N/A, not only repeat N/A.`,
    };
  }

  return {
    ok: true,
    skipped: false,
    message: `PR #${number} merge policy valid: PHYSICAL_GATE=${gate}; evidence declared.`,
  };
}

function runFromGitHubEvent() {
  const eventPath = String(process.env.GITHUB_EVENT_PATH || '').trim();
  if (!eventPath || !fs.existsSync(eventPath)) {
    console.log('PR physical gate: no GitHub event payload; skipped outside Actions.');
    return;
  }

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const result = validatePhysicalGate(event.pull_request, event.number);
  if (!result.ok) {
    console.error(`::error::${result.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(result.message);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  runFromGitHubEvent();
}
