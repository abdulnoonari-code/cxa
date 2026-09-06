import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Chrome } from "@/components/Chrome";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "CxSentinel — AI Commissioning Copilot",
  description:
    "AI-assisted commissioning copilot for data centers, substations, and power plants — checklists, documents, and issue tracking in one place.",
};

// The sidebar appears once you're logged in AND you have a project open, so
// the login screen and the project list stay clean and full-width. Everything
// else renders inside the sidebar shell, which is why no individual page draws
// its own navigation. Which screens are bare is decided in components/Chrome —
// a layout cannot know the path, and route groups would have meant moving
// thirty folders to answer a question one line answers.
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
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        {user ? <Chrome sidebar={<Sidebar />}>{children}</Chrome> : children}
      </body>
    </html>
  );
}
