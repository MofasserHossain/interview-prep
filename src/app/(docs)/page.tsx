import { notFound } from "next/navigation";
import { DocsWorkspace } from "@/components/docs-workspace";
import { SiteFooter } from "@/components/site-footer";
import { TopicOverview } from "@/components/topic-overview";
import { getAllSections, getTopicSummaries } from "@/lib/content";
import { buildTrackSummaries } from "@/lib/tracks";

export const dynamic = "force-static";

export default function Home() {
  if (!getAllSections().length) {
    notFound();
  }

  return (
    <DocsWorkspace
      footer={<SiteFooter />}
      headerPath={["Docs"]}
      overview={<TopicOverview tracks={buildTrackSummaries(getTopicSummaries())} />}
    />
  );
}
