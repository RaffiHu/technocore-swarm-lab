import { createHash } from "node:crypto";
import { verifyPublicReceipt } from "./relay.mjs";

export const OBSERVATORY_PATHS = [
  "/healthz",
  "/openapi.json",
  "/.well-known/agent.json",
  "/config",
  "/.well-known/api-catalog",
  "/.well-known/ai-catalog.json",
  "/.well-known/mcp/server-card.json",
  "/.well-known/agent-skills/index.json",
  "/sitemap.xml",
  "/robots.txt",
  "/skill.md",
  "/llms.txt",
  "/patterns.md",
  "/interop.md",
  "/auth.md",
  "/.well-known/security.txt",
];

export const sha256Bytes = (value) =>
  createHash("sha256").update(value).digest("hex");

export function normalizeObservedDocument(path, body) {
  if (path === "/.well-known/security.txt") {
    return {
      rule: "mask-dynamic-security-txt-expires",
      body: body.replace(/^Expires: .*$/m, "Expires: <dynamic>"),
    };
  }
  return { rule: "none", body };
}

export function snapshotHash(snapshot) {
  return sha256Bytes(Buffer.from(JSON.stringify(snapshot), "utf8"));
}

const check = (name, passed, detail) => ({ name, passed: Boolean(passed), detail });
const withoutQuery = (path) => path.split("?")[0];

export function buildObservatorySnapshot({ baseUrl, observedAt, documents }) {
  const byPath = new Map(documents.map((document) => [document.path, document]));
  const json = (path) => JSON.parse(byPath.get(path).body);
  const openapi = json("/openapi.json");
  const agent = json("/.well-known/agent.json");
  const config = json("/config");
  const apiCatalog = json("/.well-known/api-catalog");
  const aiCatalog = json("/.well-known/ai-catalog.json");
  const mcpCard = json("/.well-known/mcp/server-card.json");
  const skills = json("/.well-known/agent-skills/index.json");
  const skillBody = byPath.get("/skill.md").body;
  const robots = byPath.get("/robots.txt").body;
  const sitemap = byPath.get("/sitemap.xml").body;
  const openapiPaths = Object.keys(openapi.paths);
  const capturedUrls = new Set(documents.map((document) => `${baseUrl}${document.path}`));
  const catalogUrls = [
    ...(apiCatalog.linkset?.[0]?.["service-desc"] ?? []),
    ...(apiCatalog.linkset?.[0]?.["service-doc"] ?? []),
    ...(apiCatalog.linkset?.[0]?.["service-meta"] ?? []),
    ...(apiCatalog.linkset?.[0]?.status ?? []),
  ].map((entry) => entry.href);
  const aiCatalogUrls = (aiCatalog.entries ?? []).map((entry) => entry.url);
  const capabilityPaths = (agent.capabilities ?? []).map((capability) =>
    withoutQuery(capability.path),
  );
  const limitPairs = [
    ["reads_per_minute_per_ip", "rate_read"],
    ["writes_per_minute_per_ip", "rate_write"],
    ["new_rooms_per_day_per_ip", "rate_rooms_per_day"],
    ["rooms", "max_rooms"],
    ["notes_per_namespace", "max_notes_per_ns"],
    ["notes", "max_notes_total"],
    ["long_poll_seconds", "max_wait"],
    ["duplicate_filter_seconds", "dupe_filter_seconds"],
    ["ephemeral_ttl_seconds", "ephemeral_ttl_seconds"],
  ];
  const versions = [
    openapi.info.version,
    agent.version,
    config.version,
    skills.skills?.[0]?.version,
    mcpCard.version,
  ];
  const checks = [
    check(
      "all-discovery-surfaces-available",
      documents.length === OBSERVATORY_PATHS.length && documents.every((document) => document.status === 200),
      `${documents.filter((document) => document.status === 200).length}/${OBSERVATORY_PATHS.length} returned HTTP 200`,
    ),
    check(
      "service-version-consistent",
      new Set(versions).size === 1,
      `OpenAPI, agent manifest, config, skills index and MCP card report ${versions.join(" / ")}`,
    ),
    check(
      "skill-digest-matches",
      skills.skills?.[0]?.digest === `sha256:${sha256Bytes(Buffer.from(skillBody, "utf8"))}`,
      skills.skills?.[0]?.digest,
    ),
    check(
      "agent-capabilities-in-openapi",
      capabilityPaths.every((path) => openapiPaths.includes(path)),
      `${capabilityPaths.length}/${capabilityPaths.length} capability paths represented`,
    ),
    check(
      "deployment-limits-consistent",
      limitPairs.every(([agentKey, configKey]) => agent.limits?.[agentKey] === config.settings?.[configKey]),
      `${limitPairs.length}/${limitPairs.length} mapped limits agree`,
    ),
    check(
      "api-catalog-links-resolve-to-captured-surfaces",
      catalogUrls.every((url) => capturedUrls.has(url)),
      `${catalogUrls.length}/${catalogUrls.length} catalog links captured`,
    ),
    check(
      "ai-catalog-links-resolve-to-captured-surfaces",
      aiCatalogUrls.every((url) => capturedUrls.has(url)),
      `${aiCatalogUrls.length}/${aiCatalogUrls.length} AI catalog links captured`,
    ),
    check(
      "mcp-server-card-coherent",
      mcpCard.serverInfo?.version === agent.version &&
        mcpCard.repository?.url === agent.documentation?.source &&
        mcpCard.remotes?.some((remote) => remote.type === "streamable-http" && remote.url?.startsWith("https://")),
      `${mcpCard.name} advertises a version-aligned HTTPS streamable-HTTP remote`,
    ),
    check(
      "crawler-boundaries-declared",
      robots.includes("Disallow: /r/") && robots.includes("Disallow: /kv/") && robots.includes(`${baseUrl}/sitemap.xml`),
      "robots excludes rooms and notes while advertising the documentation sitemap",
    ),
    check(
      "sitemap-covers-core-documents",
      ["/llms.txt", "/skill.md", "/openapi.json", "/.well-known/agent.json"].every((path) => sitemap.includes(`${baseUrl}${path}`)),
      "manual, skill, OpenAPI and agent manifest are discoverable",
    ),
    check(
      "trust-boundaries-machine-readable",
      agent.trust?.content_is_untrusted === true && agent.trust?.durable === false && agent.trust?.world_writable === true,
      "content_is_untrusted=true, durable=false, world_writable=true",
    ),
    check(
      "offline-ed25519-identity-declared",
      agent.identity?.scheme === "did:key" && agent.identity?.algorithms?.includes("Ed25519") && agent.identity?.resolution?.includes("offline"),
      `${agent.identity?.scheme} / ${agent.identity?.algorithms?.join(", ")} / offline resolution`,
    ),
    check(
      "health-endpoint-ready",
      byPath.get("/healthz").body.trim() === "ok",
      `/healthz returned ${JSON.stringify(byPath.get("/healthz").body.trim())}`,
    ),
  ];

  return {
    schema: "technocore-swarm-lab/protocol-observatory/v1",
    observed_at: observedAt,
    base_url: baseUrl,
    service: {
      name: agent.name,
      version: agent.version,
      openapi_version: openapi.openapi,
      openapi_path_count: openapiPaths.length,
      openapi_paths: openapiPaths,
      capability_count: agent.capabilities.length,
      limits: {
        reads_per_minute_per_ip: agent.limits.reads_per_minute_per_ip,
        writes_per_minute_per_ip: agent.limits.writes_per_minute_per_ip,
        new_rooms_per_day_per_ip: agent.limits.new_rooms_per_day_per_ip,
        rooms: agent.limits.rooms,
        notes: agent.limits.notes,
        notes_per_namespace: agent.limits.notes_per_namespace,
        message_chars: agent.limits.message_chars,
        note_chars: agent.limits.note_chars,
      },
      trust: agent.trust,
      identity: agent.identity,
    },
    documents: documents.map(({ body, ...document }) => {
      const normalized = normalizeObservedDocument(document.path, body);
      return {
        ...document,
        bytes: Buffer.byteLength(body, "utf8"),
        sha256: sha256Bytes(Buffer.from(body, "utf8")),
        normalization: normalized.rule,
        semantic_sha256: sha256Bytes(Buffer.from(normalized.body, "utf8")),
      };
    }),
    checks,
  };
}

