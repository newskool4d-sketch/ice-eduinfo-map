"use client";

import { makeColorScale } from "@/lib/colors";
import type { DataBundle } from "@/lib/data/types";
import { regionName } from "@/lib/geo/regions";
import { indicatorById } from "@/lib/indicators/registry";
import { regionRankList } from "@/lib/selection";
import { displayLabel, rank, valueMap } from "@/lib/stats";
import { useMapQuery } from "@/lib/state/urlState";

export interface RegionListProps {
  bundle: Pick<DataBundle, "indicators" | "series">;
}

function rgbCss([r, g, b]: readonly number[]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The right panel's unselected state: every 시군, ranked by the current
 * indicator (largest value first), each a full-width button. Self-contained
 * like IndicatorMenu — reads `indicatorId` and writes `region` itself via
 * useMapQuery(), so Dashboard only needs to pass the loaded data bundle.
 */
export default function RegionList({ bundle }: RegionListProps) {
  const { indicatorId, setRegion } = useMapQuery();

  const def = indicatorById(indicatorId);
  if (!def) throw new Error(`RegionList: unknown indicatorId "${indicatorId}"`);

  const file = bundle.indicators[indicatorId];
  const map = valueMap(file);
  const label = displayLabel(def, bundle.series);
  const ranks = rank(map);
  const orderedCodes = regionRankList(map);
  const { colorOf } = makeColorScale(def, map);

  return (
    <div>
      <p className="mb-3 text-sm text-[#e6e9f0]/50">시군을 클릭하거나 목록에서 선택하세요</p>
      <p className="mb-2 text-xs text-[#e6e9f0]/40">{label} 기준</p>
      <ul className="flex flex-col gap-1">
        {orderedCodes.map((code) => {
          const value = map.get(code);
          const r = ranks.get(code);
          const [cr, cg, cb] = colorOf(code);
          return (
            <li key={code}>
              <button
                type="button"
                onClick={() => setRegion(code)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5"
              >
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: rgbCss([cr, cg, cb]) }}
                />
                <span className="flex-1 truncate text-sm text-[#e6e9f0]">{regionName(code)}</span>
                <span className="shrink-0 tabular-nums text-xs text-[#e6e9f0]/70">
                  {value === null || value === undefined ? "자료 없음" : def.format(value)}
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums text-[10px] text-[#e6e9f0]/50">
                  {r !== undefined ? `${r}위` : "–"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
