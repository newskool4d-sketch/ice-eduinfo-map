import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { useReducedMotion } from "@/lib/useReducedMotion";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * A minimal fake MediaQueryList: tracks `matches` and lets the test flip it
 * mid-session via `trigger`, dispatching to every registered `change`
 * listener (mirrors the real MediaQueryList `change` event shape used by
 * `useReducedMotion`).
 */
function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: QUERY,
    addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
  } as unknown as MediaQueryList;

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      if (query !== QUERY) throw new Error(`unexpected query: ${query}`);
      return mql;
    }),
  );

  return {
    trigger(next: boolean) {
      matches = next;
      const event = { matches: next, media: QUERY } as MediaQueryListEvent;
      listeners.forEach((cb) => cb(event));
    },
    listenerCount: () => listeners.size,
  };
}

function Harness() {
  const reduced = useReducedMotion();
  return <span data-testid="reduced">{String(reduced)}</span>;
}

describe("useReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reflects an initial matchMedia match (reduce: true)", () => {
    installMatchMedia(true);
    render(<Harness />);
    expect(screen.getByTestId("reduced")).toHaveTextContent("true");
  });

  it("reflects an initial matchMedia non-match (reduce: false)", () => {
    installMatchMedia(false);
    render(<Harness />);
    expect(screen.getByTestId("reduced")).toHaveTextContent("false");
  });

  it("updates reactively when the OS setting changes mid-session", () => {
    const control = installMatchMedia(false);
    render(<Harness />);
    expect(screen.getByTestId("reduced")).toHaveTextContent("false");

    act(() => control.trigger(true));
    expect(screen.getByTestId("reduced")).toHaveTextContent("true");

    act(() => control.trigger(false));
    expect(screen.getByTestId("reduced")).toHaveTextContent("false");
  });

  it("unsubscribes on unmount (no leaked listener)", () => {
    const control = installMatchMedia(false);
    const { unmount } = render(<Harness />);
    expect(control.listenerCount()).toBe(1);
    unmount();
    expect(control.listenerCount()).toBe(0);
  });

  it("defaults to false when matchMedia is unavailable (older browser / non-DOM environment)", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<Harness />);
    expect(screen.getByTestId("reduced")).toHaveTextContent("false");
  });
});
