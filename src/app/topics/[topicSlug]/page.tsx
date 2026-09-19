import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InterviewApp } from "@/components/interview-app";
import { getInterviewData, getTopicLastModified } from "@/lib/content";
import { siteName, siteUrl } from "@/lib/site";

type TopicPageProps = {
  params: Promise<{
    topicSlug: string;
  }>;
};

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  const data = getInterviewData();

  return data.topics.map((topic) => ({
    topicSlug: topic.slug,
  }));
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { topicSlug } = await params;
  const data = getInterviewData();
  const topic = data.topics.find((item) => item.slug === topicSlug);

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
  const data = getInterviewData();
  const topic = data.topics.find((item) => item.slug === topicSlug);

  if (!data.questions.length || !topic) {
    notFound();
  }

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
        wordCount: topic.readingMinutes * 180,
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
      <InterviewApp activeTopicSlug={topic.slug} initialData={data} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
