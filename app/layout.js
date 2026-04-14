import "./globals.css";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vanta-ai-chat.vercel.app";

export const metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Vanta",
    template: "%s • Vanta",
  },
  description: "Minimal AI workspace with streaming chat, screenshots, files, and browser-saved conversations.",
  applicationName: "Vanta",
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "Vanta",
    description:
      "Minimal AI workspace with streaming chat, screenshots, files, and browser-saved conversations.",
    url: APP_URL,
    siteName: "Vanta",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Vanta AI workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vanta",
    description:
      "Minimal AI workspace with streaming chat, screenshots, files, and browser-saved conversations.",
    images: ["/opengraph-image"],
  },
};

export const viewport = {
  themeColor: "#090410",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
