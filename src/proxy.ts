import { NextResponse, type NextRequest } from "next/server";

/**
 * One building tile must have exactly one cacheable URL, or each variant misses the
 * CDN cache and spends the upstream key quota. The route handler checks this too,
 * but Next removes nxtP…/nxtI…-prefixed query keys and decodes the path before the
 * handler runs, so "?nxtPfoo=1" and "/%31%36/…" passed it.
 *
 * Needs `skipProxyUrlNormalize` (next.config.ts): by default Next rewrites those
 * keys before the proxy as well, and a key sent twice disappears altogether.
 */
const PART = "(0|[1-9]\\d{0,6})";
const TILE_PATH = new RegExp(`^/api/buildings/v1/${PART}/${PART}/${PART}$`);

export function proxy(request: NextRequest) {
  const url = new URL(request.url);
  const match = TILE_PATH.exec(url.pathname);
  // A hosting proxy may pass the route's own params as nxtPz/nxtPx/nxtPy. They are
  // harmless only when they repeat the path, once each and spelled plainly: repeated
  // keys, empty pairs ("?&&") or encoded values would each be an unbounded family of
  // URLs for one tile again.
  const internal: Record<string, string> = match ? { nxtPz: match[1], nxtPx: match[2], nxtPy: match[3] } : {};
  const query = [...url.searchParams];
  const mark = request.url.indexOf("?");
  const sent = mark < 0 ? "" : request.url.slice(mark);
  const canonical = match !== null
    && query.every(([name, value]) => internal[name] === value)
    && new Set(query.map(([name]) => name)).size === query.length
    && sent === (query.length ? `?${query.map(([name, value]) => `${name}=${value}`).join("&")}` : "");
  if (canonical) return NextResponse.next();
  return NextResponse.json({ error: "건물 정보를 불러오지 못했습니다" }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

export const config = { matcher: "/api/buildings/:path*" };
