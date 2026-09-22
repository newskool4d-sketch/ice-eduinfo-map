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
import { unionBbox } from "@/lib/geo/geo";
import { fitOverview, fitRegion } from "./camera";
import type { RegionsFeatureCollection } from "@/lib/data/types";
import type { School } from "@/lib/schools/types";

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
    focus: number;
    reselect: number;
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
      if (width > 0 && height > 0)
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
    if (
      (!before || before.focus !== focusNonce) &&
      selectedSchool?.lat != null &&
      selectedSchool.lng != null
    ) {
      const maxZoom = 18;
      target = {
        ...overview,
        longitude: selectedSchool.lng,
        latitude: selectedSchool.lat,
        zoom: Math.min(maxZoom, Math.max(current?.zoom ?? 0, 15)),
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
    previous.current = {
      code: selectedCode,
      focus: focusNonce,
      reselect: reselectNonce,
    };
    if (!target) return;
    const next: CameraViewState = {
      ...target,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.5 }),
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
  ]);

  return { overview, cameraViewState, reselect, rememberViewState };
}
