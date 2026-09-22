import { NextResponse } from "next/server";

const TERRAIN_SOURCE = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z: rawZ, x: rawX, y: rawY } = await params;
  const z = Number(rawZ);
  const x = Number(rawX);
  const y = Number(rawY.replace(/\.png$/, ""));
  const limit = 2 ** z;
  if (!Number.isInteger(z) || z < 0 || z > 14 || !Number.isInteger(x) || !Number.isInteger(y) ||
      x < 0 || y < 0 || x >= limit || y >= limit) {
    return new NextResponse("Invalid terrain tile", { status: 400 });
  }

  const upstream = await fetch(`${TERRAIN_SOURCE}/${z}/${x}/${y}.png`, {
    next: { revalidate: 60 * 60 * 24 * 7 },
  });
  if (!upstream.ok) return new NextResponse(null, { status: upstream.status });

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
