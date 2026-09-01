import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "CxSentinel — AI Commissioning Copilot",
  description:
    "AI-assisted commissioning copilot for data centers, substations, and power plants — checklists, documents, and issue tracking in one place.",
};

// The sidebar only appears once you're logged in, so the login and signup
// screens stay clean and full-width. Everything else renders inside the
// sidebar shell, which is why no individual page draws its own navigation.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Loaded here rather than via next/font so the stylesheet is fetched by
            the browser at runtime. The lint rule below targets the old Pages
            Router; in the App Router this root layout applies to every page. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        {user ? (
          <div className="app-layout">
            <Sidebar />
            <main className="app-shell">
              <div className="app-shell-inner">{children}</div>
            </main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
