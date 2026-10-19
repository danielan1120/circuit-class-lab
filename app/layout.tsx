import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "전류, 전압, 저항의 관계 탐구하기 | 그래프 공유 보드",
  description: "전류·전압, 저항·전류의 관계를 탐구하고 2학년 1반부터 8반까지 각 반의 1조~6조 실험 그래프를 QR코드로 공유해요.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
