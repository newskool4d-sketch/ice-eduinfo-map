import type { PositionedSchool } from "./layers/schoolLayers";
import type { Bbox } from "@/lib/geo/geo";

export interface SchoolCluster {
  id: string;
  position: [number, number];
  schools: PositionedSchool[];
  bounds: Bbox;
}

/** Display-only grouping: keep every school once and never change source coordinates.
 * Fixed anchors prevent neighbouring groups from chaining across the whole city.
 * Stable ID order keeps grouping independent of list sorting and map panning. */
export function clusterSchools(
  schools: PositionedSchool[],
  project: (point: number[]) => number[],
  selectedId: string | null,
  distance = 44,
): { individuals: PositionedSchool[]; clusters: SchoolCluster[] } {
  const pending = schools
    .filter((school) => school.id !== selectedId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((school) => ({ school, point: project([school.lng, school.lat]), used: false }));
  const individuals = schools.filter((school) => school.id === selectedId);
  const clusters: SchoolCluster[] = [];
  for (const anchor of pending) {
    if (anchor.used) continue;
    anchor.used = true;
    const members = [anchor.school];
    for (const candidate of pending) {
      if (candidate.used) continue;
      if (Math.hypot(candidate.point[0] - anchor.point[0], candidate.point[1] - anchor.point[1]) < distance) {
        candidate.used = true;
        members.push(candidate.school);
      }
    }
    if (members.length === 1) {
      individuals.push(anchor.school);
      continue;
    }
    clusters.push({
      id: `cluster:${anchor.school.id}`,
      position: [anchor.school.lng, anchor.school.lat],
      schools: members,
      bounds: [
        Math.min(...members.map((s) => s.lng)), Math.min(...members.map((s) => s.lat)),
        Math.max(...members.map((s) => s.lng)), Math.max(...members.map((s) => s.lat)),
      ],
    });
  }
  return { individuals, clusters };
}
