import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NAAMII PMIS", template: "%s · NAAMII PMIS" },
  description: "NAAMII Project Management Information System — role-based project portfolio and financial dashboard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
