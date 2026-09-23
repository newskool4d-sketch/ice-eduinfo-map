/** Runs the complete data pipeline for one named regional profile. */
import { spawnSync } from "node:child_process";
import { ACTIVE_PROFILE } from "../../src/lib/profiles";

const profile = ACTIVE_PROFILE.id;
if (profile === "incheon" || !ACTIVE_PROFILE.pipelineReady) {
  throw new Error(`${profile}: legacy pipeline is unavailable for this profile. Use data:incheon then data:activate:incheon. No pipeline steps were run.`);
}
const steps = ["data:regions", "data:emd", "data:kess", "data:schools", "data:indicators",
  ...(ACTIVE_PROFILE.capabilities.educationIssues ? ["data:issues"] : []), "data:charset", "data:validate"];

for (const step of steps) {
  const result = spawnSync("npm", ["run", step, "--", `--profile=${profile}`], {
    stdio: "inherit",
    env: { ...process.env, EDU_MAP_PROFILE: profile },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
