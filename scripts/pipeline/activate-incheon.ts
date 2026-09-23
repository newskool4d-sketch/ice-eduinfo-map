/** Copy only verified app assets into the local Next.js public directory. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, "data/output/incheon");
const latest = JSON.parse(await readFile(path.join(output, "latest.json"), "utf8"));
if (!/^[a-f0-9]{12}-[a-f0-9]{8}$/.test(latest.path)) throw new Error("Invalid package path");
const source = path.join(output, latest.path);
const verification = JSON.parse(await readFile(path.join(source, "verification.json"), "utf8"));
if (verification.packageIntegrity !== "PASS") throw new Error("Package verification required");
const manifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"));
if (manifest.profileId !== "incheon" || manifest.buildId !== latest.buildId) throw new Error("Package identity mismatch");
const files: [string, Buffer][] = [];
for (const [name, hash] of Object.entries(verification.outputHashes)) {
  if (name.includes("..") || path.isAbsolute(name)) throw new Error("Invalid asset path");
  const bytes = await readFile(path.join(source, name));
  if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error(`Hash mismatch: ${name}`);
  if (/^(history\.json|schools\.json|regions\.geojson|charset\.json|manifest\.json|emd\/\d{5}\.geojson|indicators\/[a-z_0-9]+\.json)$/.test(name)) files.push([name, bytes]);
}
// Verify the complete package before writing any local application asset.
for (const [name, bytes] of files) {
  const destination = path.join(root, "public/data/incheon", name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  if (!(await readFile(destination)).equals(bytes)) throw new Error(`Copy verification failed: ${name}`);
}
console.log(JSON.stringify({ buildId: latest.buildId, files: files.length, destination: "public/data/incheon", qualityStatus: latest.qualityStatus }));
