import type { SuspendedProposal } from "./run-record";

export interface ApprovalGrant {
  proposalHash: string;
  approvedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalRequestSeed {
  proposalHash: string;
  kind: "tool" | "handoff";
  reason: string;
  publicReason?: string;
  policyVersion?: string;
  expiresAt?: string;
  resourceName: string;
  canonicalPayloadJson: string;
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return timestamp;
}

function getNowTimestamp(now?: string): number {
  return parseTimestamp(now ?? new Date().toISOString(), "now");
}

function isGrantNewer(
  candidate: ApprovalGrant,
  current: ApprovalGrant,
): boolean {
  return (
    parseTimestamp(candidate.approvedAt, "grant.approvedAt") >
    parseTimestamp(current.approvedAt, "grant.approvedAt")
  );
}

function getProposalMetadata(proposal: SuspendedProposal) {
  return {
    ...(typeof proposal.publicReason !== "undefined"
      ? { publicReason: proposal.publicReason }
      : {}),
    ...(typeof proposal.policyVersion !== "undefined"
      ? { policyVersion: proposal.policyVersion }
      : {}),
    ...(typeof proposal.expiresAt !== "undefined"
      ? { expiresAt: proposal.expiresAt }
      : {}),
  };
}

export function createApprovalRequestSeed(
  proposal: SuspendedProposal,
): ApprovalRequestSeed {
  if (proposal.kind === "tool") {
    return {
      proposalHash: proposal.proposalHash,
      kind: proposal.kind,
      reason: proposal.reason,
      ...getProposalMetadata(proposal),
      resourceName: proposal.toolName,
      canonicalPayloadJson: proposal.argsCanonicalJson,
    };
  }

  return {
    proposalHash: proposal.proposalHash,
    kind: proposal.kind,
    reason: proposal.reason,
    ...getProposalMetadata(proposal),
    resourceName: proposal.toAgentName,
    canonicalPayloadJson: proposal.payloadCanonicalJson,
  };
}

export function isApprovalGrantActive(
  grant: ApprovalGrant,
  now?: string,
): boolean {
  if (typeof grant.revokedAt !== "undefined") {
    return false;
  }

  if (typeof grant.expiresAt === "undefined") {
    return true;
  }

  return (
    parseTimestamp(grant.expiresAt, "grant.expiresAt") >= getNowTimestamp(now)
  );
}

export function findActiveApprovalGrant(
  proposalHash: string,
  grants: readonly ApprovalGrant[],
  now?: string,
): ApprovalGrant | null {
  let match: ApprovalGrant | null = null;

  for (const grant of grants) {
    if (grant.proposalHash !== proposalHash) {
      continue;
    }
    if (!isApprovalGrantActive(grant, now)) {
      continue;
    }
    if (!match || isGrantNewer(grant, match)) {
      match = grant;
    }
  }

  return match;
}

export function toActiveApprovalGrantMap(
  grants: readonly ApprovalGrant[],
  now?: string,
): Record<string, ApprovalGrant> {
  const grantMap: Record<string, ApprovalGrant> = {};

  for (const grant of grants) {
    if (!isApprovalGrantActive(grant, now)) {
      continue;
    }

    const current = grantMap[grant.proposalHash];
    if (!current || isGrantNewer(grant, current)) {
      grantMap[grant.proposalHash] = grant;
    }
  }

  return grantMap;
}

export function toApprovedProposalHashes(
  grants: readonly ApprovalGrant[],
  now?: string,
): string[] {
  return Object.keys(toActiveApprovalGrantMap(grants, now));
}
