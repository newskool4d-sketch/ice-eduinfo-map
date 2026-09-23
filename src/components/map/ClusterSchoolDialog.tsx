"use client";

import { useEffect, useRef } from "react";
import type { SchoolCluster } from "./schoolClusters";

export default function ClusterSchoolDialog({ cluster, onClose, onSelect }: {
  cluster: SchoolCluster;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return (
    <dialog ref={dialogRef} className="ice-cluster-dialog" aria-labelledby="cluster-school-heading"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}>
      <header>
        <div><h2 id="cluster-school-heading">가까운 위치의 학교 {cluster.schools.length}곳</h2><p>학교를 선택하면 상세 정보로 이동합니다.</p></div>
        <button type="button" onClick={onClose} autoFocus>닫기</button>
      </header>
      <ul>
        {cluster.schools.map((school) => <li key={school.id}>
          <button type="button" onClick={() => { onClose(); onSelect(school.id); }}>
            <strong>{school.name}</strong><span>{school.locationSource?.address ?? `${school.branch ? "분교 · " : ""}학생 ${school.students == null ? "자료 없음" : `${school.students.toLocaleString("ko-KR")}명`}`}</span>
          </button>
        </li>)}
      </ul>
    </dialog>
  );
}
