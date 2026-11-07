import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Task 0 scaffolds an explicit, minimal file set (see brief item 6).
  // Without this, `next dev`/`next build` regenerate AGENTS.md/CLAUDE.md
  // on every run regardless of create-next-app's --no-agents-md flag.
  agentRules: false,
  // Next 15+/16's dev-mode devtools indicator (the <nextjs-portal> "N"
  // button) defaults to bottom-left, which sits inside this dashboard's
  // footer band and overlaps the Legend text — the exact overlap 추가 요구
  // #4 asked to fix, just from an unrelated Next.js element rather than
  // this app's own compass/전체보기 widgets (which are correctly confined
  // to the canvas — see task-2-report.md §4). Dev-only; absent from
  // `next build && next start` production output either way, so this only
  // affects `next dev` (what `npm run e2e`'s webServer and local dev use).
  devIndicators: false,
  // Task 6, Section D.2 — public/data/**（regions.geojson, indicators/*.json
  // 등）는 npm run data:build 로만 바뀌는 정적 파일이라 브라우저/CDN이 짧게
  // 재검증 없이 쓰고, 그 뒤로는 백그라운드 재검증 중 이전 응답을 써도 되는
  // stale-while-revalidate 로 적당하다 — next start/Vercel 모두 이 헤더를
  // public/ 정적 파일 응답에도 그대로 적용한다.
  // 2026-11-07 코드 리뷰 #7 — 파일명에 해시가 없어 manifest.json(no-cache)만
  // 갱신되고 schools/regions/indicators 는 최대 25시간(1h + SWR 24h) 묵은 짝이
  // 될 수 있었다. 창을 10분 + SWR 1시간으로 줄여 재배포 뒤 불일치 노출 시간을
  // 최대 70분으로 제한한다(근본 해결은 파이프라인의 콘텐츠 해시 파일명).
  async headers() {
    return [
      {
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=600, stale-while-revalidate=3600",
          },
        ],
      },
      // Fix round 2, finding 3 — manifest.json is the one file load.ts
      // hard-throws on when a registry indicator id is missing from it (see
      // its own doc comment). Under the 1h stale-while-revalidate policy
      // above, a returning visitor can get a freshly-deployed JS bundle
      // (referencing new registry ids) paired with a STALE cached
      // manifest.json for up to an hour after a data-refresh deploy,
      // hitting that error needlessly. Both profile entries must stay AFTER
      // the `/data/:path*` wildcard above — Next.js applies matching header
      // sets in array order, and when two entries set the SAME header key
      // for the same request, the LATER entry wins; putting this more
      // specific source first would leave manifest.json silently governed
      // by the wildcard's 1h policy instead.
      {
        source: "/data/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, must-revalidate",
          },
        ],
      },
      {
        source: "/data/incheon/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, must-revalidate",
          },
        ],
      },
      { source: "/data/education-issues.json", headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
