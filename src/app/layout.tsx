import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Chrome } from "@/components/Chrome";
import { TopBar } from "@/components/TopBar";
import { createClient } from "@/lib/supabase/server";
import { accessVerdict } from "@/data/gate";
import { mayUseApp, openDoorWarning } from "@/lib/gate";
import NoAccess from "@/components/NoAccess";

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

  // The gate, in the ONE place that runs for every route.
  //
  // Not in proxy.ts, and the reason matters: since SQL part 27 the browser
  // key cannot read the team list at all, and the proxy has only the browser
  // key. A gate there would refuse everybody, including the owner, and look
  // exactly like a broken login. Here the server key is available.
  //
  // Not on each page either. Thirty-odd screens, and the one somebody forgets
  // to add it to is the one that leaks.
  const verdict = user ? await accessVerdict() : null;
  const refused = verdict !== null && !mayUseApp(verdict);
  const openDoor = verdict ? openDoorWarning(verdict) : null;

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
        {refused && verdict ? (
          // No Chrome, no rail, no children. A refused account is not shown a
          // navigation menu of screens it may not open.
          <NoAccess verdict={verdict} />
        ) : user ? (
          <Chrome sidebar={<Sidebar />} topbar={<TopBar />}>
            {openDoor && (
              <div className="alert alert-danger" role="alert">
                <strong>This site is open.</strong> {openDoor}
              </div>
            )}
            {children}
          </Chrome>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
