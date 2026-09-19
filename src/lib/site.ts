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

/** The public repository, linked from the footer as the project's source. */
export const repoUrl = "https://github.com/MofasserHossain/interview-prep";

/** The maintainer, credited in the footer. `website` is the canonical profile. */
export const author = {
  name: "Mofasser Hossain",
  website: "https://mofasserhossain.vercel.app/",
  github: "https://github.com/MofasserHossain",
  linkedin: "https://www.linkedin.com/in/mofasser-hossain/",
} as const;

/**
 * Brand marks for the footer's profile links, as 24x24 filled paths. lucide
 * dropped brand icons, so GitHub and LinkedIn cannot come from `lucide-react`
 * the way the rest of the app's icons do.
 */
export const brandMarkPaths = {
  github:
    "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
} as const;

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
