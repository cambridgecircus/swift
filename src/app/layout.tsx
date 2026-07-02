import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GEO x AI Daily Brief | SWIFT",
  description: "SWIFT executive brief for GEO, AI Search, AI visibility, and answer engines.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
