import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import type { Feature, MultiPolygon, Polygon } from "geojson";

import type { RegionsFeatureCollection } from "@/lib/data/types";
import type { PositionedSchool } from "./schoolLayers";
import { SCHOOL_LEVEL_COLORS } from "@/lib/schoolVisuals";
import { terrainExtension } from "./terrainLayer";

/** Transparent picking surface and thin boundaries over the satellite imagery. */
export function makeFlatRegionsLayer(
  regions: RegionsFeatureCollection,
  selectedCode: string | null,
  onClick: (code: string) => void,
  terrainEnabled = false,
) {
  return new GeoJsonLayer({
    id: "regions",
    data: regions,
    extruded: false,
    filled: true,
    stroked: true,
    getFillColor: [255, 255, 255, 0],
    getLineColor: (feature) =>
      feature.properties.code === selectedCode ? [28, 35, 49, 230] : [255, 255, 255, 170],
    getLineWidth: (feature) => feature.properties.code === selectedCode ? 2 : 1,
    lineWidthUnits: "pixels",
    pickable: true,
    autoHighlight: false,
    extensions: terrainEnabled ? [terrainExtension] : [],
    updateTriggers: { getLineColor: [selectedCode], getLineWidth: [selectedCode] },
    onClick: (info: PickingInfo<Feature<Polygon | MultiPolygon>>) => {
      const code = info.object?.properties?.code;
      if (code) onClick(code);
    },
  });
}

/** Fixed-size school dots anchored directly to their ground coordinates. */
export function makeFlatSchoolsLayer(
  schools: PositionedSchool[],
  highlightedId: string | null,
  onClick: (id: string) => void,
  terrainEnabled = false,
) {
  return new ScatterplotLayer<PositionedSchool>({
    id: "schools",
    data: schools,
    pickable: true,
    extensions: terrainEnabled ? [terrainExtension] : [],
    radiusUnits: "pixels",
    getRadius: 5,
    radiusMinPixels: 5,
    radiusMaxPixels: 5,
    stroked: true,
    lineWidthUnits: "pixels",
    getLineWidth: (school) => school.id === highlightedId ? 3 : 1.5,
    getLineColor: [255, 255, 255, 255],
    getFillColor: (school) => SCHOOL_LEVEL_COLORS[school.level],
    getPosition: (school) => [school.lng, school.lat, 1],
    parameters: { depthCompare: "always", depthWriteEnabled: false },
    updateTriggers: { getLineWidth: [highlightedId] },
    onClick: (info) => {
      if (info.object) onClick(info.object.id);
    },
  });
}
