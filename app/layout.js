import "./globals.css";

export const metadata = {
  title: "Vanta",
  description: "Minimal AI workspace powered by ShuttleAI.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
