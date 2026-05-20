import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TravelAssistant",
  description: "A production travel assistant for Vietnam trip planning.",
  icons: {
    icon: "/icon.svg"
  }
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