export function observatoryPostcardText({ snapshot, hash, room, source, supersedesSeq = null }) {
  const passed = snapshot.checks.filter((item) => item.passed).length;
  const fields = [
    "PROTOCOL-OBSERVATORY v1",
    `service=${snapshot.service.name}@${snapshot.service.version}`,
    `surfaces=${snapshot.documents.length}`,
    `checks=${passed}/${snapshot.checks.length}`,
    `openapi_paths=${snapshot.service.openapi_path_count}`,
    `room_capacity=${snapshot.service.limits.rooms}`,
    `snapshot=${hash}`,
    `room=${room}`,
    ...(supersedesSeq === null ? [] : [`supersedes_seq=${supersedesSeq}`]),
    "common_operator=RaffiHu",
    `source=${source}`,
  ];
  return fields.join(" ");
}

export function verifyObservatoryArtifact(manifest, artifact) {
  const errors = [];
  const computedHash = snapshotHash(artifact.snapshot);
  if (computedHash !== artifact.snapshot_hash) errors.push("snapshot hash mismatch");
  if (!artifact.snapshot.checks.every((item) => item.passed)) errors.push("one or more observatory checks failed");
  const documentPaths = artifact.snapshot.documents.map((document) => document.path);
  if (!documentPaths.length || new Set(documentPaths).size !== documentPaths.length) {
    errors.push("snapshot document paths are empty or duplicated");
  }
  const coordinator = manifest.agents[0];
  if (artifact.postcard.did !== coordinator.did) errors.push("postcard is not signed by the coordinator");
  if (artifact.postcard.room !== artifact.room) errors.push("postcard has wrong room");
  if (!verifyPublicReceipt(coordinator, artifact.postcard)) errors.push("invalid postcard signature");
  const expectedText = observatoryPostcardText({
    snapshot: artifact.snapshot,
    hash: artifact.snapshot_hash,
    room: artifact.room,
    source: artifact.repository,
    supersedesSeq: artifact.supersedes_postcard_seq,
  });
  if (artifact.postcard.text !== expectedText) errors.push("signed postcard text mismatch");
  return {
    valid: errors.length === 0,
    errors,
    checks_passed: artifact.snapshot.checks.filter((item) => item.passed).length,
    checks_total: artifact.snapshot.checks.length,
    documents: artifact.snapshot.documents.length,
    service_version: artifact.snapshot.service.version,
    snapshot_hash: computedHash,
  };
}
