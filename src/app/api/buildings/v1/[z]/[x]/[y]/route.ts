import { fetchBuildingTile } from "@/lib/buildings/server";
import { validBuildingTile } from "@/lib/buildings/tiles";

export const runtime = "nodejs";
export const maxDuration = 15;
const fail = (status: number) => Response.json({ error: "건물 정보를 불러오지 못했습니다" }, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request, context: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await context.params;
  if (![z, x, y].every((part) => /^\d+$/.test(part)) || !validBuildingTile(Number(z), Number(x), Number(y))) return fail(400);
  const key = process.env.VWORLD_BUILDING_KEY;
  if (!key || process.env.BUILDINGS_ENABLED === "false" || process.env.NEXT_PUBLIC_BUILDINGS_ENABLED === "false") return fail(503);
  try {
    const tile = await fetchBuildingTile(Number(x), Number(y), { key, domain: process.env.VWORLD_BUILDING_DOMAIN, signal: request.signal });
    return Response.json(tile, { headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    } });
  } catch (error) {
    if (request.signal.aborted) return fail(502); // Normal viewport cancellation.
    // Only static categories: fetch errors can contain the credential-bearing URL.
    const known = ["Building source invalid JSON","Building source invalid key", "Building source invalid domain", "Building source HTTP failure", "Building source unavailable", "Incomplete building source", "Invalid building geometry", "Repeated building page"];
    const reason = error instanceof Error && known.includes(error.message) ? error.message
      : error instanceof Error && error.name === "TimeoutError" ? "timeout" : "transport";
    const codes = ["ENOTFOUND", "ECONNRESET", "CERT_HAS_EXPIRED", "UND_ERR_CONNECT_TIMEOUT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"];
    const cause = error instanceof Error ? error.cause as { code?: string } | undefined : undefined;
    const redact = (message: string) => message.replaceAll(key, "[redacted]").replaceAll(encodeURIComponent(key), "[redacted]").replace(/https?:\/\/\S+/g, "[upstream]").slice(0, 240);
    console.warn("Building tile unavailable", { reason,
      detail: error instanceof Error ? redact(error.message) : undefined,
      cause: error instanceof Error && error.cause instanceof Error ? redact(error.cause.message) : undefined,
      kind: error instanceof TypeError ? "TypeError" : error instanceof SyntaxError ? "SyntaxError" : "Error",
      transportCode: cause?.code && codes.includes(cause.code) ? cause.code : undefined,
    });
    return fail(502);
  }
}
