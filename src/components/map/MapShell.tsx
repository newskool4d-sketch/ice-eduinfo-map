"use client";

import dynamic from "next/dynamic";

// `dynamic(..., { ssr: false })` is only allowed inside a 'use client' file,
// which is why the deck.gl-importing DeckMap is loaded from here rather
// than from a server component.
const DeckMap = dynamic(() => import("./DeckMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0b0f19] text-sm text-[#e6e9f0]/50">
      지도 준비 중
    </div>
  ),
});

export default function MapShell() {
  return <DeckMap />;
}
