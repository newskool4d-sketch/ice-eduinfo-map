"use client";

/**
 * Task 6, Section A.1 — the table-based stand-in for the 3D map, shown by
 * MapShell when WebGL2 isn't available or the viewport is too narrow (and,
 * via MapErrorBoundary, when the map itself throws while rendering). No
 * deck.gl import (deck.gl imports are scoped to components that actually
 * need a WebGL canvas) and no context reads — `bundle`/`indicatorId`/
 * `selectedCode`/`onSelect` are all explicit props, exactly like
 * RegionList/RegionPanel, so this renders (and is unit-testable) with a
 * small in-memory fixture and no DataProvider/nuqs wrapper at all.
 */
import type { DataBundle } from "@/lib/data/types";
import { regionName, type RegionCode } from "@/lib/geo/regions";
import { indicatorById } from "@/lib/indicators/registry";
import { makeColorScale } from "@/lib/colors";
import { domainOf } from "@/lib/scales";
import { regionRankList } from "@/lib/selection";
import { displayLabel, rank, valueMap } from "@/lib/stats";

export interface MapFallbackProps {
  indicatorId: string;
  bundle: Pick<DataBundle, "indicators" | "series">;
  selectedCode: RegionCode | null;
  onSelect: (code: RegionCode | null) => void;
  /** Why the map isn't shown — each gets its own banner text. 'webgl' (no WebGL2 context), 'viewport' (<768px wide), 'error' (MapErrorBoundary caught a render exception). */
  reason: "webgl" | "viewport" | "error";
}

const REASON_TEXT: Record<MapFallbackProps["reason"], string> = {
  webgl: "이 환경에서는 3D 지도를 표시할 수 없어 표로 보여드립니다",
  viewport: "화면이 좁아 표로 표시합니다",
  error: "지도를 표시하는 중 오류가 발생해 표로 보여드립니다",
};

function rgbCss([r, g, b]: readonly number[]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 현재 지표의 14개 시군 값을 순위 순 표로: 이름·값·순위·가로 막대(값 비율,
 * 지도와 같은 색). The bar's width normalizes over the SAME domain
 * `makeElevationScale`/the map's own bar height uses (`domainOf`), and its
 * color comes from the SAME `makeColorScale` the map's top faces use — so
 * this table reads as a direct, consistent stand-in for the map, not a
 * separately-invented visualization.
 */
export default function MapFallback({ indicatorId, bundle, selectedCode, onSelect, reason }: MapFallbackProps) {
  const def = indicatorById(indicatorId);
  if (!def) {
    throw new Error(`MapFallback: unknown indicatorId "${indicatorId}"`);
  }

  const file = bundle.indicators[indicatorId];
  const map = valueMap(file);
  const label = displayLabel(def, bundle.series);
  const orderedCodes = regionRankList(map);
  const ranks = rank(map);
  const { colorOf } = makeColorScale(def, map);
  const [d0, d1] = domainOf(def, map);
  const span = d1 - d0 || 1;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-[#0b0f19] p-4 text-[#e6e9f0]">
      <p data-testid="map-fallback-reason" className="mb-1 text-sm font-medium text-[#e6e9f0]">
        {REASON_TEXT[reason]}
      </p>
      <p className="mb-3 text-xs text-[#e6e9f0]/60">{label} 기준 · 시군을 클릭하면 선택됩니다</p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs text-[#e6e9f0]/60">
            <th scope="col" className="py-1 pr-2 font-normal">
              시군
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-normal">
              값
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-normal">
              순위
            </th>
            <th scope="col" className="w-1/3 py-1 pl-2 font-normal">
              비교
            </th>
          </tr>
        </thead>
        <tbody>
          {orderedCodes.map((code) => {
            const value = map.get(code);
            const r = ranks.get(code);
            const isSelected = code === selectedCode;
            const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(1, (value - d0) / span)) * 100;
            const [cr, cg, cb] = colorOf(code);
            return (
              <tr
                key={code}
                aria-current={isSelected ? "true" : undefined}
                onClick={() => onSelect(code)}
                className={`cursor-pointer border-b border-white/5 ${isSelected ? "bg-white/15" : "hover:bg-white/5"}`}
              >
                <td className="py-1 pr-2">
                  {/* Fix round 1/5, finding 3: the <tr>'s onClick above is a
                      mouse-only convenience (mirrors RegionPanel's row
                      pattern) — this <button> is the real keyboard/a11y
                      affordance (tab stop, accessible name). Its handler
                      stops propagation so a click ON the button doesn't ALSO
                      bubble up and fire the row's own onClick a second time. */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(code);
                    }}
                    className="rounded px-1 text-left hover:underline"
                  >
                    {regionName(code)}
                  </button>
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {value === null || value === undefined ? "자료 없음" : def.format(value)}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums text-[#e6e9f0]/70">{r !== undefined ? `${r}위` : "–"}</td>
                <td className="py-1 pl-2">
                  <div className="h-3 w-full rounded-sm bg-white/5">
                    <div
                      data-testid="fallback-bar-fill"
                      className="h-3 rounded-sm"
                      style={{ width: `${pct}%`, backgroundColor: rgbCss([cr, cg, cb]) }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
