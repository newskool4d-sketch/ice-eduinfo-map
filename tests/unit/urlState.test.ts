import { describe, expect, it } from "vitest";
import { createLoader } from "nuqs/server";

import { mapQueryParsers } from "@/lib/state/urlState";
import { DEFAULT_INDICATOR_ID, INDICATOR_IDS } from "@/lib/indicators/registry";
import { PROVINCE_CODE, REGION_CODES } from "@/lib/geo/regions";

// createLoader() runs the exact same {parse -> fallback to defaultValue/null}
// resolution useQueryStates() applies internally (see loader.ts's
// `result[key] = parsedValue ?? parser.defaultValue ?? null`), without
// needing React/jsdom — this file lives under tests/unit (node environment,
// per vitest.config.ts), so a component-level render isn't available here
// anyway. The hook itself (useMapQuery) is exercised indirectly through
// tests/components/IndicatorMenu.test.tsx.
const loadMapQuery = createLoader(mapQueryParsers);

describe("indicator URL param", () => {
  it("parses every registered indicator id", () => {
    for (const id of INDICATOR_IDS) {
      expect(loadMapQuery(`?indicator=${id}`).indicator).toBe(id);
    }
  });

  it("falls back to DEFAULT_INDICATOR_ID for an invalid value", () => {
    expect(loadMapQuery("?indicator=not_a_real_indicator").indicator).toBe(DEFAULT_INDICATOR_ID);
  });

  it("defaults to DEFAULT_INDICATOR_ID when absent from the URL", () => {
    expect(loadMapQuery("").indicator).toBe(DEFAULT_INDICATOR_ID);
  });

  it("never returns null (always has a default)", () => {
    expect(loadMapQuery("?indicator=").indicator).toBe(DEFAULT_INDICATOR_ID);
  });
});

describe("region URL param", () => {
  it("parses every one of the 14 시군 codes", () => {
    for (const code of REGION_CODES) {
      expect(loadMapQuery(`?region=${code}`).region).toBe(code);
    }
  });

  it("falls back to null for an invalid value (no default is set)", () => {
    expect(loadMapQuery("?region=not_a_real_region").region).toBeNull();
  });

  it("falls back to null for the 52000 province aggregate code (not a selectable 시군)", () => {
    expect(loadMapQuery(`?region=${PROVINCE_CODE}`).region).toBeNull();
  });

  it("defaults to null when absent from the URL", () => {
    expect(loadMapQuery("").region).toBeNull();
  });
});

describe("indicator + region together", () => {
  it("parses both independently from the same URL", () => {
    const result = loadMapQuery(`?indicator=schools_total&region=${REGION_CODES[0]}`);
    expect(result.indicator).toBe("schools_total");
    expect(result.region).toBe(REGION_CODES[0]);
  });

  it("an invalid region does not affect a valid indicator, and vice versa", () => {
    const result = loadMapQuery("?indicator=teachers_total&region=xx000");
    expect(result.indicator).toBe("teachers_total");
    expect(result.region).toBeNull();
  });
});
