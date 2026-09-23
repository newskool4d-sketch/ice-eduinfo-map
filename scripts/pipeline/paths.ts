import path from "node:path";
import { ACTIVE_PROFILE } from "../../src/lib/profiles";
import type { RegionProfile } from "../../src/lib/profiles";

/** Keep existing Jeonbuk locations; isolate the Incheon profile's IO. */
export function pipelinePaths(root: string, profile: RegionProfile = ACTIVE_PROFILE) {
  const resolve = (relative: string) => {
    const target = path.resolve(root, relative);
    const fromRoot = path.relative(path.resolve(root), target);
    if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
      throw new Error(`Profile path must be inside the repository: ${relative}`);
    }
    return target;
  };
  return {
    raw: resolve(profile.files.rawDir), interim: resolve(profile.files.interimDir),
    manual: resolve(profile.files.manualDir), publicData: resolve(profile.files.publicDataDir),
  };
}
