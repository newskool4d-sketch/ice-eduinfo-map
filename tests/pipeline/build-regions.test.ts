import { describe, expect, it } from "vitest";
import type { Feature, FeatureCollection, Polygon } from "geojson";

import { transformNeighbors, transformRegions } from "../../scripts/pipeline/build-regions";

type SourceProps = {
  adm_nm: string;
  adm_cd: string;
  adm_cd2: string;
  sgg: string;
  sggnm: string;
  sido: string;
  sidonm: string;
};

function rect(
  [minLng, minLat, maxLng, maxLat]: [number, number, number, number],
  properties: SourceProps,
): Feature<Polygon, SourceProps> {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    },
  };
}

// Mirrors the real admdongkor source's 읍면동 (eupmyeondong) granularity:
// two adjacent 전주시 gu's that must collapse into one 52110 feature, one
// untouched 군산시 feature, and one out-of-province 충남 feature that must
// be dropped from regions.geojson but picked up by neighbors.geojson.
function fixture(): FeatureCollection<Polygon, SourceProps> {
  return {
    type: "FeatureCollection",
    features: [
      rect([127.1, 35.78, 127.15, 35.83], {
        adm_nm: "전북특별자치도 전주시 완산구 중앙동",
        adm_cd: "52111250",
        adm_cd2: "5211110100",
        sgg: "52111",
        sggnm: "완산구",
        sido: "52",
        sidonm: "전북특별자치도",
      }),
      rect([127.15, 35.78, 127.2, 35.83], {
        adm_nm: "전북특별자치도 전주시 덕진구 금암1동",
        adm_cd: "52113253",
        adm_cd2: "5211310100",
        sgg: "52113",
        sggnm: "덕진구",
        sido: "52",
        sidonm: "전북특별자치도",
      }),
      rect([126.6, 35.9, 126.7, 36.0], {
        adm_nm: "전북특별자치도 군산시 나운동",
        adm_cd: "52130320",
        adm_cd2: "5213010100",
        sgg: "52130",
        sggnm: "군산시",
        sido: "52",
        sidonm: "전북특별자치도",
      }),
      rect([127.0, 36.5, 127.1, 36.6], {
        adm_nm: "충청남도 천안시서북구 성정동",
        adm_cd: "44131253",
        adm_cd2: "4413110100",
        sgg: "44131",
        sggnm: "천안시서북구",
        sido: "44",
        sidonm: "충청남도",
      }),
    ],
  };
}

