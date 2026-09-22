import { jeonbukProfile } from "./jeonbuk";
import type { RegionProfile } from "./types";

export const PROFILES: Readonly<Record<string, RegionProfile>> = { jeonbuk: jeonbukProfile };

function requestedProfileId(): string {
  const arg = typeof process !== "undefined"
    ? process.argv.find((value) => value.startsWith("--profile="))?.slice("--profile=".length)
    : undefined;
  return arg || process.env.NEXT_PUBLIC_EDU_MAP_PROFILE || process.env.EDU_MAP_PROFILE || "jeonbuk";
}

export const ACTIVE_PROFILE_ID = requestedProfileId();
export const ACTIVE_PROFILE = PROFILES[ACTIVE_PROFILE_ID];

if (!ACTIVE_PROFILE) {
  throw new Error(`Unknown region profile ${JSON.stringify(ACTIVE_PROFILE_ID)}. Available: ${Object.keys(PROFILES).join(", ")}`);
}

export type { RegionEntry, RegionProfile } from "./types";
