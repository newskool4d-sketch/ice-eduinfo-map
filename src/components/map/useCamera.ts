"use client";

/**
 * DeckMap's camera: the "전체 보기" seed, the currently-applied
 * `initialViewState`, and the imperative fly-to that keeps it in sync with
 * `selectedCode`. Split out of DeckMap.tsx (Task 6, "현재 코드 상태" — the
 * file was ~680 lines) with NO intended behavior change: every effect/ref/
 * comment below is moved verbatim from DeckMap.tsx, not rewritten. See
 * task-6-report.md.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { FlyToInterpolator } from "@deck.gl/core";

import { unionBbox, type Bbox } from "@/lib/geo/geo";
import { fitOverview, fitRegion } from "@/components/map/camera";
import type { RegionsFeatureCollection } from "@/lib/data/types";

type OverviewViewState = ReturnType<typeof fitOverview>;

/** What's actually fed to `<DeckGL initialViewState>` — the overview/region fit plus a monotonic `_nonce` so re-applying the SAME target (e.g. re-clicking the already-selected region) still forces deck.gl to reset its camera. See `flyTo` below for why: `Deck.setProps` skips the reset when the new `initialViewState` is deep-equal (by content, depth 3) to the previous one — see task-4A-report.md. */
export type CameraViewState = OverviewViewState & {
  transitionInterpolator?: FlyToInterpolator;
  transitionDuration?: number | "auto";
  _nonce: number;
};

export interface UseCameraResult {
  /** The "전체 보기" seed: computed once on mount, never again — kept STABLE and separate from `cameraViewState` so DeckMap's ResetViewWidget can be told explicitly to reset to the overview even while a region is selected. */
  overview: OverviewViewState | null;
  /** What's actually passed to `<DeckGL initialViewState>` right now. */
  cameraViewState: CameraViewState | null;
  /**
   * Re-applies the camera for whichever region is currently selected (or the
   * overview, if nothing is), always stamping a fresh `_nonce` — used by
   * both a canvas re-click on the ALREADY-selected region and an Enter/
   * keyboard re-select of it (DeckMap's handleRegionClick /
   * useRegionKeyboardNav's Enter case), neither of which changes
   * `selectedCode` at all and so wouldn't otherwise re-fire the camera-sync
   * effect below.
   */
  reselect: () => void;
}

/**
 * `containerRef` must already be attached to the map wrapper div by the
 * caller (DeckMap creates it via `useRef<HTMLDivElement>(null)` and renders
 * `<div ref={containerRef}>`) — this hook only ever reads its `.current`,
 * never creates or attaches it, so the SAME ref can also back
 * `handleAfterRender`'s e2e bridge and the wrapper's own DOM node.
 */
export function useCamera(
  containerRef: RefObject<HTMLDivElement | null>,
  regions: RegionsFeatureCollection,
  selectedCode: string | null,
  reduceMotion: boolean,
): UseCameraResult {
  const [overview, setOverview] = useState<OverviewViewState | null>(null);
  // What's actually passed to `<DeckGL initialViewState>` right now.
  const [cameraViewState, setCameraViewState] = useState<CameraViewState | null>(null);

  const nonceRef = useRef(0);
  // Bumped (never read for its value, only its identity as a dependency) by
  // `reselect` when the caller (re-)selects the region that's ALREADY
  // selected — `selectedCode` itself wouldn't change in that case, so the
  // camera-sync effect below wouldn't otherwise re-fire (see
  // `CameraViewState`'s doc comment for why re-clicking the same region
  // still needs to reset the camera). Deliberately plain state, not a ref:
  // a ref read reachable from a click/keyboard handler — which is handed to
  // deck.gl as a layer-prop value during DeckMap's `layers` useMemo, a
  // render-phase computation — trips eslint-plugin-react-hooks' `refs` rule
  // ("a ref might be read during render"), even though deck.gl only invokes
  // onClick later, from a real click. Routing the "reselect" signal through
  // state instead means neither click/keyboard handler touches a ref at
  // all; only this hook's own effect (a safe place to read one) calls
  // `flyTo`.
  const [reselectNonce, setReselectNonce] = useState(0);
  const reselect = useCallback(() => {
    setReselectNonce((n) => n + 1);
  }, []);

  // Uncontrolled camera, initial mount only: compute the overview from the
  // container's measured size, the loaded regions' combined bbox, and every
  // region's label point (fitOverview needs both — see camera.ts's
  // fitViewToPoints — so a label doesn't end up clipped even when the
  // polygon bbox itself just barely fits). No transition here — nothing has
  // been rendered yet for a fly-from position to make sense against.
  useEffect(() => {
    if (overview) return; // once only
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const bbox: Bbox = unionBbox(regions.features);
    const labelPoints = regions.features.map((f) => f.properties.labelPoint);
    const initial = fitOverview(bbox, labelPoints, { width, height });
    setOverview(initial);
    setCameraViewState({ ...initial, _nonce: 0 });
    // `regions` is a stable reference for the data bundle's lifetime (set
    // once on load, never recreated) — this effect only re-runs if the
    // container itself is remeasured via a fresh mount.
  }, [regions, overview, containerRef]);

  // Imperatively (re-)applies the camera for `code` (a region, or null for
  // the overview), always stamping a fresh `_nonce` — see CameraViewState's
  // doc comment for why that's required even when the target is UNCHANGED
  // from what's currently applied. Only ever called from the camera-sync
  // effect below — never directly from a click/keydown handler (see
  // `reselectNonce`'s doc comment for why).
  const flyTo = useCallback(
    (code: string | null) => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const size = { width, height };

      nonceRef.current += 1;
      const nonce = nonceRef.current;

      if (code) {
        const feature = regions.features.find((f) => f.properties.code === code);
        if (!feature) return;
        // Allow room for the real terrain relief rather than the removed
        // 12 km statistical blocks when fitting a selected region.
        const view = fitRegion(feature.properties.bbox, size, { maxElevation: 2000 });
        setCameraViewState({
          ...view,
          transitionDuration: reduceMotion ? 0 : view.transitionDuration,
          _nonce: nonce,
        });
      } else {
        const bbox = unionBbox(regions.features);
        const labelPoints = regions.features.map((f) => f.properties.labelPoint);
        const view = fitOverview(bbox, labelPoints, size);
        setCameraViewState({
          ...view,
          transitionInterpolator: new FlyToInterpolator({ speed: 1.5 }),
          transitionDuration: reduceMotion ? 0 : "auto",
          _nonce: nonce,
        });
      }
    },
    [regions, reduceMotion, containerRef],
  );

  // The single place that actually moves the camera, for every trigger:
  // selectedCode changing (RegionList click, canvas click on a NEW region,
  // ←/→, Esc, browser back/forward, a `?region=` deep link — all flow
  // through onSelect -> the URL -> selectedCode) AND reselectNonce changing
  // (re-clicking/re-Entering the ALREADY-selected region, which doesn't
  // change selectedCode at all).
  useEffect(() => {
    if (!overview) return; // wait for the mount effect first (and re-fire once it's ready, e.g. a `?region=` deep link)
    flyTo(selectedCode);
  }, [selectedCode, overview, reselectNonce, flyTo]);

  return { overview, cameraViewState, reselect };
}