describe("transformRegions", () => {
  it("dissolves 완산구/덕진구 into 전주시 (52110) and keeps 군산시 (52130), excluding 충남", async () => {
    const fc = await transformRegions(JSON.stringify(fixture()));

    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);

    const byCode = new Map(fc.features.map((f) => [f.properties.code, f]));
    expect(new Set(byCode.keys())).toEqual(new Set(["52110", "52130"]));

    const jeonju = byCode.get("52110")!;
    expect(jeonju.properties.name).toBe("전주시");
    const gunsan = byCode.get("52130")!;
    expect(gunsan.properties.name).toBe("군산시");
  });

  it("gives every feature a code/name/bbox/labelPoint, with labelPoint inside bbox", async () => {
    const fc = await transformRegions(JSON.stringify(fixture()));

    for (const f of fc.features) {
      const { code, name, bbox, labelPoint } = f.properties;
      expect(typeof code).toBe("string");
      expect(typeof name).toBe("string");
      expect(bbox).toHaveLength(4);
      expect(labelPoint).toHaveLength(2);

      const [minLng, minLat, maxLng, maxLat] = bbox;
      const [lng, lat] = labelPoint;
      expect(lng).toBeGreaterThanOrEqual(minLng);
      expect(lng).toBeLessThanOrEqual(maxLng);
      expect(lat).toBeGreaterThanOrEqual(minLat);
      expect(lat).toBeLessThanOrEqual(maxLat);
    }
  });

  it("merges the two 전주시 gu rectangles into a bbox spanning both", async () => {
    const fc = await transformRegions(JSON.stringify(fixture()));
    const jeonju = fc.features.find((f) => f.properties.code === "52110")!;
    const [minLng, minLat, maxLng, maxLat] = jeonju.properties.bbox;
    // Union of [127.1,35.78,127.15,35.83] and [127.15,35.78,127.2,35.83]
    expect(minLng).toBeCloseTo(127.1, 4);
    expect(maxLng).toBeCloseTo(127.2, 4);
    expect(minLat).toBeCloseTo(35.78, 4);
    expect(maxLat).toBeCloseTo(35.83, 4);
  });

  describe("작은 섬 제거 (추가 요구 #3)", () => {
    // Two detached rectangles, both sgg=52130 (군산시), physically separate
    // from the mainland 군산시 rectangle and from each other:
    //  - tinyIslet: ~0.003° square (~0.09km² at this latitude) — below the
    //    default 1km² threshold, must be dropped.
    //  - bigIslet: ~0.02° square (~4km² at this latitude) — well above the
    //    threshold, must survive (stands in for a real, meaningfully-sized
    //    island like 위도/선유도, which the brief requires stay on the map).
    function fixtureWithIslands(): FeatureCollection<Polygon, SourceProps> {
      const base = fixture();
      const gunsanProps: SourceProps = {
        adm_nm: "전북특별자치도 군산시 미세섬",
        adm_cd: "52130999",
        adm_cd2: "5213099999",
        sgg: "52130",
        sggnm: "군산시",
        sido: "52",
        sidonm: "전북특별자치도",
      };
      return {
        type: "FeatureCollection",
        features: [
          ...base.features,
          rect([126.5, 36.05, 126.503, 36.053], { ...gunsanProps, adm_nm: "전북특별자치도 군산시 미세섬(작음)" }),
          rect([126.4, 36.1, 126.42, 36.12], { ...gunsanProps, adm_nm: "전북특별자치도 군산시 미세섬(큼)" }),
        ],
      };
    }

    it("drops a sub-1km² detached island but keeps a larger (~4km²) one", async () => {
      // simplifyPercent: 100 (effectively a no-op simplify) isolates
      // -filter-islands' own area threshold from an unrelated confound:
      // mapshaper's percentage-based -simplify, at the default 5%, computes
      // its point-retention budget across the whole shared arc pool, and for
      // this fixture's plain 4-corner rectangles (a handful of points each,
      // unlike a real many-point coastline) that budget can round down to 0
      // surviving points for the *smaller* rectangles regardless of
      // -filter-islands — confirmed empirically while writing this test: at
      // the real pipeline's default 5%, simplify alone (with no island
      // filter at all) already collapsed both the ~0.09km² AND the ~4km²
      // synthetic islet down to nothing, before -filter-islands even ran.
      // The real admdongkor source's actual islands have hundreds of
      // coastline points each, so they don't hit this same-count-of-points
      // edge case (see the "npm run data:regions" real-data results in
      // task-2-report.md: real ~1.6-6.6km² 고군산군도 islands and the
      // ~11.65km² 위도 all survive at the pipeline's real 5% setting).
      const fc = await transformRegions(JSON.stringify(fixtureWithIslands()), { simplifyPercent: 100 });
      const gunsan = fc.features.find((f) => f.properties.code === "52130")!;

      // Exactly 2 parts survive: the mainland rectangle + the ~4km² islet.
      // A single remaining island (beyond the mainland) still serializes as
      // a MultiPolygon with 2 parts, not a bare Polygon.
      expect(gunsan.geometry.type).toBe("MultiPolygon");
      if (gunsan.geometry.type === "MultiPolygon") {
        expect(gunsan.geometry.coordinates).toHaveLength(2);
      }

      // The tiny islet's own corner point must not appear anywhere in the
      // output geometry.
      const text = JSON.stringify(gunsan.geometry);
      expect(text).not.toContain("126.5,36.05");
    });

    it("keeps all 14 시군 codes (island filtering never drops a whole region)", async () => {
      const fc = await transformRegions(JSON.stringify(fixtureWithIslands()));
      // The base fixture only has 전주시/군산시 in-province; island filtering
      // must not remove either of those two features themselves.
      expect(new Set(fc.features.map((f) => f.properties.code))).toEqual(new Set(["52110", "52130"]));
    });
  });
});

describe("transformNeighbors", () => {
  it("keeps only the 충남 feature, with {code, name} properties", async () => {
    const fc = await transformNeighbors(JSON.stringify(fixture()));

    expect(fc.features).toHaveLength(1);
    const [feature] = fc.features;
    expect(feature.properties.code).toBe("44");
    expect(feature.properties.name).toBe("충청남도");
  });
});
