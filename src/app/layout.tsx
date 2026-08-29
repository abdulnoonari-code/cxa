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
// screens stay clean and full-width. Everything else — equipment, checklists,
// tests, issues, documents, plan, milestones — renders inside the sidebar
// shell, which is why no individual page has to draw its own navigation.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
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
