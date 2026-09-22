import { BookOpen } from "lucide-react";
import { SearchResetLink, SidebarTopicLink, SidebarTrack } from "@/components/sidebar-nav";
import { TopicIcon, TrackIcon } from "@/components/topic-icon";
import type { TrackGroup } from "@/lib/tracks";

/**
 * The docs sidebar. It renders once in the docs layout and stays mounted
 * across navigations, so pages and prefetches do not repeat the topic list.
 * Only the track toggles and the active-link highlight run in the browser.
 */
export function TopicSidebar({ tracks }: { tracks: TrackGroup[] }) {
  return (
    <aside className="sidebar">
      <SearchResetLink className="brand-block brand-button" href="/">
        <div className="brand-icon" aria-hidden="true">
          <BookOpen size={20} />
        </div>
        <div>
          <h1>Docs Library</h1>
        </div>
      </SearchResetLink>

      <nav className="topic-menu" aria-label="Topic menu">
        {tracks.map((track) => (
          <SidebarTrack
            header={
              <>
                <TrackIcon slug={track.slug} />
                <span className="track-copy">
                  <strong>{track.title}</strong>
                  <small>{track.topics.length} subtopics</small>
                </span>
              </>
            }
            key={track.slug}
            topicSlugs={track.topics.map((topic) => topic.slug)}
          >
            {track.topics.map((topic) => (
              <SidebarTopicLink key={topic.slug} slug={topic.slug}>
                <TopicIcon slug={topic.slug} />
                <span>{topic.subtopicTitle}</span>
              </SidebarTopicLink>
            ))}
          </SidebarTrack>
        ))}
      </nav>
    </aside>
  );
}
