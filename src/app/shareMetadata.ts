import type { Metadata } from "next";
import { ACTIVE_PROFILE } from "@/lib/profiles";

/**
 * Share/SEO metadata shared by app/layout.tsx and app/about/page.tsx. Next.js
 * replaces nested `alternates`/`openGraph`/`twitter` objects wholesale per
 * segment (no deep merge), so a page that only wants its own canonical/og:url
 * must restate the whole object — this builder keeps title/image/locale in
 * one place (code review 2026-11-07 2차 #8).
 */
const isIncheon = ACTIVE_PROFILE.id === "incheon";
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  || (isIncheon ? "https://ice-eduinfo-map.vercel.app" : "https://jb-edu-map.vercel.app");
export const siteTitle = isIncheon ? "인천 교육지도" : `${ACTIVE_PROFILE.province.shortName}교육지도`;
export const shareTitle = isIncheon ? `${siteTitle} | 학교·교육통계 한눈에` : siteTitle;
export const siteDescription = isIncheon
  ? "인천의 학교 위치와 학생·학급·교원 현황을 지도에서 살펴보세요. 군·구와 학교별 교육통계, 2022~2026년 변화를 비교하는 비공식 교육정보 지도입니다."
  : `${ACTIVE_PROFILE.province.shortName}의 학교와 교육 현황을 지도에서 살펴보세요. 시군별 통계와 교육문제를 함께 비교할 수 있습니다.`;
const socialImage = isIncheon
  ? { url: "/social-preview-incheon.png", width: 1200, height: 630 }
  : { url: "/social-preview.png", width: 1200, height: 630 };
const socialImageAlt = isIncheon
  ? "인천 교육지도 — 학교 위치, 교육통계, 2022~2026년 추세와 인천 군·구 지도"
  : `${siteTitle} 공유 미리보기`;

/** Canonical + Open Graph + Twitter card for one route (`path` is site-relative, resolved against metadataBase). */
export function shareMetadata(path: string, title: string, description: string): Pick<Metadata, "alternates" | "openGraph" | "twitter"> {
  return {
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      url: path,
      siteName: siteTitle,
      title,
      description,
      images: [{ ...socialImage, type: "image/png", alt: socialImageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: socialImage.url, alt: socialImageAlt }],
    },
  };
}
