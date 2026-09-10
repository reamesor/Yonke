import type { Metadata } from "next";
import { Noto_Sans_JP, Silkscreen } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

const ticket = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-silkscreen",
});

const jp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["900"],
  variable: "--font-noto-jp",
});

export const metadata: Metadata = {
  title: "Yonke — Colors",
  description: "Yonke is a Colors betting game. Dark grain, NFT ghosts, same Colors math.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ticket.variable} ${ticket.className} ${jp.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppProviders>
          <div className="shell">
            <div className="grain" aria-hidden />
            <div className="hero-mark" aria-hidden>
              YONKE
            </div>
            <header className="topbar">
              <nav className="site-nav" aria-label="Primary">
                <a href="/">
                  <span className="menu-digit">[01]</span> Play
                </a>
                <a href="#treasury">
                  <span className="menu-digit">[02]</span> Treasury
                </a>
                <a href="#fairness">
                  <span className="menu-digit">[03]</span> Fairness
                </a>
              </nav>
              <a className="nav-cta" href="#play">
                Play
              </a>
            </header>
            <div className="spec-row">
              <span className="spec-jp">ヨンケ</span>
              <span>PN: YNK-0001 DO NOT REMOVE DURING OPERATION</span>
              <span>BATCH: 09/2026-A1 TOL: ±0.02MM</span>
              <span>SN: NFT · COLORS</span>
            </div>
            {children}
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
