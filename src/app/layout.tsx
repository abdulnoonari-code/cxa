import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Chrome } from "@/components/Chrome";
import { TopBar } from "@/components/TopBar";
import { createClient } from "@/lib/supabase/server";
import { CXNIVORA } from "@/lib/brand";
import { accessVerdict } from "@/data/gate";
import { mayUseApp, openDoorWarning } from "@/lib/gate";
import NoAccess from "@/components/NoAccess";

export const metadata: Metadata = {
  title: "CxNivora — AI Commissioning Copilot",
  description:
    "AI-assisted commissioning copilot for data centers, substations, and power plants — checklists, documents, and issue tracking in one place.",
  // What an iPhone needs before "Add to Home Screen" gives an icon that opens
  // without the browser bars. Android reads app/manifest.ts for the same
  // thing; Safari has never read the manifest for this and wants its own tags.
  appleWebApp: { capable: true, title: "CxNivora", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-icon.png" },
};

/**
 * `viewport-fit=cover` so the page reaches under the notch, and
 * `maximumScale` deliberately LEFT ALONE.
 *
 * Locking zoom is the standard trick for stopping iOS enlarging a form field
 * on focus, and it is the wrong fix: it also stops somebody pinching to read
 * a serial number off a photograph in bad light, which is a thing that
 * happens on every site visit. The right fix is a 16px font in every input,
 * which is what the phone stylesheet does.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Same source as the manifest. See src/app/manifest.ts for why.
  themeColor: CXNIVORA.colors.anchor,
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

  // ⚠ THIS IS NOT THE DOOR. It is the sign on the door.
  //
  // What this does is draw a refusal instead of drawing the screen, and for
  // the ordinary case — somebody followed a link to a job they are not on —
  // that is exactly right and should stay.
  //
  // What it does NOT do is stop the page running. Route segments are
  // rendered by the router, not by this layout, so swapping {children} for
  // <NoAccess/> changes what is DRAWN and not what is SENT: the page runs,
  // and what it rendered is inlined into the response as flight data. A
  // refused account gets the refusal on screen and the tag list in the body
  // of the same reply. Reproduced against this version of Next on
  // 26 September 2026 — the curl and its output are recorded at the top of
  // src/data/require-page.tsx.
  //
  // Making this redirect() instead does not fix it either. The child has
  // already rendered by then, so the 307 comes back carrying the data.
  //
  // THE DOOR IS requirePage() IN EACH PAGE, requireActor() IN EACH SERVER
  // ACTION AND requireAccess() IN EACH ROUTE HANDLER. The old objection to
  // per-page checks — "thirty-odd screens, and the one somebody forgets is
  // the one that leaks" — is answered by src/checks/access.check.mts, which
  // walks all four classes and fails by name if one is missed.
  //
  // (Still not in proxy.ts, and that reason is unchanged: since SQL part 27
  // the browser key cannot read the team list at all, and the proxy has only
  // the browser key. A gate there would refuse everybody, including the
  // owner, and look exactly like a broken login.)
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
              // no-print: this belongs on the screen, not on paper. Without
              // it, every sheet of QR labels comes out of the printer with a
              // red "this site is open" banner across the top of it.
              <div className="alert alert-danger no-print" role="alert">
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
