import { mkdir, readFile, writeFile } from "node:fs/promises";

const artifact = JSON.parse(await readFile("receipts/story-chain.json", "utf8"));
const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const wrap = (text, width = 62) => {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const colors = ["#70d6ff", "#ff70a6", "#ff9770", "#ffd670", "#8cff98", "#b392f0"];
const dots = artifact.hops.map((hop, index) => {
  const row = Math.floor(index / 15);
  const column = index % 15;
  const x = 110 + column * 70;
  const y = 450 + row * 58;
  const color = colors[Math.floor(index / 5) % colors.length];
  return `<g class="word-dot" transform="translate(${x} ${y})"><circle r="20" fill="#111827" stroke="${color}" stroke-width="3"/><text y="5" class="dot-label">${escapeXml(hop.agent)}</text><title>${escapeXml(hop.agent)} added ${escapeXml(hop.word)} at sequence ${hop.seq}</title></g>`;
}).join("\n  ");
const storyLines = wrap(artifact.final_story).map((line, index) =>
  `<text x="600" y="${210 + index * 50}" class="story">${escapeXml(line)}</text>`,
).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
  <title id="title">A story written by thirty signing keys</title>
  <desc id="desc">A deterministic thirty-word story assembled as a signed hash chain in Technocore.</desc>
  <metadata>story=${escapeXml(artifact.story_id)} room=${escapeXml(artifact.room)} final_hash=${escapeXml(artifact.final_hash)} final_story=${escapeXml(artifact.final_story)}</metadata>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07111f"/><stop offset="1" stop-color="#241231"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-anchor:middle;fill:#eef6ff}.eyebrow{font-size:15px;letter-spacing:5px;fill:#70d6ff}.headline{font-size:31px;font-weight:700}.story{font-size:25px}.dot-label{font-size:12px;font-weight:700}.footer{font-size:12px;fill:#93a4bc}</style>
  </defs>
  <rect width="1200" height="630" rx="34" fill="url(#bg)"/>
  <text x="600" y="67" class="eyebrow">TECHNOCORE STORY-CHAIN</text>
  <text x="600" y="116" class="headline">A tale written by thirty keys</text>
  <path d="M 220 145 L 980 145" stroke="#ffd670" opacity=".55"/>
  ${storyLines}
  ${dots}
  <text x="600" y="588" class="footer">sequences ${artifact.hop_sequence_range.first}–${artifact.hop_sequence_range.last} · final ${artifact.final_hash.slice(0, 16)}… · one disclosed operator</text>
</svg>\n`;

await mkdir("assets", { recursive: true });
await writeFile("assets/story-chain.svg", svg, "utf8");
console.log(`Rendered ${artifact.hops.length} signed words to assets/story-chain.svg.`);
