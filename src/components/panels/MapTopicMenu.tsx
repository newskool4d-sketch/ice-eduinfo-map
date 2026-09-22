"use client";
import { useMapQuery } from "@/lib/state/urlState";
import { issueById } from "@/lib/issues/registry";
import type { SeriesFile } from "@/lib/indicators/types";
import IndicatorMenu from "./IndicatorMenu";

export default function MapTopicMenu({
  series,
}: {
  series: Record<string, SeriesFile>;
}) {
  const { view, issueId } = useMapQuery();
  return view === "issues" ? (
    <span className="truncate text-sm text-ink-muted">
      {issueById(issueId)?.title ?? "교육문제 탐색"}
    </span>
  ) : (
    <IndicatorMenu series={series} />
  );
}
