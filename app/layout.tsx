import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "Workout Tracker",
    description:
      "A private, offline-first workout tracker for iPhone. Plan routines, log sets, and see your progress.",
    applicationName: "Workout Tracker",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Workout Tracker",
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      icon: [
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    openGraph: {
      title: "Workout Tracker",
      description:
        "Train. Track. Progress. Your private workout log for iPhone.",
      type: "website",
      url: "/",
      images: [{ url: "/og.png", width: 1731, height: 909 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Workout Tracker",
      description:
        "Train. Track. Progress. Your private workout log for iPhone.",
      images: ["/og.png"],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
