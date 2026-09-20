import type { DataBundle } from "@/lib/data/types";
import { PROVINCE_CODE } from "@/lib/geo/regions";
import { indicatorById } from "@/lib/indicators/registry";
import { deltaPrevYear, trend, valueMap } from "@/lib/stats";

/**
 * The 4 province-wide (52000) KPI tiles fixed by the task brief, in the
 * order it lists them: 학교수 / 학생수 / 교원수 / 소규모학교 수. Unrelated to
 * the map's selected indicator (URL `indicator` param) — these 4 are always
 * shown together regardless of what's selected in IndicatorMenu.
 */
const KPI_INDICATOR_IDS = ["schools_total", "students_total", "teachers_total", "small_schools"] as const;

export interface KpiTilesProps {
  indicators: DataBundle["indicators"];
  series: DataBundle["series"];
  manifest: DataBundle["manifest"];
}

function requireIndicator(id: string) {
  const def = indicatorById(id);
  if (!def) throw new Error(`KpiTiles: unknown indicator id "${id}"`);
  return def;
}

export default function KpiTiles({ indicators, series, manifest }: KpiTilesProps) {
  const latestYear = manifest.latestYear;

  return (
    <dl className="flex shrink-0 items-center gap-2">
      {KPI_INDICATOR_IDS.map((id) => {
        const def = requireIndicator(id);
        const file = indicators[id];
        const value = file ? valueMap(file).get(PROVINCE_CODE) ?? null : null;

        // Every KPI_INDICATOR_IDS entry is a sum/count aggregate (never
        // aggregate.kind === 'external'), so build-indicators.ts always
        // writes a series file for these 4 — but index into a
        // Record<string, SeriesFile> is still statically typed as
        // non-optional (no noUncheckedIndexedAccess), so this guards the
        // data contract rather than the type system.
        const seriesFile = series[id];
        const rows = seriesFile ? trend(seriesFile, PROVINCE_CODE) : [];
        const latestIdx = rows.findIndex((r) => r.year === latestYear);
        const prevYear = latestIdx > 0 ? rows[latestIdx - 1].year : null;
        const delta = seriesFile ? deltaPrevYear(seriesFile, PROVINCE_CODE, latestYear) : null;

        // Direction always shows both a symbol AND a color (never color
        // alone, per the brief's accessibility note) — only an increase on
        // a higherWorse-polarity indicator (currently: small_schools) gets
        // the warning tone; every other case (including a decrease on that
        // same indicator) is neutral. A zero or missing delta shows "—".
        const isWarn = delta !== null && delta > 0 && def.polarity === "higherWorse";
        const deltaText =
          delta === null || delta === 0 ? "—" : `${delta > 0 ? "▲" : "▼"} ${def.format(Math.abs(delta))}`;

        return (
          <div
            key={id}
            data-testid={`kpi-tile-${id}`}
            title={prevYear !== null ? `${prevYear} → ${latestYear}` : undefined}
            className="flex w-[104px] shrink-0 flex-col gap-0.5 rounded bg-white/5 px-2 py-1"
          >
            <dt className="truncate text-[10px] text-[#e6e9f0]/70">{def.label}</dt>
            <dd
              data-testid={`kpi-value-${id}`}
              className="tabular-nums text-sm font-semibold text-[#e6e9f0]"
            >
              {value === null ? "—" : def.format(value)}
            </dd>
            <dd
              data-testid={`kpi-delta-${id}`}
              data-tone={isWarn ? "warn" : "neutral"}
              className={`tabular-nums text-[10px] ${isWarn ? "text-orange-400" : "text-[#e6e9f0]/70"}`}
            >
              {deltaText}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
