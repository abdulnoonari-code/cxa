import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * How big a form submission may be.
       *
       * ── Why this line exists ────────────────────────────────────────
       *
       * Next.js caps a Server Action request at ONE MEGABYTE by default.
       * Every form in this application that carries a photograph is a
       * Server Action, and every photograph off a phone camera is three to
       * ten megabytes. So the request was discarded by the framework before
       * a single line of application code ran: no punch item, no photograph,
       * no audit entry, no message — an error page with nothing on it, and
       * a person on site who has no idea their defect was not recorded.
       *
       * That is the worst shape a failure can take in this application, and
       * it had been there since the first photograph upload was written.
       *
       * ── Why 4 MB and not more ───────────────────────────────────────
       *
       * Because more would be a lie. The platform this deploys to refuses
       * any request body over roughly 4.5 MB whatever Next is told to
       * allow, so a number above that would move the failure from one layer
       * to another rather than removing it. 4 MB leaves room for the
       * multipart boundaries and the rest of the form.
       *
       * This is the SAFETY NET, not the fix. The fix is that the browser
       * shrinks the photograph before it is sent — see
       * components/PhotoInput.tsx — which turns an 8 MB camera shot into
       * about 320 KB and uploads in a second on site mobile data instead of
       * the best part of a minute. This limit catches what that cannot: a
       * HEIC, or a browser that will not let a script replace the file.
       */
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
