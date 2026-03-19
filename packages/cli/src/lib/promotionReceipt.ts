import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeJsonArtifactAbsolute, stableSerializeJson } from './jsonArtifact.js';

export type PromotionReceiptOutcome = 'promoted' | 'noop' | 'conflict';

export type PromotionReceipt = {
  schemaVersion: '1.0';
  kind: 'promotion-receipt';
  promotion_kind: 'story' | 'pattern';
  source_candidate_ref: string;
  source_fingerprint: string;
  target_artifact_path: string;
  target_id: string;
  before_fingerprint: string | null;
  after_fingerprint: string | null;
  outcome: PromotionReceiptOutcome;
  generated_at: string;
};

export const fingerprintPromotionValue = (value: unknown): string =>
  createHash('sha256').update(stableSerializeJson(value), 'utf8').digest('hex');

export const buildPromotionReceipt = (input: Omit<PromotionReceipt, 'schemaVersion' | 'kind'>): PromotionReceipt => ({
  schemaVersion: '1.0',
  kind: 'promotion-receipt',
  ...input
});

export const promotionReceiptRelativePath = (kind: PromotionReceipt['promotion_kind']): string =>
  `.playbook/promotion-receipts/${kind}.latest.json`;

export const writePromotionReceipt = (root: string, receipt: PromotionReceipt): string => {
  const receiptPath = path.join(root, promotionReceiptRelativePath(receipt.promotion_kind));
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  return writeJsonArtifactAbsolute(receiptPath, receipt, 'promote', { envelope: false });
};
