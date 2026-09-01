import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RFx Copilot — Kill the Quote Spreadsheet",
  description: "Draft an RFx, read whatever vendors send back, interrogate the comparison in plain language.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
