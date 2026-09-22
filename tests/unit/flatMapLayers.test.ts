import { describe, expect, it, vi } from "vitest";
import { makeFlatRegionsLayer, makeFlatSchoolsLayer } from "@/components/map/layers/flatMapLayers";
import type { RegionsFeatureCollection } from "@/lib/data/types";
import type { PositionedSchool } from "@/components/map/layers/schoolLayers";

describe("flat satellite overlays", () => {
  it("keeps region statistics from producing extruded or opaque blocks", () => {
    const regions = { type: "FeatureCollection", features: [] } as unknown as RegionsFeatureCollection;
    const layer = makeFlatRegionsLayer(regions, null, vi.fn());
    expect(layer.props.extruded).toBe(false);
    expect(layer.props.getFillColor).toEqual([255, 255, 255, 0]);
    expect(layer.props.pickable).toBe(true);
  });

  it("anchors school dots at ground coordinates with a fixed pixel radius", () => {
    const school = { id: "one", lng: 127, lat: 35, level: "elem" } as PositionedSchool;
    const layer = makeFlatSchoolsLayer([school], null, vi.fn());
    expect(layer.props.billboard).toBe(true);
    expect(layer.props.parameters).toMatchObject({ depthCompare: "always", depthWriteEnabled: false });
    expect(layer.props.radiusUnits).toBe("pixels");
    expect(layer.props.radiusMinPixels).toBe(5);
    expect(layer.props.radiusMaxPixels).toBe(5);
    expect((layer.props.getPosition as unknown as (school: PositionedSchool) => number[])(school)).toEqual([127, 35, 1]);
  });
});
