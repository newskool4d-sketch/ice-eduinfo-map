"use client";

import DeckGL from "@deck.gl/react";

const INITIAL_VIEW_STATE = {
  longitude: 127.14,
  latitude: 35.72,
  zoom: 8.6,
  pitch: 50,
  bearing: -15,
};

// No layers or data yet — this task only wires up an empty deck.gl canvas
// rendered over the dashboard's dark background. Layers/data land in a
// later task.
export default function DeckMap() {
  return (
    <div className="relative h-full w-full bg-[#0b0f19]">
      <DeckGL initialViewState={INITIAL_VIEW_STATE} controller layers={[]} />
    </div>
  );
}
