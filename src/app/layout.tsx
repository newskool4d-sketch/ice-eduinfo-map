import type { Metadata } from "next";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { Noto_Sans_KR } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://jb-edu-map.vercel.app");
const siteTitle = `${ACTIVE_PROFILE.province.shortName}교육지도`;
const isIncheon = ACTIVE_PROFILE.id === "incheon";
const siteDescription = isIncheon
  ? "인천의 학교와 교육 현황을 지도에서 살펴보세요. 군구·학교급·학교별 통계와 2022~2026년 추세를 비교할 수 있습니다."
  : `${ACTIVE_PROFILE.province.shortName}의 학교와 교육 현황을 지도에서 살펴보세요. 시군별 통계와 교육문제를 함께 비교할 수 있습니다.`;
const socialImage = isIncheon
  ? { url: "/brand/ice-wordmark.jpg", width: 1277, height: 337 }
  : { url: "/social-preview.png", width: 1200, height: 630 };

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: siteTitle,
    title: siteTitle,
    description: siteDescription,
    images: [{ ...socialImage, alt: `${siteTitle} 공유 미리보기` }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [socialImage.url],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={notoSansKr.variable}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
