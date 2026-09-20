import type { Metadata } from "next";
import "./globals.css";

import { ThemeProvider } from "./components/ThemeProvider";
import { LanguageProvider } from "./components/LanguageProvider";
import GlobalUI from "./components/GlobalUI";

export const metadata: Metadata = {
  title: "Đường Biên Đêm",
  description: "Đường Biên Đêm",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <LanguageProvider>
            <GlobalUI />

            {children}

            <footer className="border-t border-border bg-background py-4 text-center text-xs text-muted">
              © 2026 Khoa Hoàng · Đường Biên Đêm
            </footer>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}