import { findTopic, getTopicSections } from "@/lib/content";
import { topics } from "@/lib/topics";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return topics.map((topic) => ({ topicSlug: topic.slug }));
}

/** One topic's sections, for search within its page. Prerendered at build time. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ topicSlug: string }> },
) {
  const { topicSlug } = await params;
  const topic = findTopic(topicSlug);

  if (!topic) {
    return new Response(null, { status: 404 });
  }

  return Response.json(getTopicSections(topic));
}
