import { jeonbukProfile } from "./jeonbuk";
import { incheonProfile } from "./incheon";
import type { RegionProfile } from "./types";

export const PROFILES: Readonly<Record<string, RegionProfile>> = { jeonbuk: jeonbukProfile, incheon: incheonProfile };

export function resolveProfileId(argv: readonly string[], publicId?: string, serverId?: string): string {
  const argumentsWithProfile = argv.filter((value) => value.startsWith("--profile="));
  const argument = argumentsWithProfile.at(-1)?.slice("--profile=".length);
  if (argumentsWithProfile.length > 1 || argument === "") throw new Error("Specify one non-empty --profile=<id> argument.");
  const id = argument ?? (publicId || serverId || "jeonbuk");
  if (!Object.hasOwn(PROFILES, id)) {
    throw new Error(`Unknown region profile ${JSON.stringify(id)}. Available: ${Object.keys(PROFILES).join(", ")}`);
  }
  return id;
}

function requestedProfileId(): string {
  return resolveProfileId(
    typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [],
    process.env.NEXT_PUBLIC_EDU_MAP_PROFILE,
    process.env.EDU_MAP_PROFILE,
  );
}

export const ACTIVE_PROFILE_ID = requestedProfileId();
export const ACTIVE_PROFILE = PROFILES[ACTIVE_PROFILE_ID];

if (!ACTIVE_PROFILE) {
  throw new Error(`Unknown region profile ${JSON.stringify(ACTIVE_PROFILE_ID)}. Available: ${Object.keys(PROFILES).join(", ")}`);
}

export type { RegionEntry, RegionProfile } from "./types";
