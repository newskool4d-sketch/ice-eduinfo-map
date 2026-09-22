/** Runs the complete data pipeline for one named regional profile. */
import { spawnSync } from "node:child_process";

const profile = process.argv.find((value) => value.startsWith("--profile="))?.slice("--profile=".length) ??
  process.env.EDU_MAP_PROFILE ?? "jeonbuk";
const steps = ["data:regions", "data:emd", "data:kess", "data:schools", "data:indicators", "data:issues", "data:charset", "data:validate"];

for (const step of steps) {
  const result = spawnSync("npm", ["run", step, "--", `--profile=${profile}`], {
    stdio: "inherit",
    env: { ...process.env, EDU_MAP_PROFILE: profile },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
