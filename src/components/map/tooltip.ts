import type { PickingInfo } from "@deck.gl/core";

export interface TooltipResult {
  html: string;
  style: Partial<CSSStyleDeclaration>;
}

const TOOLTIP_STYLE: Partial<CSSStyleDeclaration> = {
  background: "#141a2a",
  color: "#e6e9f0",
  border: "1px solid #2a3450",
  borderRadius: "8px",
  padding: "8px 10px",
  fontSize: "13px",
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Builds a deck.gl `getTooltip` callback. `linesOf` is the injection point
 * (like the layer factories' `elevationOf`/`fillColorOf`): DeckMap.tsx
 * builds [name, "label: value 단위", "14개 시군 중 n위", "전북 평균 대비 ±x"]
 * for the real indicator. The first line renders bold as the tooltip's
 * title, every subsequent line as its own `<div>` — a single line with an
 * embedded "\n" can't be split into separate HTML lines, hence the list
 * shape instead of a single formatted string. `linesOf` returning null (or
 * an empty array) suppresses the tooltip, same as no code being hovered.
 */
export function makeTooltip(linesOf: (code: string) => string[] | null) {
  return (info: PickingInfo): TooltipResult | null => {
    const code = (info.object as { properties?: { code?: string } } | undefined)?.properties?.code;
    if (!code) return null;
    const lines = linesOf(code);
    if (!lines || lines.length === 0) return null;
    const [title, ...rest] = lines;
    const body = rest.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
    return {
      html: `<div><strong>${escapeHtml(title)}</strong>${body}</div>`,
      style: TOOLTIP_STYLE,
    };
  };
}
