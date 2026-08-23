import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InterviewApp } from "@/components/interview-app";
import { getInterviewData } from "@/lib/content";

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

  return {
    title: topic.subtopicTitle,
    description: topic.description,
    openGraph: {
      title: `${topic.subtopicTitle} | Interview Prep Hub`,
      description: topic.description,
      type: "article",
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

  return <InterviewApp activeTopicSlug={topic.slug} initialData={data} />;
}
