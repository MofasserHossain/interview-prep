import { SidebarPanel, SidebarProvider } from "@/components/sidebar-panel";
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
    <SidebarProvider>
      <main className="app-shell">
        <SidebarPanel>
          <TopicSidebar tracks={groupTopicsByTrack(topics)} />
        </SidebarPanel>
        {children}
      </main>
    </SidebarProvider>
  );
}
