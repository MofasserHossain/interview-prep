import { DocsSearchProvider } from "@/components/docs-search";
import { TopicSidebar } from "@/components/topic-sidebar";
import { topics } from "@/lib/topics";
import { groupTopicsByTrack } from "@/lib/tracks";

/**
 * The docs shell. The sidebar renders here, once: the client router keeps this
 * layout across navigations, so each page and prefetch carries only its own
 * document instead of repeating the topic list.
 */
export default function DocsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="app-shell">
      <DocsSearchProvider>
        <TopicSidebar tracks={groupTopicsByTrack(topics)} />
        {children}
      </DocsSearchProvider>
    </main>
  );
}
