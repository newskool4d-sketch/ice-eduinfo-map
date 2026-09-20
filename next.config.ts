import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Task 0 scaffolds an explicit, minimal file set (see brief item 6).
  // Without this, `next dev`/`next build` regenerate AGENTS.md/CLAUDE.md
  // on every run regardless of create-next-app's --no-agents-md flag.
  agentRules: false,
};

export default nextConfig;
