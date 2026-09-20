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
