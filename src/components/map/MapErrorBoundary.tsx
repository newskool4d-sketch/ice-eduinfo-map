"use client";

/**
 * Task 6, Section A.3 — wraps MapShell's map-rendering subtree; catches any
 * render exception from it (e.g. a deck.gl/WebGL failure mid-render, not
 * just at mount) and shows `fallback` (MapShell passes a
 * `<MapFallback reason="error" .../>`) instead of a blank/crashed pane.
 * Must be a class component — `getDerivedStateFromError`/`componentDidCatch`
 * have no hook equivalent in React.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

export interface MapErrorBoundaryProps {
  children: ReactNode;
  /** Rendered in place of `children` once a descendant throws while rendering — MapShell passes a `<MapFallback reason="error" .../>` with the same indicatorId/bundle/selectedCode/onSelect props it would otherwise hand DeckMap. */
  fallback: ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
}

export default class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // React's own dev-mode overlay/console already reports the raw error;
    // this line is what actually names MapErrorBoundary in that output (and
    // is what a production build — no dev overlay — relies on to surface
    // the failure at all) plus the component stack, for whoever's looking
    // at logs later.
    console.error("MapErrorBoundary caught a render error in the map:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
