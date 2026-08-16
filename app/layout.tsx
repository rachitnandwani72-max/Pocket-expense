import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1020" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get("x-forwarded-host") ?? incomingHeaders.get("host") ?? "localhost:3000";
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const ogImage = `${protocol}://${host}/og-midnight.png`;

  return {
    title: "Pocket — Personal Expense Tracker",
    description: "A clear personal expense dashboard with monthly plans, category insights, reports, and offline access.",
    applicationName: "Pocket",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Pocket",
    },
    formatDetection: { telephone: false },
    icons: {
      icon: [
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      shortcut: "/favicon-32.png",
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      title: "Pocket",
      description: "Personal expenses, made clear. Track monthly spending, savings, categories, and reports.",
      images: [{ url: ogImage, width: 1728, height: 910, alt: "Pocket expense tracker in a midnight blue theme with a weekly trend graph" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Pocket",
      description: "Personal expenses, made clear. Track monthly spending, savings, categories, and reports.",
      images: [ogImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('pocket-theme');if(!t)t='dark';document.documentElement.dataset.theme=t}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
