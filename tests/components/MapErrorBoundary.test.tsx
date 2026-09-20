import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import MapErrorBoundary from "@/components/map/MapErrorBoundary";

function Bomb(): never {
  throw new Error("boom");
}

describe("MapErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    render(
      <MapErrorBoundary fallback={<div data-testid="fallback">fallback</div>}>
        <div data-testid="child">real content</div>
      </MapErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("renders the given fallback instead of children once a descendant throws while rendering", () => {
    // React logs the caught error to console.error twice (once from the
    // boundary's own componentDidCatch call below, once from React's
    // internal dev-mode reporting) — expected/intentional for this test,
    // not a real console error the app would show a user.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <MapErrorBoundary fallback={<div data-testid="fallback">fallback</div>}>
        <Bomb />
      </MapErrorBoundary>,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it("logs the caught error via console.error (so it's still visible in devtools/CI logs)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <MapErrorBoundary fallback={<div>fallback</div>}>
        <Bomb />
      </MapErrorBoundary>,
    );

    const loggedMapErrorBoundary = spy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("MapErrorBoundary")),
    );
    expect(loggedMapErrorBoundary).toBe(true);
    spy.mockRestore();
  });
});
