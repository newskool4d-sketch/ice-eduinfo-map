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
 * Builds a deck.gl `getTooltip` callback. `nameOf`/`valueTextOf` are
 * injection points (like the layer factories' `elevationOf`/`fillColorOf`):
 * 1A wires them to the region name + a formatted dummy value; a later task
 * swaps `valueTextOf` for the real indicator's formatted value/rank text.
 */
export function makeTooltip(
  nameOf: (code: string) => string,
  valueTextOf: (code: string) => string,
) {
  return (info: PickingInfo): TooltipResult | null => {
    const code = (info.object as { properties?: { code?: string } } | undefined)?.properties?.code;
    if (!code) return null;
    const name = escapeHtml(nameOf(code));
    const value = escapeHtml(valueTextOf(code));
    return {
      html: `<div><strong>${name}</strong><div>${value}</div></div>`,
      style: TOOLTIP_STYLE,
    };
  };
}
