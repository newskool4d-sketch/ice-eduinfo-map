import type { Manifest } from "@/lib/indicators/types";

export interface FooterProps {
  manifest: Manifest;
}

/**
 * Task 5, Section C — the dashboard's full data-source footer: every named
 * source's name/link/기준일(+게시일 when it differs from 기준일), read
 * entirely from `manifest.sources` (build-indicators.ts is the single place
 * that assembles that array — see its "manifest.sources" block) — this
 * component never types a date string itself ("날짜기준 규칙": a hardcoded
 * date here would silently drift from the actual data the very first time
 * any source file is refreshed). Also states two fixed definitional
 * caveats (학교수 정의, 소규모학교 기준) that apply across every KPI on this
 * dashboard, not just one indicator — plain UI copy, not date-derived, so
 * hardcoding their wording here is fine.
 */
export default function Footer({ manifest }: FooterProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-4 py-1.5 text-[10px] text-[#e6e9f0]/50">
      {manifest.sources.map((source) => (
        <span key={source.name} className="flex items-center gap-1" data-testid="footer-source">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-[#e6e9f0]"
          >
            {source.name}
          </a>
          <span>
            기준일 {source.referenceDate}
            {source.publishedAt && <>(게시 {source.publishedAt})</>}
          </span>
        </span>
      ))}
      <span data-testid="footer-school-count-definition">
        학교수 정의: 초·중·고·특수 본교, 폐교 제외(분교장 제외)
      </span>
      <span data-testid="footer-small-school-definition">소규모학교 기준: 학생수 60명 이하</span>
    </div>
  );
}
