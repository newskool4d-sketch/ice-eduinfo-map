import { ACTIVE_PROFILE, type RegionProfile } from "@/lib/profiles";

export type Scene = "city" | "flat";
export const SCENE_PREF_KEY = "jb-edu-map:scene:v1";
function scenePrefKey(profile: Pick<RegionProfile, "id">): string {
  return profile.id === "jeonbuk" ? SCENE_PREF_KEY : `jb-edu-map:scene:${profile.id}:v1`;
}
export function readScenePref(profile: Pick<RegionProfile, "id" | "buildings"> = ACTIVE_PROFILE): Scene {
  const fallback = profile.buildings?.defaultScene ?? "flat";
  try {
    const saved = localStorage.getItem(scenePrefKey(profile));
    return saved === "flat" || saved === "city" ? saved : fallback;
  } catch { return fallback; }
}
export function writeScenePref(scene: Scene, profile: Pick<RegionProfile, "id"> = ACTIVE_PROFILE) {
  try { localStorage.setItem(scenePrefKey(profile), scene); } catch { /* Private browsing. */ }
}
export function scenePitch(scene: Scene, zoom: number, mobile: boolean): number {
  return scene === "flat" ? 0 : 20 + Math.min(1, Math.max(0, (zoom - 12) / 3.5)) * (mobile ? 20 : 25);
}
export function buildingsActive(scene: Scene, zoom: number, mobile: boolean): boolean {
  return scene === "city" && zoom >= (mobile ? 16 : 15.5);
}
