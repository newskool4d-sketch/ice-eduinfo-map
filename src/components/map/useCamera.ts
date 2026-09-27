"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { FlyToInterpolator } from "@deck.gl/core";
import { unionBbox, type Bbox } from "@/lib/geo/geo";
import { fitOverview, fitRegion, fitViewToPoints } from "./camera";
import { scenePitch, type Scene } from "./scene";
import type { RegionsFeatureCollection } from "@/lib/data/types";
import type { School } from "@/lib/schools/types";

/** Keep the interpolator and controller's zoom-derived pitch identical.
 * Changing pitch after interpolation would interrupt deck.gl's own flight. */
class SceneFlyToInterpolator extends FlyToInterpolator {
  constructor(private scene: Scene, private mobile: boolean) { super({ speed: 1.5 }); }
  override interpolateProps(...args: Parameters<FlyToInterpolator["interpolateProps"]>) {
    const view = super.interpolateProps(...args);
    return { ...view, pitch: scenePitch(this.scene, view.zoom, this.mobile), bearing: 0 };
  }
}

type OverviewViewState = ReturnType<typeof fitOverview>;
export type CameraViewState = OverviewViewState & {
  transitionInterpolator?: FlyToInterpolator;
  transitionDuration?: number | "auto";
  _nonce: number;
};

export function useCamera(
  containerRef: RefObject<HTMLDivElement | null>,
  regions: RegionsFeatureCollection,
  selectedCode: string | null,
  reduceMotion: boolean,
  selectedSchool: School | null = null,
  focusNonce = 0,
  scene: Scene = "city",
  mobile = false,
) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [cameraViewState, setCameraViewState] =
    useState<CameraViewState | null>(null);
  const [reselectNonce, setReselectNonce] = useState(0);
  const latest = useRef<CameraViewState | null>(null);
  const previous = useRef<{
    code: string | null;
    schoolId: string | null;
    focus: number;
    reselect: number;
    scene: Scene;
    mobile: boolean;
  } | null>(null);
  const sequence = useRef(0);
  const reselect = useCallback(() => setReselectNonce((n) => n + 1), []);
  const rememberViewState = useCallback((view: Record<string, unknown>) => {
    latest.current = { ...latest.current, ...view } as CameraViewState;
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      // Tiny transitional sizes cannot display a usable map and may make
      // fitBounds unstable while the mobile header or browser chrome resizes.
      if (width < 32 || height < 32) {
        setSize(null);
        setCameraViewState(null);
        latest.current = null;
        previous.current = null;
        return;
      }
      setSize((old) =>
        old?.width === width && old?.height === height
          ? old
          : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  const overview = useMemo(
    () =>
      size
        ? fitOverview(
            unionBbox(regions.features),
            regions.features.map((f) => f.properties.labelPoint),
            size,
            "road",
          )
        : null,
    [size, regions],
  );

  useEffect(() => {
    if (!size || !overview) return;
    const before = previous.current;
    const current = latest.current;
    let target: OverviewViewState | CameraViewState | null = null;
    // A normal resize keeps the user's zoom and position. The tiny-size gate
    // above clears `previous`, so a map that becomes usable again re-fits.
    if (
      (!before || before.focus !== focusNonce || before.schoolId !== (selectedSchool?.id ?? null)) &&
      selectedSchool?.lat != null &&
      selectedSchool.lng != null
    ) {
      const maxZoom = 18;
      target = {
        ...overview,
        longitude: selectedSchool.lng,
        latitude: selectedSchool.lat,
        zoom: Math.min(maxZoom, Math.max(current?.zoom ?? 0, 16)),
      };
    } else if (
      !before ||
      before.code !== selectedCode ||
      before.reselect !== reselectNonce
    ) {
      const region = regions.features.find(
        (f) => f.properties.code === selectedCode,
      );
      target = region
        ? fitRegion(region.properties.bbox, size, { mode: "road" })
        : overview;
    }
    if (!target && current && (before?.scene !== scene || before?.mobile !== mobile)) target = current;
    previous.current = {
      scene, mobile,
      schoolId: selectedSchool?.id ?? null,
      code: selectedCode,
      focus: focusNonce,
      reselect: reselectNonce,
    };
    if (!target) return;
    const next: CameraViewState = {
      ...target,
      pitch: scenePitch(scene, target.zoom, mobile),
      bearing: 0,
      transitionInterpolator: new SceneFlyToInterpolator(scene, mobile),
      transitionDuration: reduceMotion || !current ? 0 : 550,
      _nonce: ++sequence.current,
    };
    latest.current = next;
    setCameraViewState(next);
  }, [
    size,
    overview,
    regions,
    selectedCode,
    selectedSchool,
    focusNonce,
    reselectNonce,
    reduceMotion,
    scene, mobile,
  ]);

  /** Camera shortcuts leave the user's school, indicator and filters intact. */
  const focusBounds = useCallback((bounds: Bbox, maxZoom = 18) => {
    if (!size || !overview) return;
    const [west, south, east, north] = bounds;
    const points: [number, number][] = [[west, south], [east, north], [west, north], [east, south]];
    const options = { bearing: 0, padding: Math.min(80, size.width / 5, size.height / 5), minZoom: overview.minZoom, maxZoom };
    let target = fitViewToPoints(points, size, { ...options, pitch: 0 });
    target = fitViewToPoints(points, size, { ...options, pitch: scenePitch(scene, target.zoom, mobile) });
    const next: CameraViewState = {
      ...overview, ...target,
      pitch: scenePitch(scene, target.zoom, mobile), bearing: 0,
      transitionInterpolator: new SceneFlyToInterpolator(scene, mobile),
      transitionDuration: reduceMotion ? 0 : 550,
      _nonce: ++sequence.current,
    };
    latest.current = next;
    setCameraViewState(next);
  }, [size, overview, scene, mobile, reduceMotion]);

  return { overview, cameraViewState, reselect, rememberViewState, focusBounds };
}
