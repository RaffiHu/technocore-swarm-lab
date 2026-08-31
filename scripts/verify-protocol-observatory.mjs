import { readFile, readdir } from "node:fs/promises";
import { verifyObservatoryArtifact } from "../lib/observatory.mjs";

const manifest = JSON.parse(await readFile("agents.public.json", "utf8"));
const paths = ["receipts/protocol-observatory.json"];
try {
  const history = await readdir("receipts/observatory-history");
  paths.push(...history.filter((name) => name.endsWith(".json")).sort().map(
    (name) => `receipts/observatory-history/${name}`,
  ));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
for (const path of paths) {
  try {
    const artifact = JSON.parse(await readFile(path, "utf8"));
    const result = verifyObservatoryArtifact(manifest, artifact);
    console.log(JSON.stringify({ artifact: path, ...result }, null, 2));
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
