import { createHash, createHmac } from "node:crypto";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function dateStamp(amzTimestamp) {
  return amzTimestamp.slice(0, 8);
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function encodeS3Key(key) {
  return key.split("/").map(encodeRfc3986).join("/");
}

function normalizeHeaders(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    normalized[key.toLowerCase()] = String(value).trim().replace(/\s+/g, " ");
  }
  return normalized;
}

async function fetchContainerCredentials() {
  const fullUri = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  const relativeUri = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  const uri = fullUri || (relativeUri ? `http://169.254.170.2${relativeUri}` : "");
  if (!uri) return null;

  const headers = {};
  if (process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN) {
    headers.Authorization = process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN;
  }

  const response = await fetch(uri, { headers });
  if (!response.ok) {
    throw new Error(`Failed to resolve ECS task credentials: ${response.status}`);
  }
  const body = await response.json();
  return {
    accessKeyId: body.AccessKeyId,
    secretAccessKey: body.SecretAccessKey,
    sessionToken: body.Token,
  };
}

export async function resolveAwsCredentials() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    };
  }

  const containerCredentials = await fetchContainerCredentials();
  if (containerCredentials?.accessKeyId && containerCredentials?.secretAccessKey) {
    return containerCredentials;
  }

  throw new Error("AWS credentials are required for SENTINELOPS_STORAGE_ADAPTER=aws.");
}

export async function signedAwsFetch({ method, url, region, service, headers = {}, body = "" }) {
  const credentials = await resolveAwsCredentials();
  const parsedUrl = new URL(url);
  const payload = typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body);
  const timestamp = amzDate();
  const scopeDate = dateStamp(timestamp);
  const payloadHash = hash(payload);
  const requestHeaders = normalizeHeaders({
    host: parsedUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": timestamp,
    ...(credentials.sessionToken ? { "x-amz-security-token": credentials.sessionToken } : {}),
    ...headers,
  });

  const signedHeaders = Object.keys(requestHeaders).sort();
  const canonicalHeaders = signedHeaders.map((key) => `${key}:${requestHeaders[key]}\n`).join("");
  const canonicalQuery = [...parsedUrl.searchParams.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
  const canonicalRequest = [
    method.toUpperCase(),
    parsedUrl.pathname || "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");

  const credentialScope = `${scopeDate}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", timestamp, credentialScope, hash(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, scopeDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders.join(";")}`,
    `Signature=${signature}`,
  ].join(", ");

  return fetch(parsedUrl, {
    method,
    headers: {
      ...requestHeaders,
      Authorization: authorization,
    },
    body: method.toUpperCase() === "GET" ? undefined : payload,
  });
}
