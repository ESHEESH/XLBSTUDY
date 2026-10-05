import type { Metadata } from "next";
import Motion from "@/components/Motion";
import Nav from "@/components/Nav";
import Sync from "@/components/Sync";
import "./globals.css";

export const metadata: Metadata = { title: "XLBSTUDY", description: "Study smarter" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full pb-20">
        <Motion>{children}</Motion>
        <Nav />
        <Sync />
      </body>
    </html>
  );
}
