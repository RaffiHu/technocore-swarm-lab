import { mkdir, readFile, writeFile } from "node:fs/promises";

const artifact = JSON.parse(await readFile("receipts/protocol-observatory.json", "utf8"));
const snapshot = artifact.snapshot;
const width = 1200;
const height = 800;
const cx = 600;
const cy = 400;
const radius = 285;
const labels = {
  "/healthz": "health",
  "/openapi.json": "openapi",
  "/.well-known/agent.json": "agent",
  "/config": "config",
  "/.well-known/api-catalog": "api-catalog",
  "/.well-known/ai-catalog.json": "ai-catalog",
  "/.well-known/agent-skills/index.json": "skills-index",
  "/sitemap.xml": "sitemap",
  "/robots.txt": "robots",
  "/skill.md": "skill",
  "/llms.txt": "llms",
  "/patterns.md": "patterns",
  "/interop.md": "interop",
  "/auth.md": "auth",
  "/.well-known/security.txt": "security",
};
const colors = {
  "application/json": "#70d6ff",
  "application/linkset+json": "#b392f0",
  "application/xml": "#8cff98",
  "text/plain": "#ffd670",
};
const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const points = snapshot.documents.map((document, index) => {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / snapshot.documents.length;
  return {
    ...document,
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
    color: colors[document.content_type] ?? "#ff9770",
  };
});
const links = points.map((point) =>
  `<path class="surface-link" d="M ${cx} ${cy} L ${point.x.toFixed(2)} ${point.y.toFixed(2)}"/>`,
).join("\n  ");
const nodes = points.map((point) => {
  const dx = point.x - cx;
  const dy = point.y - cy;
  const magnitude = Math.hypot(dx, dy);
  const labelX = point.x + (dx / magnitude) * 47;
  const labelY = point.y + (dy / magnitude) * 47 + 4;
  const anchor = Math.abs(dx) < 70 ? "middle" : dx < 0 ? "end" : "start";
  return `<g class="surface" transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})">
    <circle r="25" fill="#0b1220" stroke="${point.color}" stroke-width="4"/>
    <circle r="6" fill="${point.color}" filter="url(#glow)"/>
    <title>${escapeXml(point.path)} · ${point.status} · ${point.bytes} bytes · ${point.sha256}</title>
  </g>
  <text class="surface-label" style="text-anchor:${anchor}" x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}">${escapeXml(labels[point.path] ?? point.path)}</text>`;
}).join("\n  ");
const passed = snapshot.checks.filter((item) => item.passed).length;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Technocore protocol observatory</title>
  <desc id="desc">Fifteen discovery surfaces orbit a signed snapshot with twelve of twelve consistency checks passing.</desc>
  <metadata>version=${escapeXml(snapshot.service.version)} snapshot=${escapeXml(artifact.snapshot_hash)} postcard_seq=${artifact.postcard.seq}</metadata>
  <defs>
    <radialGradient id="bg"><stop stop-color="#18233d"/><stop offset="1" stop-color="#050812"/></radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>
      text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-anchor:middle;fill:#eef6ff}
      .surface-link{stroke:#405374;stroke-width:1.5;opacity:.62}.surface-label{font-size:13px;fill:#aebdd2}
      .eyebrow{font-size:14px;letter-spacing:4px;fill:#70d6ff}.headline{font-size:27px;font-weight:700}.score{font-size:40px;font-weight:700;fill:#8cff98}.footer{font-size:13px;fill:#91a3bc}
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="36" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${cy}" r="340" fill="none" stroke="#23324d"/>
  <circle cx="${cx}" cy="${cy}" r="285" fill="none" stroke="#23324d" stroke-dasharray="4 12"/>
  ${links}
  <circle cx="${cx}" cy="${cy}" r="140" fill="#09111f" stroke="#70d6ff" stroke-width="3" filter="url(#glow)"/>
  <text class="eyebrow" x="${cx}" y="350">PROTOCOL OBSERVATORY</text>
  <text class="headline" x="${cx}" y="392">TECHNOCORE ${escapeXml(snapshot.service.version)}</text>
  <text class="score" x="${cx}" y="445">${passed} / ${snapshot.checks.length}</text>
  <text class="footer" x="${cx}" y="477">checks · ${snapshot.documents.length} surfaces · ${snapshot.service.openapi_path_count} paths</text>
  ${nodes}
  <text class="footer" x="${cx}" y="760">signed snapshot ${artifact.snapshot_hash.slice(0, 20)}… · room sequence ${artifact.postcard.seq}</text>
</svg>\n`;

await mkdir("assets", { recursive: true });
await writeFile("assets/protocol-observatory.svg", svg, "utf8");
console.log(`Rendered ${snapshot.documents.length} discovery surfaces to assets/protocol-observatory.svg.`);
