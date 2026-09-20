import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import Footer from "@/components/panels/Footer";
import type { Manifest } from "@/lib/indicators/types";

function manifestFixture(overrides: Partial<Manifest> = {}): Manifest {
  return {
    latestYear: 2026,
    indicators: {},
    builtAt: "2026-01-01T00:00:00.000Z",
    sources: [
      { name: "KESS 테스트 출처", url: "https://example.com/kess", referenceDate: "2026-04-01" },
      { name: "학교 위치 테스트 출처", url: "https://example.com/location", referenceDate: "2026-03-20" },
      { name: "경계 테스트 출처", url: "https://example.com/boundary", referenceDate: "2026-07-01" },
      {
        name: "폐교재산 테스트 출처",
        url: "https://example.com/closed-schools",
        referenceDate: "2026-07-16",
        publishedAt: "2026-07-20",
      },
    ],
    ...overrides,
  };
}

describe("Footer", () => {
  it("renders every manifest source's name as a link to its url", () => {
    render(<Footer manifest={manifestFixture()} />);
    for (const source of manifestFixture().sources) {
      const link = screen.getByRole("link", { name: source.name });
      expect(link).toHaveAttribute("href", source.url);
    }
  });

  it("renders each source's 기준일 (referenceDate)", () => {
    render(<Footer manifest={manifestFixture()} />);
    expect(screen.getByText(/기준일 2026-04-01/)).toBeInTheDocument();
    expect(screen.getByText(/기준일 2026-03-20/)).toBeInTheDocument();
    expect(screen.getByText(/기준일 2026-07-01/)).toBeInTheDocument();
    expect(screen.getByText(/기준일 2026-07-16/)).toBeInTheDocument();
  });

  it("renders a source's 게시일 (publishedAt) in parentheses only when it's set", () => {
    render(<Footer manifest={manifestFixture()} />);
    expect(screen.getByText(/\(게시 2026-07-20\)/)).toBeInTheDocument();
    // Only the 폐교재산 source in the fixture has a publishedAt — exactly one match.
    expect(screen.getAllByText(/게시/)).toHaveLength(1);
  });

  // Fix round 2, finding 10 — JSX collapses the whitespace-only line break
  // between `{source.referenceDate}` and the conditional `(게시 …)` fragment,
  // so the two used to render with no space between them at all (e.g.
  // "기준일 2026-07-16(게시 2026-07-20)").
  it("keeps a space between 기준일 and the (게시 …) suffix", () => {
    render(<Footer manifest={manifestFixture()} />);
    const source = screen.getByText(/\(게시 2026-07-20\)/);
    expect(source.textContent).toContain("2026-07-16 (게시 2026-07-20)");
  });

  it("renders nothing from a hardcoded date — every date on screen traces back to a manifest.sources entry", () => {
    const manifest = manifestFixture();
    render(<Footer manifest={manifest} />);
    const dateTexts = screen.getAllByText(/기준일 \d{4}-\d{2}-\d{2}/).map((el) => el.textContent);
    expect(dateTexts).toHaveLength(manifest.sources.length);
  });

  it("states the 학교수 정의 caveat", () => {
    render(<Footer manifest={manifestFixture()} />);
    expect(screen.getByTestId("footer-school-count-definition")).toHaveTextContent(
      "학교수 정의: 초·중·고·특수 본교, 폐교 제외(분교장 제외)",
    );
  });

  it("states the 소규모학교 기준 caveat", () => {
    render(<Footer manifest={manifestFixture()} />);
    expect(screen.getByTestId("footer-small-school-definition")).toHaveTextContent("60명");
  });

  it("renders no sources gracefully when manifest.sources is empty", () => {
    render(<Footer manifest={manifestFixture({ sources: [] })} />);
    expect(screen.queryAllByTestId("footer-source")).toHaveLength(0);
    // The two static caveats still render regardless.
    expect(screen.getByTestId("footer-school-count-definition")).toBeInTheDocument();
  });
});
