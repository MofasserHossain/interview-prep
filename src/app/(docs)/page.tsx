import { notFound } from "next/navigation";
import { DocsWorkspace } from "@/components/docs-workspace";
import { TopicOverview } from "@/components/topic-overview";
import { getAllSections, getTopicSummaries } from "@/lib/content";
import { buildTrackSummaries } from "@/lib/tracks";

export const dynamic = "force-static";

export default function Home() {
  if (!getAllSections().length) {
    notFound();
  }

  return (
    <DocsWorkspace headerPath={["Docs"]}>
      <TopicOverview tracks={buildTrackSummaries(getTopicSummaries())} />
    </DocsWorkspace>
  );
}
