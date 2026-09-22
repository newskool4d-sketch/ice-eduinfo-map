"use client";

/**
 * Keyboard navigation for the map wrapper: ←/→ cycling + Enter-to-select/
 * reselect (`handleWrapperKeyDown`, wired to the wrapper's `onKeyDown`), and
 * document-level Escape-to-deselect (a self-attaching effect). Split out of
 * DeckMap.tsx (Task 6, "현재 코드 상태") with NO intended behavior change:
 * every handler/effect/comment below is moved verbatim from DeckMap.tsx, not
 * rewritten. See task-6-report.md.
 */
import {
  useCallback,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { RegionCode } from "@/lib/geo/regions";
import { nextRegion } from "@/lib/selection";

export interface UseRegionKeyboardNavOptions {
  disabled?: boolean;
  /** Current indicator's rank order (largest value first) — see selection.ts's regionRankList; also RegionList's render order. */
  orderedCodes: readonly RegionCode[];
  selectedCode: RegionCode | null;
  onSelect: (code: RegionCode | null) => void;
  /** Re-flies the camera to the ALREADY-selected region (useCamera's `reselect`) — called on Enter when selectedCode is already set, the same "reselect" case DeckMap's canvas-click handler uses. */
  reselect: () => void;
  /** Task 4B — a highlighted school (map point / RegionPanel row), or null. A first Escape clears this before a second one deselects the region. */
  highlightedSchoolId: string | null;
  onHighlightSchool: (id: string | null) => void;
}

export interface UseRegionKeyboardNavResult {
  handleWrapperKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

export function useRegionKeyboardNav(
  opts: UseRegionKeyboardNavOptions,
): UseRegionKeyboardNavResult {
  const {
    disabled = false,
    orderedCodes,
    selectedCode,
    onSelect,
    reselect,
    highlightedSchoolId,
    onHighlightSchool,
  } = opts;

  // Keyboard path on the map wrapper (tabIndex=0): ←/→ cycle through
  // `orderedCodes` and commit immediately (selection IS the URL — no
  // separate "focused but not selected" state to keep in sync with it).
  // Enter with nothing selected picks rank 1; Enter on the already-selected
  // region re-flies (same "reselect" case as a canvas re-click). No
  // "Escape" case here — deselecting on Escape is owned entirely by the
  // document-level listener below, which (unlike this handler) still fires
  // when a mouse-driven selection has left focus off the wrapper.
  const handleWrapperKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      // The compass/전체보기 widget buttons deck.gl renders are DOM
      // descendants of this same wrapper div, so a keydown ON one of them
      // (e.g. Tab to "전체보기", press Enter to activate it) still bubbles
      // up to this handler. Without this guard, our own "Enter" case below
      // would preventDefault() and hijack that native button activation —
      // only handle keys that land on the wrapper itself, not on a focused
      // descendant.
      if (disabled || event.target !== event.currentTarget) return;
      switch (event.key) {
        case "ArrowRight": {
          event.preventDefault();
          const next = nextRegion(orderedCodes, selectedCode, 1);
          if (next) onSelect(next);
          break;
        }
        case "ArrowLeft": {
          event.preventDefault();
          const prev = nextRegion(orderedCodes, selectedCode, -1);
          if (prev) onSelect(prev);
          break;
        }
        case "Enter": {
          event.preventDefault();
          if (selectedCode === null) {
            const first = nextRegion(orderedCodes, null, 1);
            if (first) onSelect(first);
          } else {
            // Same "reselect" case as a canvas re-click.
            reselect();
          }
          break;
        }
        default:
          break;
      }
    },
    [disabled, orderedCodes, selectedCode, onSelect, reselect],
  );

  // Escape-to-deselect via a document-level listener: a MOUSE-driven
  // selection leaves focus off the wrapper — a RegionList click's clicked
  // <button> unmounts once the panel swaps to RegionPanel (focus reverts to
  // <body>), and a canvas click never moves focus onto the wrapper div
  // either (mjolnir.js doesn't request it) — so a keydown in either case
  // never reaches handleWrapperKeyDown above at all (React's delegated
  // listener only fires for events whose target is the wrapper itself or
  // one of ITS descendants; <body> is an ANCESTOR of the wrapper, not a
  // descendant, so the event bubbles straight past it to document without
  // ever visiting the wrapper). Listening on `document` catches Escape
  // regardless of focus.
  //
  // Deliberately BUBBLE phase, not capture: IndicatorMenu registers its own
  // Escape handler on `document` in the CAPTURE phase and calls
  // preventDefault() when it closes the menu (see IndicatorMenu.tsx). Every
  // capture-phase listener on a node runs before ANY bubble-phase listener
  // on that SAME node, for every event dispatch — a DOM invariant, true
  // regardless of which effect happened to attach first. That's what makes
  // the `defaultPrevented` check below reliable even though registration
  // order between these two components' effects is otherwise
  // nondeterministic. Net effect: a single Escape with the indicator menu
  // open closes only the menu, never both.
  //
  // Also ignores a target inside a text-editing control (typing Escape in
  // an <input>/<textarea>/contenteditable — e.g. IndicatorMenu's own radio
  // inputs while focused — must never deselect the map behind it), and is
  // only attached while something is actually selected (nothing to
  // deselect otherwise).
  //
  // Task 4B: a highlighted school (highlightedSchoolId) clears FIRST — a
  // second Escape (now nothing highlighted) deselects the region, same as
  // before 4B. highlightedSchoolId can only be non-null while a region is
  // already selected (Dashboard resets it whenever regionCode changes), so
  // the effect's existing `!selectedCode` guard already covers this case
  // too — no separate attach condition needed.
  useEffect(() => {
    if (disabled || (!selectedCode && !highlightedSchoolId)) return;
    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (highlightedSchoolId !== null) {
        onHighlightSchool(null);
      } else {
        onSelect(null);
      }
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [
    disabled,
    selectedCode,
    onSelect,
    highlightedSchoolId,
    onHighlightSchool,
  ]);

  return { handleWrapperKeyDown };
}
