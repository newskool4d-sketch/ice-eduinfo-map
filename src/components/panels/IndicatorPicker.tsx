"use client";

import { INDICATORS } from "@/lib/indicators/registry";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/indicators/groups";

export interface IndicatorPickerProps {
  value: string;
  onChange: (id: string) => void;
}

// One shared `name` across every group's radios (not per-fieldset): native
// HTML radio grouping is by `name`, not by `<fieldset>` boundary, so this is
// what keeps "only one indicator selected at a time" true across all 4
// visually-separate groups.
const RADIO_GROUP_NAME = "indicator";

/** Top-bar indicator selector: 4 grouped, keyboard-accessible radio sets (one radio per registered indicator). */
export default function IndicatorPicker({ value, onChange }: IndicatorPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {GROUP_ORDER.map((group) => {
        const items = INDICATORS.filter((d) => d.group === group);
        if (items.length === 0) return null;
        return (
          <fieldset key={group} className="m-0 flex items-center gap-2 border-0 p-0">
            <legend className="mr-1 text-[11px] uppercase tracking-wide text-[#e6e9f0]/60">
              {GROUP_LABELS[group]}
            </legend>
            {items.map((def) => {
              const checked = value === def.id;
              const descriptionId = `indicator-description-${def.id}`;
              return (
                // Task 5, Section C — def.description renders small, just
                // below the radio+label (Korean "옆에": visually adjacent,
                // not literally same-line, given how many chips already
                // wrap here). It's a SIBLING of the <label>, not nested
                // inside it: text content inside a <label> becomes part of
                // its wrapped <input>'s accessible NAME (confirmed against
                // this file's own precedent below — combining id/htmlFor
                // duplicates the name the same way), which would silently
                // break every `getByRole("radio", { name: def.label })`
                // query in IndicatorPicker.test.tsx/IndicatorMenu.test.tsx.
                // `aria-describedby` links it as the accessible DESCRIPTION
                // instead, leaving the NAME exactly `def.label`.
                <div key={def.id} className="flex flex-col">
                  <label
                    className={`cursor-pointer rounded px-2 py-1 text-xs transition-colors ${
                      checked ? "bg-white/15 text-[#e6e9f0]" : "text-[#e6e9f0]/70 hover:bg-white/5"
                    }`}
                  >
                    <input
                      type="radio"
                      name={RADIO_GROUP_NAME}
                      value={def.id}
                      checked={checked}
                      onChange={() => onChange(def.id)}
                      aria-describedby={descriptionId}
                      className="mr-1 align-middle"
                    />
                    {def.label}
                  </label>
                  <span id={descriptionId} className="max-w-[220px] pl-2 text-[10px] leading-snug text-[#e6e9f0]/45">
                    {def.description}
                  </span>
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
