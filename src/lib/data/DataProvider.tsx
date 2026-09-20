"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { assertBundle, loadBundle } from "./load";
import type { DataBundle } from "./types";

type DataState =
  | { status: "loading" }
  | { status: "ready"; bundle: DataBundle }
  | { status: "error"; error: string };

const DataContext = createContext<DataState>({ status: "loading" });

/**
 * Loads the whole dashboard's data bundle once on mount (via loadBundle +
 * assertBundle) and makes it available to descendants through useData()/
 * useBundle(). Loading/error UI is the caller's responsibility (Dashboard.tsx
 * switches on useData().status) — this component only holds the fetch state.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadBundle()
      .then((bundle) => {
        assertBundle(bundle);
        if (!cancelled) setState({ status: "ready", bundle });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

/** Raw load state — never throws. Use when the caller needs to render its own loading/error UI. */
export function useData(): DataState {
  return useContext(DataContext);
}

/** The loaded bundle. Throws if called before status is 'ready' — callers must gate on useData().status first (or only render this subtree once ready, as Dashboard.tsx does). */
export function useBundle(): DataBundle {
  const state = useContext(DataContext);
  if (state.status !== "ready") {
    throw new Error("useBundle() called before data is ready — check useData().status first");
  }
  return state.bundle;
}
