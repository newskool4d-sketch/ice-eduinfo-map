/**
 * Pure helpers for 시군 selection: keyboard cycling order, the aria-live
 * announcement text, and (indirectly, via regionRankList) the RegionList
 * button order. No React/deck.gl import — usable from DeckMap.tsx (which
 * can't be rendered in jsdom, see task-4A-brief.md) and from plain unit
 * tests alike.
 */
import { REGION_CODES, type RegionCode } from "./geo/regions";
import { rank } from "./stats";

/**
 * Returns the next code in `codes` after `current`, stepping by `dir` (1 =
 * forward/→, -1 = backward/←) and wrapping around both ends (last→first
 * going forward, first→last going backward).
 *
 * `current === null` (nothing selected yet) or `current` not present in
 * `codes` (defensive: e.g. a stale code after the underlying data changed)
 * are both treated the same way — as if the "cursor" sits just outside the
 * list — so `dir: 1` lands on `codes[0]` (rank 1) and `dir: -1` lands on the
 * last code, symmetric with the wrap-around behavior once something IS
 * selected.
 */
export function nextRegion<T extends string>(codes: readonly T[], current: T | null, dir: 1 | -1): T | null {
  if (codes.length === 0) return null;

  const idx = current === null ? -1 : codes.indexOf(current);
  if (idx === -1) {
    return dir === 1 ? codes[0] : codes[codes.length - 1];
  }

  const nextIdx = (idx + dir + codes.length) % codes.length;
  return codes[nextIdx];
}

/**
 * All 14 REGION_CODES ordered by `rank(map)` ascending (rank 1 — the
 * largest value — first). Codes with no rank (a null/missing value in
 * `map`) are appended after every ranked code, in their original
 * REGION_CODES order (Array.prototype.sort is stable, and the input is
 * already REGION_CODES-ordered, so ties — same rank OR both unranked — keep
 * that relative order without any extra tie-break logic).
 *
 * Used both for RegionList's render order and, via DeckMap, as the `codes`
 * argument to `nextRegion` for ←/→ cycling ("현재 순위 순" per the task
 * brief) — one canonical ordering serves both.
 */
export function regionRankList(map: Map<string, number | null>): RegionCode[] {
  const ranks = rank(map);
  return [...REGION_CODES].sort((a, b) => {
    const ra = ranks.get(a);
    const rb = ranks.get(b);
    if (ra === undefined && rb === undefined) return 0;
    if (ra === undefined) return 1;
    if (rb === undefined) return -1;
    return ra - rb;
  });
}

export interface SelectionAnnouncementParams {
  /** 시군 display name, e.g. "전주시". */
  name: string;
  /** Current indicator's display label, e.g. "학생수". */
  label: string;
  /** Already-formatted value (with unit), e.g. "70,851명", or "자료 없음". */
  valueText: string;
  /** This region's rank for the current indicator, or null when it has no data (no rank assigned). */
  rank: number | null;
  /** Total selectable 시군 count (14). */
  total: number;
}

/**
 * Builds the `aria-live="polite"` announcement text DeckMap shows (visually
 * hidden) whenever the selected 시군 changes — e.g. "전주시 선택됨, 학생수
 * 70,851명, 14개 시군 중 1위" per the task brief's literal example.
 */
export function selectionAnnouncement({ name, label, valueText, rank, total }: SelectionAnnouncementParams): string {
  const rankText = rank !== null ? `${total}개 시군 중 ${rank}위` : "순위 없음";
  return `${name} 선택됨, ${label} ${valueText}, ${rankText}`;
}
