import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrepKit.AI | The AI Interview Prep Kit",
  description:
    "Turn any job description and company URL into a personalised interview preparation kit with crawled research, question bank, flashcards, and schedule.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased selection:bg-brand-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
