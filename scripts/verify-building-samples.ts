/** Read-only upstream smoke check. Run: npx tsx scripts/verify-building-samples.ts */
import { fetchBuildingTile } from "../src/lib/buildings/server";
try { process.loadEnvFile(".env.local"); } catch { /* CI env */ }
const key = process.env.VWORLD_BUILDING_KEY;
if (!key) throw new Error("VWORLD_BUILDING_KEY is required");
const samples: [string, number, number][] = [
  ["전주",127.148,35.824], ["군산",126.736,35.967], ["익산",126.957,35.948],
  ["정읍",126.856,35.57], ["남원",127.391,35.416], ["김제",126.882,35.804],
  ["완주",127.166,35.911], ["진안",127.425,35.791], ["무주",127.661,36.007],
  ["장수",127.522,35.648], ["임실",127.279,35.618], ["순창",127.137,35.374],
  ["고창",126.702,35.435], ["부안",126.733,35.731], ["선유도",126.411,35.811],
];
for (const [name,lng,lat] of samples) {
  const x = Math.floor((lng+180)/360*65536);
  const y = Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*65536);
  const start = Date.now();
  try {
    const tile = await fetchBuildingTile(x,y,{key,domain:process.env.VWORLD_BUILDING_DOMAIN});
    const counts = {provided:0,floors:0,missing:0};
    tile.features.forEach((f) => counts[f.properties.heightSource]++);
    console.log(JSON.stringify({name,x,y,count:tile.features.length,...counts,ms:Date.now()-start}));
  } catch { console.log(JSON.stringify({name,x,y,error:"source failed",ms:Date.now()-start})); process.exitCode=1; }
}
