import { createHash } from 'node:crypto';
import type { TestTriageFinding } from '@zachariahredfield/playbook-core';

type FailureSignatureInput = Omit<TestTriageFinding, 'failure_signature'>;

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();
const normalizeQuotedStrings = (value: string): string => value.replace(/`[^`]+`/g, '<quoted>').replace(/"[^"]+"/g, '<quoted>').replace(/'[^']+'/g, '<quoted>');
const normalizeNumbers = (value: string): string => value.replace(/\b\d+\b/g, '<num>');
const normalizePaths = (value: string): string => value.replaceAll('\\', '/');

export const normalizeAssertionShape = (value: string): string => normalizeWhitespace(normalizeNumbers(normalizeQuotedStrings(normalizePaths(value))));

const collectMarkers = (finding: FailureSignatureInput): string[] => {
  const candidates = [finding.summary, ...finding.evidence]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => /^(?:AssertionError|Error:|Expected:|Received:|Snapshot|\s*[×✕❯])/i.test(entry));
  const markers = [...new Set(candidates.map(normalizeAssertionShape))].sort((left, right) => left.localeCompare(right));
  return markers.slice(0, 4);
};

export const buildFailureSignatureSeed = (finding: FailureSignatureInput): string => JSON.stringify({
  package: finding.package ?? '',
  test_file: normalizePaths(finding.test_file ?? ''),
  test_name: normalizeAssertionShape(finding.test_name ?? ''),
  failure_kind: finding.failure_kind,
  assertion_shape: collectMarkers(finding)
});

export const buildFailureSignature = (finding: FailureSignatureInput): string => `failsig-${createHash('sha256').update(buildFailureSignatureSeed(finding)).digest('hex').slice(0, 16)}`;
