import type { Metadata } from "next";
import { Archivo, Bagel_Fat_One } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import { Wordmark } from "@/components/Wordmark";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "800"],
  variable: "--font-archivo",
});

const bagel = Bagel_Fat_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bagel",
});

export const metadata: Metadata = {
  title: "Monke — Colors",
  description: "Monke is a Colors betting game. Warm paper, grain, pastel ghosts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${bagel.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppProviders>
          <div className="shell">
            <header className="topbar">
              <div className="brand-cluster">
                <a href="/" aria-label="Monke">
                  <Wordmark size="nav" />
                </a>
                <p className="chip">Colors</p>
              </div>
              <nav className="site-nav" aria-label="Primary">
                <a href="/">Play</a>
                <a href="#treasury">Treasury</a>
                <a href="#fairness">Fairness</a>
              </nav>
            </header>
            {children}
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
