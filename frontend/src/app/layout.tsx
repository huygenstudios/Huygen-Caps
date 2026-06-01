import type { Metadata } from "next";
import "./globals.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "@fontsource/poppins/900.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/900.css";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/900.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/700.css";
import "@fontsource/oswald/700.css";
import "@fontsource/anton/400.css";
import "@fontsource/bebas-neue/400.css";

export const metadata: Metadata = {
  title: "Huygen Caps",
  description: "AI caption editor for creators",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/brand/huygen-icon-512.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
