import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ACTIVE_PROFILE } from "@/lib/profiles";
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

/**
 * Incheon: apply the stored colour and text size to <html> before the first paint,
 * so a dark or large-text visitor never sees the light/normal page first. The
 * dashboard renders client-side; DesignProvider keeps these attributes in sync later.
 * Keys and values mirror DesignProvider.
 */
const INCHEON_DISPLAY_SCRIPT = `try{var d=document.documentElement,c=localStorage.getItem("ice-map-color-v1");if(c==="system")c=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(c==="dark")d.setAttribute("data-ice-color","dark");if(localStorage.getItem("ice-map-text-v1")==="large")d.setAttribute("data-ice-text","large")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The pre-paint script adds attributes the server did not render.
    <html lang="ko" suppressHydrationWarning={ACTIVE_PROFILE.id === "incheon"}>
      {ACTIVE_PROFILE.id === "incheon" && <head><script dangerouslySetInnerHTML={{ __html: INCHEON_DISPLAY_SCRIPT }} /></head>}
      <body className={notoSansKr.variable}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
