import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "전북교육지도",
  description: "전북 14개 시군의 교육통계를 3D 데이터 지도로 보여주는 대시보드입니다.",
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
