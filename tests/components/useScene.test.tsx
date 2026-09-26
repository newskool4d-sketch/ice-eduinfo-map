import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { PROFILES } from "@/lib/profiles";
import { useScene } from "@/components/map/useScene";
import { readScenePref, SCENE_PREF_KEY, writeScenePref } from "@/components/map/scene";

vi.mock("@/lib/profiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/profiles")>();
  return { ...actual, ACTIVE_PROFILE: actual.PROFILES.incheon };
});

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); localStorage.clear(); });

function Harness() {
  const { scene, enabled, setScene } = useScene();
  return <><output>{scene}</output><button disabled={!enabled} onClick={() => setScene(scene === "flat" ? "city" : "flat")}>전환</button></>;
}

describe("Incheon scene preference", () => {
  it("starts flat even when the old Jeonbuk storage says city", async () => {
    localStorage.setItem(SCENE_PREF_KEY, "city");
    const onUrlUpdate = vi.fn();
    render(<Harness />, { wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true }) });
    expect(screen.getByRole("status")).toHaveTextContent("flat");
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("scene")).toBe("flat");
  });

  it("lets an explicit URL override the stored scene", () => {
    writeScenePref("flat", PROFILES.incheon);
    render(<Harness />, { wrapper: withNuqsTestingAdapter({ searchParams: "?scene=city", hasMemory: true }) });
    expect(screen.getByRole("status")).toHaveTextContent("city");
  });

  it("remembers an explicit choice without overwriting Jeonbuk", async () => {
    writeScenePref("flat", PROFILES.jeonbuk);
    const onUrlUpdate = vi.fn();
    render(<Harness />, { wrapper: withNuqsTestingAdapter({ searchParams: "?scene=flat", onUrlUpdate, hasMemory: true }) });
    await userEvent.click(screen.getByRole("button", { name: "전환" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("city"));
    expect(readScenePref(PROFILES.incheon)).toBe("city");
    expect(readScenePref(PROFILES.jeonbuk)).toBe("flat");
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("scene")).toBe("city");
  });

  it("honors the feature stop setting even for a city URL", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILDINGS_ENABLED", "false");
    const onUrlUpdate = vi.fn();
    render(<Harness />, { wrapper: withNuqsTestingAdapter({ searchParams: "?scene=city", onUrlUpdate, hasMemory: true }) });
    expect(screen.getByRole("status")).toHaveTextContent("flat");
    expect(screen.getByRole("button")).toBeDisabled();
    expect(onUrlUpdate).not.toHaveBeenCalled();
  });

  it("uses region defaults for unavailable or invalid browser storage", () => {
    expect(readScenePref(PROFILES.incheon)).toBe("flat");
    expect(readScenePref(PROFILES.jeonbuk)).toBe("city");
    localStorage.setItem("jb-edu-map:scene:incheon:v1", "unknown");
    expect(readScenePref(PROFILES.incheon)).toBe("flat");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("disabled"); });
    expect(readScenePref(PROFILES.incheon)).toBe("flat");
    expect(readScenePref(PROFILES.jeonbuk)).toBe("city");
  });
});
