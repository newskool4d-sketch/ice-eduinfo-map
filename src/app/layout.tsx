import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { shareMetadata, shareTitle, siteDescription, siteTitle, siteUrl } from "./shareMetadata";

const notoSansKr = Noto_Sans_KR({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  ...shareMetadata("/", shareTitle, siteDescription),
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
