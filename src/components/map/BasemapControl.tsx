"use client";

import { useId } from "react";
import { BASEMAP_OPTIONS, type BasemapMode } from "./basemapPref";

export default function BasemapControl({ mode, dark, available, onChange }: {
  mode: BasemapMode;
  dark: boolean;
  available: boolean;
  onChange: (mode: BasemapMode) => void;
}) {
  const id = useId();
  return (
    <div className="basemap-control">
      <label htmlFor={id}>배경지도</label>
      <select id={id} value={mode} disabled={!available}
        aria-describedby={`${id}-hint`}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.value as BasemapMode)}>
        {BASEMAP_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <p id={`${id}-hint`}>
        {!available ? "배경지도를 준비 중입니다. 학교·통계는 이용할 수 있습니다."
          : mode === "auto" ? `현재 ${dark ? "다크 · 야간지도" : "라이트 · 백지도"}. 화면 테마와 함께 바뀝니다.`
          : mode === "off" ? "배경을 숨기고 학교와 통계만 봅니다."
          : "직접 선택한 지도는 화면 테마를 바꿔도 유지됩니다."}
      </p>
    </div>
  );
}
