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
  // 등）는 npm run data:build 로만 바뀌는 정적 파일이라 브라우저/CDN이 1시간
  // 동안은 재검증 없이 쓰고, 그 뒤로도 24시간까지는 백그라운드 재검증 중 이전
  // 응답을 계속 써도 되는 stale-while-revalidate 로 적당하다 — next start/
  // Vercel 모두 이 헤더를 public/ 정적 파일 응답에도 그대로 적용한다.
  async headers() {
    return [
      {
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
