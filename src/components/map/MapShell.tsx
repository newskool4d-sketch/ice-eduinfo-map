"use client";

import dynamic from "next/dynamic";

import type { DeckMapProps } from "./DeckMap";

// `dynamic(..., { ssr: false })` is only allowed inside a 'use client' file,
// which is why the deck.gl-importing DeckMap is loaded from here rather
// than from a server component.
const DeckMap = dynamic<DeckMapProps>(() => import("./DeckMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0b0f19] text-sm text-[#e6e9f0]/50">
      지도 준비 중
    </div>
  ),
});

export default function MapShell({ indicatorId }: DeckMapProps) {
  return <DeckMap indicatorId={indicatorId} />;
}
