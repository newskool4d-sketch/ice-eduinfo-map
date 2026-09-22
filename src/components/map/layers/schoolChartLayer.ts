import { ColumnLayer } from "@deck.gl/layers";
import type { PositionedSchool } from "./schoolLayers";
import { SCHOOL_LEVEL_COLORS } from "@/lib/schoolVisuals";

export function makeSchoolChartLayer(schools: PositionedSchool[], height: (school: PositionedSchool) => number, selected: string | null, onClick: (id: string) => void) {
  const index = schools.findIndex(s => s.id === selected);
  return new ColumnLayer<PositionedSchool>({
    id: "school-columns",
    data: schools,
    radius: 5,
    radiusUnits: "pixels",
    diskResolution: 24,
    extruded: true,
    flatShading: false,
    pickable: true,
    autoHighlight: true,
    highlightedObjectIndex: index < 0 ? null : index,
    highlightColor: [255, 240, 200, 100],
    material: { ambient: 0.5, diffuse: 0.7, shininess: 12, specularColor: [50, 50, 50] },
    getPosition: s => [s.lng, s.lat, 0],
    getElevation: height,
    getFillColor: s => SCHOOL_LEVEL_COLORS[s.level],
    // Statistics must remain readable through translucent background buildings.
    parameters: { depthCompare: "always", depthWriteEnabled: false },
    updateTriggers: { getElevation: [height] },
    onClick: info => { if (info.object) onClick(info.object.id); },
  });
}
