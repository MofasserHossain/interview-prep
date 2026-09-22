import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentSection } from "@/components/content/document-section";
import { DocPagination } from "@/components/doc-pagination";
import { DocsWorkspace } from "@/components/docs-workspace";
import { SiteFooter } from "@/components/site-footer";
import { findTopic, getTopicLastModified, getTopicSections, getTopicSummary } from "@/lib/content";
import { siteName, siteUrl } from "@/lib/site";
import { topics } from "@/lib/topics";
import { groupTopicsByTrack } from "@/lib/tracks";

type TopicPageProps = {
  params: Promise<{
    topicSlug: string;
  }>;
};

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return topics.map((topic) => ({
    topicSlug: topic.slug,
  }));
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { topicSlug } = await params;
  const topic = findTopic(topicSlug);

  if (!topic) {
    return {};
  }

  const path = `/topics/${topic.slug}`;

  return {
    title: topic.subtopicTitle,
    description: topic.description,
    keywords: [topic.trackTitle, topic.title, `${topic.trackTitle} interview questions`],
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "article",
      url: path,
      siteName,
      title: `${topic.subtopicTitle} — ${topic.trackTitle}`,
      description: topic.description,
      modifiedTime: getTopicLastModified(topic.file).toISOString(),
    },
    twitter: {
      card: "summary_large_image",
      title: `${topic.subtopicTitle} — ${topic.trackTitle}`,
      description: topic.description,
    },
  };
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { topicSlug } = await params;
  const topic = findTopic(topicSlug);

  if (!topic) {
    notFound();
  }

  const sections = getTopicSections(topic);
  const { readingMinutes } = getTopicSummary(topic);
  const orderedTopics = groupTopicsByTrack(topics).flatMap((track) => track.topics);
  const topicIndex = orderedTopics.findIndex((item) => item.slug === topic.slug);
  const url = `${siteUrl}/topics/${topic.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": `${url}#article`,
        headline: `${topic.subtopicTitle} — ${topic.trackTitle} Interview Questions`,
        description: topic.description,
        url,
        inLanguage: "en",
        dateModified: getTopicLastModified(topic.file).toISOString(),
        wordCount: readingMinutes * 180,
        articleSection: topic.trackTitle,
        keywords: [topic.trackTitle, topic.title].join(", "),
        isPartOf: { "@type": "WebSite", name: siteName, url: siteUrl },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Docs", item: siteUrl },
          { "@type": "ListItem", position: 2, name: topic.trackTitle },
          { "@type": "ListItem", position: 3, name: topic.subtopicTitle, item: url },
        ],
      },
    ],
  };

  return (
    <>
      <DocsWorkspace
        article={{
          description: topic.description,
          pagination: (
            <DocPagination
              nextTopic={orderedTopics[topicIndex + 1]}
              previousTopic={topicIndex > 0 ? orderedTopics[topicIndex - 1] : undefined}
            />
          ),
          sections: sections.map((section) => ({
            content: <DocumentSection section={section} />,
            entry: { id: section.id, kind: section.kind, question: section.question },
          })),
          title: topic.subtopicTitle,
          topicSlug: topic.slug,
        }}
        footer={<SiteFooter />}
        headerPath={["Docs", topic.trackTitle, topic.subtopicTitle]}
        key={topic.slug}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
