import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { MobileMenu } from "@/components/MobileMenu";
import { ThemeToggle } from "@/components/ThemeToggle";

export const THEME_COOKIE = "frp_theme";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://foodrecipes.page";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "foodrecipes.page — AI recipes from what's in your fridge",
    template: "%s | foodrecipes.page",
  },
  description:
    "Type the ingredients you have, pick a cuisine, get a full recipe in seconds. Free, fast, powered by open AI models.",
  openGraph: {
    title: "foodrecipes.page",
    description: "AI recipes from what's in your fridge. Free forever.",
    url: SITE_URL,
    siteName: "foodrecipes.page",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { readonly children: React.ReactNode }) {
  // Dark is the primary/default theme. Cookie can override to 'light'.
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme: "dark" | "light" = themeCookie === "dark" ? "dark" : "light";
  return (
    <html lang="en" className={theme === "dark" ? "dark" : undefined} data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased overflow-x-hidden">
        <header className="sticky top-0 z-40">
          <div className="mx-auto max-w-5xl px-4 py-2.5">
            <div className="flex items-center justify-between rounded-2xl bg-white/80 backdrop-blur-md border border-brand-100 px-4 py-2 shadow-clay-sm">
              <a href="/" className="flex items-center gap-2 group">
                <span className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-clay text-white text-base font-black group-hover:scale-105 transition">
                  <span className="animate-wiggle inline-block">🍳</span>
                </span>
                <span className="font-display text-lg font-bold text-ink-700 leading-none">
                  foodrecipes<span className="text-brand-500">.page</span>
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-herb-100 text-herb-700 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 ml-1 shadow-clay-sm">
                  <span className="inline-block w-1 h-1 rounded-full bg-herb-500 animate-pulse" />
                  AI
                </span>
              </a>
              <nav className="hidden md:flex text-xs font-semibold text-ink-600 gap-0.5 items-center">
                <a href="/recipes" className="px-2.5 py-1 rounded-lg hover:bg-brand-50 hover:text-brand-600 transition">Browse</a>
                <a href="/about" className="px-2.5 py-1 rounded-lg hover:bg-brand-50 hover:text-brand-600 transition">About</a>
                <span className="ml-1"><ThemeToggle /></span>
              </nav>
              <div className="md:hidden flex items-center gap-1.5">
                <ThemeToggle />
                <MobileMenu />
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-3">{children}</main>
        <footer className="mt-20 pb-10">
          <div className="mx-auto max-w-5xl px-4">
            <div className="rounded-3xl bg-white/70 backdrop-blur border border-brand-100 px-6 py-8 text-center shadow-clay-sm">
              <div className="font-display text-xl text-brand-600">Cooked with ❤️ for the open web.</div>
              <p className="mt-2 text-sm text-ink-600/70">Free forever · Open recipe cache · No tracking</p>
              <p className="mt-3 text-sm flex justify-center gap-4">
                <a href="/privacy" className="text-ink-600 hover:text-brand-600 font-semibold">Privacy</a>
                <span className="text-brand-200">·</span>
                <a href="/about" className="text-ink-600 hover:text-brand-600 font-semibold">About</a>
                <span className="text-brand-200">·</span>
                <a href="/recipes" className="text-ink-600 hover:text-brand-600 font-semibold">Browse</a>
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
