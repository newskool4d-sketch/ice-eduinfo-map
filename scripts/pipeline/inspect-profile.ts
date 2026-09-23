import path from "node:path";
import { ACTIVE_PROFILE } from "../../src/lib/profiles";
import { pipelinePaths } from "./paths";

console.log(JSON.stringify({
  profile: ACTIVE_PROFILE,
  paths: pipelinePaths(path.resolve(import.meta.dirname, "../..")),
}, null, 2));
