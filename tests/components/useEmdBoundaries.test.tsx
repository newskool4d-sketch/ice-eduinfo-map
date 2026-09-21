import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { FeatureCollection } from "geojson";

import { useEmdBoundaries } from "@/components/map/useEmdBoundaries";

// The hook's cache (src/components/map/useEmdBoundaries.ts) is module-scope
// and persists for the lifetime of this test FILE (one module import), not
// just one `it()` — every test below therefore uses its OWN, never-reused
// 시군 code (6 distinct REGION_CODES across the file) so a cache entry
// populated by one test can never leak into another's assertions.
function Harness({ code, enabled }: { code: string | null; enabled: boolean }) {
  const fc = useEmdBoundaries(code, enabled);
  return <span data-testid="result">{fc === null ? "null" : String(fc.features.length)}</span>;
}

function okResponse(fc: FeatureCollection): Response {
  return { ok: true, json: async () => fc } as unknown as Response;
}

function fcWith(featureCount: number): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: Array.from({ length: featureCount }, (_, i) => ({
      type: "Feature",
      properties: { code: String(i), name: `emd-${i}` },
      geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    })),
  };
}

describe("useEmdBoundaries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("(a) enabled=false never calls fetch", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness code="52110" enabled={false} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("result")).toHaveTextContent("null");
  });

  it("code=null never calls fetch, regardless of enabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness code={null} enabled={true} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a code outside the 14 REGION_CODES never calls fetch (avoids an unsuppressable 'failed to load resource' console entry for a file that can never exist)", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness code="99999" enabled={true} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("(b) a second hook MOUNT with the same code is a cache hit — fetch is called exactly once total", async () => {
    const code = "52130";
    const fetchMock = vi.fn(async () => okResponse(fcWith(3)));
    vi.stubGlobal("fetch", fetchMock);

    const first = render(<Harness code={code} enabled={true} />);
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("3"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`/data/emd/${code}.geojson`);
    first.unmount();

    // A brand-new mount (not a rerender of the same instance) — the cache is
    // module-scope, so this must NOT trigger a second fetch.
    render(<Harness code={code} enabled={true} />);
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("3"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("(c) a late-arriving response for an ABANDONED code is ignored (stale guard) — the current code's result wins regardless of arrival order", async () => {
    const codeA = "52140";
    const codeB = "52180";
    const resolvers = new Map<string, (body: FeatureCollection) => void>();
    const fetchMock = vi.fn(
      (url: string) =>
        new Promise<Response>((resolve) => {
          resolvers.set(url, (body) => resolve(okResponse(body)));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<Harness code={codeA} enabled={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/data/emd/${codeA}.geojson`));

    rerender(<Harness code={codeB} enabled={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/data/emd/${codeB}.geojson`));

    // B (the CURRENT code) resolves first.
    resolvers.get(`/data/emd/${codeB}.geojson`)!(fcWith(2));
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("2"));

    // A (the ABANDONED code) resolves LATE, after the code already moved on
    // to B — must be silently ignored, not overwrite B's result.
    resolvers.get(`/data/emd/${codeA}.geojson`)!(fcWith(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("result")).toHaveTextContent("2");
  });

  it("(d) a network rejection resolves to null without ever calling console.error", async () => {
    const code = "52190";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness code={code} enabled={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("null"));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("(d) an HTTP failure (res.ok=false) resolves to null without ever calling console.error", async () => {
    const code = "52210";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: false,
          status: 404,
          json: async () => {
            throw new Error("no body");
          },
        }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness code={code} enabled={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("null"));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("(d) a JSON parse failure resolves to null without ever calling console.error", async () => {
    const code = "52800";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => {
            throw new SyntaxError("Unexpected token");
          },
        }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness code={code} enabled={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("null"));
    expect(consoleError).not.toHaveBeenCalled();
  });
});
