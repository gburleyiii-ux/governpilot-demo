import { encodeS3Key, signedAwsFetch } from "./aws-sigv4.mjs";
import { normalizeState } from "./state-shape.mjs";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when SENTINELOPS_STORAGE_ADAPTER=aws.`);
  }
  return value;
}

function awsPartitionDnsSuffix(region) {
  return region.startsWith("us-gov-") ? "amazonaws.com" : "amazonaws.com";
}

function stringAttribute(value) {
  return { S: value === undefined || value === null ? "" : String(value) };
}

function approvalItem(approval) {
  return {
    runId: stringAttribute(approval.runId),
    decidedAt: stringAttribute(approval.decidedAt),
    approvalId: stringAttribute(approval.id),
    gateId: stringAttribute(approval.gateId),
    traceId: stringAttribute(approval.traceId),
    state: stringAttribute(approval.state),
    reviewer: stringAttribute(approval.reviewer),
    reviewerRole: stringAttribute(approval.reviewerRole || "security-reviewer"),
    policyStatus: stringAttribute(approval.policyStatus),
    previousHash: stringAttribute(approval.previousHash || ""),
    signature: stringAttribute(approval.signature),
    signatureMode: stringAttribute(approval.signatureMode),
    note: stringAttribute(approval.note || ""),
  };
}

export function getAwsStoreConfig() {
  const region = process.env.SENTINELOPS_AWS_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-gov-west-1";
  return {
    region,
    bucket: requireEnv("SENTINELOPS_STATE_BUCKET"),
    stateKey: process.env.SENTINELOPS_STATE_KEY || "state/sentinelops-state.json",
    evidencePrefix: process.env.SENTINELOPS_EVIDENCE_PREFIX || "evidence",
    approvalLedgerTable: requireEnv("SENTINELOPS_APPROVAL_LEDGER_TABLE"),
    dnsSuffix: awsPartitionDnsSuffix(region),
  };
}

async function readResponseText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export function createAwsStateStore() {
  const config = getAwsStoreConfig();
  const s3Host = `${config.bucket}.s3.${config.region}.${config.dnsSuffix}`;
  const s3StateUrl = `https://${s3Host}/${encodeS3Key(config.stateKey)}`;
  const dynamodbUrl = `https://dynamodb.${config.region}.${config.dnsSuffix}/`;

  async function putApproval(approval) {
    const body = JSON.stringify({
      TableName: config.approvalLedgerTable,
      Item: approvalItem(approval),
    });
    const response = await signedAwsFetch({
      method: "POST",
      url: dynamodbUrl,
      region: config.region,
      service: "dynamodb",
      headers: {
        "content-type": "application/x-amz-json-1.0",
        "x-amz-target": "DynamoDB_20120810.PutItem",
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`DynamoDB approval ledger write failed: ${response.status} ${await readResponseText(response)}`);
    }
  }

  return {
    mode: "aws-s3-dynamodb",
    info() {
      return {
        mode: "aws-s3-dynamodb",
        path: `s3://${config.bucket}/${config.stateKey}`,
        bucket: config.bucket,
        stateKey: config.stateKey,
        evidencePrefix: config.evidencePrefix,
        approvalLedgerTable: config.approvalLedgerTable,
        region: config.region,
      };
    },
    async loadState() {
      const response = await signedAwsFetch({
        method: "GET",
        url: s3StateUrl,
        region: config.region,
        service: "s3",
      });
      if (response.status === 404) {
        return normalizeState();
      }
      if (!response.ok) {
        throw new Error(`S3 state load failed: ${response.status} ${await readResponseText(response)}`);
      }
      return normalizeState(JSON.parse(await response.text()));
    },
    async saveState(state, context = {}) {
      const normalized = normalizeState(state);
      const body = `${JSON.stringify(normalized, null, 2)}\n`;
      const response = await signedAwsFetch({
        method: "PUT",
        url: s3StateUrl,
        region: config.region,
        service: "s3",
        headers: {
          "content-type": "application/json",
        },
        body,
      });
      if (!response.ok) {
        throw new Error(`S3 state save failed: ${response.status} ${await readResponseText(response)}`);
      }

      const previousSignatures = new Set((context.previousState?.approvals || []).map((approval) => approval.signature));
      const newApprovals = normalized.approvals.filter((approval) => approval.signature && !previousSignatures.has(approval.signature));
      for (const approval of newApprovals) {
        await putApproval(approval);
      }

      return normalized;
    },
    async saveEvidencePacket(runId, packet) {
      const key = `${config.evidencePrefix.replace(/\/+$/, "")}/${runId}-evidence-packet.md`;
      const response = await signedAwsFetch({
        method: "PUT",
        url: `https://${s3Host}/${encodeS3Key(key)}`,
        region: config.region,
        service: "s3",
        headers: {
          "content-type": "text/markdown; charset=utf-8",
        },
        body: packet,
      });
      if (!response.ok) {
        throw new Error(`S3 evidence packet save failed: ${response.status} ${await readResponseText(response)}`);
      }
      return {
        mode: "aws-s3-dynamodb",
        path: `s3://${config.bucket}/${key}`,
      };
    },
  };
}
