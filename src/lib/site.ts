/**
 * The canonical origin, used by `metadataBase`, the sitemap, robots.txt, and
 * every absolute URL in metadata. Resolved in precedence order:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — set this once the site has a custom domain.
 * 2. `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL` — the stable production domain
 *    Vercel provides automatically, so no configuration is needed to deploy.
 * 3. `http://localhost:3000` for local development.
 *
 * `VERCEL_URL` is deliberately not used: it is unique per deployment, so
 * canonical tags and sitemap entries would point at preview URLs and invite
 * duplicate-content indexing.
 *
 * Note that `NEXT_PUBLIC_*` values are inlined at build time, so changing the
 * domain requires a redeploy rather than only an environment change.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;

  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const vercelProductionDomain = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;

  if (vercelProductionDomain) {
    return `https://${vercelProductionDomain}`;
  }

  return "http://localhost:3000";
}

export const siteUrl = resolveSiteUrl();

export const siteName = "Interview Prep Hub";

export const siteDescription =
  "A content-driven interview question bank covering JavaScript, React, Next.js, Node.js, NestJS, databases, system design, and DevOps.";

export const siteKeywords = [
  "interview questions",
  "interview preparation",
  "javascript interview",
  "react interview",
  "next.js interview",
  "node.js interview",
  "nestjs interview",
  "system design interview",
  "sql interview",
  "frontend interview",
  "full stack interview",
];

/** Brand colours, matching the `--primary` and `--background` tokens in globals.css. */
export const brand = {
  background: "#fafafa",
  foreground: "#171717",
  muted: "#737373",
} as const;

/**
 * The app's logo mark, kept identical to the `BookOpen` lucide icon rendered in
 * `.brand-icon`. Shared by the app icon and the Open Graph images; `icon.svg`
 * repeats it because a static SVG cannot import from TypeScript.
 */
export const logoPaths = [
  "M12 5v16",
  "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
] as const;

/** Stroke attributes that keep the mark legible when it is scaled down. */
export const logoStroke = {
  fill: "none",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
