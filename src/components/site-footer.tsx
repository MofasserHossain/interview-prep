import { Globe } from "lucide-react";
import { author, brandMarkPaths, repoUrl, siteName } from "@/lib/site";

type ProfileLink = {
  href: string;
  label: string;
  mark?: string;
};

/**
 * Profile links, ordered from the canonical site outwards. `mark` carries a
 * brand path for the icons lucide does not ship; the rest use a lucide icon.
 */
const profiles: ProfileLink[] = [
  { href: author.website, label: "Website" },
  { href: author.github, label: "GitHub", mark: brandMarkPaths.github },
  { href: author.linkedin, label: "LinkedIn", mark: brandMarkPaths.linkedin },
];

/**
 * The footer closing every document. It lives at the end of the scrolling
 * workspace rather than in the root layout, because `.app-shell` is a fixed
 * `100vh` grid: a sibling of the shell would sit below the viewport on desktop
 * and need a second window scroll to reach.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-credit">
          <p className="site-footer-byline">
            Built by{" "}
            <a href={author.website} rel="noopener noreferrer" target="_blank">
              {author.name}
            </a>
          </p>
          <nav className="site-footer-project" aria-label="Project links">
            <span>{siteName}</span>
            <a href={repoUrl} rel="noopener noreferrer" target="_blank">
              Source
            </a>
            <a href={`${repoUrl}/graphs/contributors`} rel="noopener noreferrer" target="_blank">
              Contributors
            </a>
          </nav>
        </div>

        <nav className="site-footer-profiles" aria-label="Author profiles">
          {profiles.map((profile) => (
            <a
              aria-label={profile.label}
              href={profile.href}
              key={profile.label}
              rel="noopener noreferrer"
              target="_blank"
              title={profile.label}
            >
              {profile.mark ? (
                <svg
                  aria-hidden="true"
                  fill="currentColor"
                  height={16}
                  viewBox="0 0 24 24"
                  width={16}
                >
                  <path d={profile.mark} />
                </svg>
              ) : (
                <Globe size={16} />
              )}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
