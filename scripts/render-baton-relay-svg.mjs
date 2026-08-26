import { mkdir, readFile, writeFile } from "node:fs/promises";

const relay = JSON.parse(await readFile("receipts/baton-relay.json", "utf8"));
const width = 1200;
const height = 1200;
const centerX = width / 2;
const centerY = height / 2;
const radius = 455;
const colors = ["#70d6ff", "#ff70a6", "#ff9770", "#ffd670", "#8cff98", "#b392f0"];
const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const points = relay.hops.map((hop, index) => {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / relay.hops.length;
  return {
    ...hop,
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
    color: colors[Math.floor(index / 5) % colors.length],
  };
});

const lines = points.slice(0, -1).map((point, index) => {
  const next = points[index + 1];
  return `<path d="M ${point.x.toFixed(2)} ${point.y.toFixed(2)} L ${next.x.toFixed(2)} ${next.y.toFixed(2)}" class="relay-line" marker-end="url(#arrow)"/>`;
});
const firstPoint = points[0];
const finalPoint = points.at(-1);
const genesisLine = `<path d="M ${centerX} ${centerY - 190} L ${firstPoint.x.toFixed(2)} ${firstPoint.y.toFixed(2)}" class="genesis-line" marker-end="url(#arrow)"/>`;
const summaryLine = `<path d="M ${finalPoint.x.toFixed(2)} ${finalPoint.y.toFixed(2)} L ${centerX - 190} ${centerY}" class="summary-line" marker-end="url(#gold-arrow)"/>`;
const nodes = points.map((point) => {
  const didSuffix = point.did.slice(-6);
  return `<g class="agent" transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})">
    <circle r="42" fill="#111827" stroke="${point.color}" stroke-width="5"/>
    <text class="agent-label" y="-5">${escapeXml(point.agent)}</text>
    <text class="seq-label" y="17">seq ${point.seq}</text>
    <text class="did-label" y="60">…${escapeXml(didSuffix)}</text>
    <title>Agent ${escapeXml(point.agent)} · ${escapeXml(point.role)} · ${escapeXml(point.did)}</title>
  </g>`;
});

const finalLines = relay.final_baton.match(/.{1,16}/g);
const finalText = finalLines
  .map((line, index) => `<text class="hash" x="600" y="${555 + index * 24}">${line}</text>`)
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Technocore 30-agent cryptographic baton relay</title>
  <desc id="desc">Thirty disclosed agent DIDs form a signed hash chain around the final baton.</desc>
  <metadata>relay=${escapeXml(relay.relay_id)} operator=RaffiHu room=${escapeXml(relay.room)} final_baton=${escapeXml(relay.final_baton)}</metadata>
  <defs>
    <radialGradient id="background"><stop offset="0" stop-color="#18253f"/><stop offset="1" stop-color="#070b14"/></radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#53657f"/></marker>
    <marker id="gold-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ffd670"/></marker>
    <style>
      .relay-line{stroke:#53657f;stroke-width:2;fill:none;opacity:.75}
      .genesis-line{stroke:#70d6ff;stroke-width:2;fill:none;opacity:.8}.summary-line{stroke:#ffd670;stroke-width:3;fill:none;opacity:.9}
      text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-anchor:middle;fill:#eef6ff}
      .agent-label{font-size:20px;font-weight:700}.seq-label{font-size:11px;fill:#a8b8d0}.did-label{font-size:10px;fill:#71829d}
      .eyebrow{font-size:16px;letter-spacing:4px;fill:#70d6ff}.headline{font-size:30px;font-weight:700}.hash{font-size:17px;fill:#ffd670}
      .footer{font-size:13px;fill:#8fa3bf}
    </style>
  </defs>
  <rect width="1200" height="1200" fill="url(#background)" rx="36"/>
  <circle cx="600" cy="600" r="500" fill="none" stroke="#1c2a42" stroke-width="1"/>
  ${genesisLine}
  ${lines.join("\n  ")}
  ${summaryLine}
  <circle cx="600" cy="600" r="190" fill="#0b1220" stroke="#ffd670" stroke-width="3" filter="url(#glow)"/>
  <text class="eyebrow" x="600" y="480">FINAL BATON</text>
  <text class="headline" x="600" y="520">30 / 30 HOPS</text>
  ${finalText}
  <text class="footer" x="600" y="680">relay ${escapeXml(relay.relay_id)} · sequences ${relay.hop_sequence_range.first}–${relay.hop_sequence_range.last}</text>
  <text class="footer" x="600" y="705">one disclosed operator · thirty independently signing keys</text>
  ${nodes.join("\n  ")}
</svg>\n`;

await mkdir("assets", { recursive: true });
await writeFile("assets/baton-relay.svg", svg, "utf8");
console.log(`Rendered ${points.length} relay agents to assets/baton-relay.svg.`);
