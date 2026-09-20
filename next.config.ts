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
};

export default nextConfig;
