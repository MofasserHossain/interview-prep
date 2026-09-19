import type { MetadataRoute } from "next";
import { getInterviewData, getTopicLastModified } from "@/lib/content";
import { siteUrl } from "@/lib/site";

/** Served at /sitemap.xml. */
export default function sitemap(): MetadataRoute.Sitemap {
  const { topics } = getInterviewData();

  const newestTopic = topics
    .map((topic) => getTopicLastModified(topic.file))
    .reduce((newest, current) => (current > newest ? current : newest), new Date(0));

  return [
    {
      url: siteUrl,
      lastModified: newestTopic,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...topics.map((topic) => ({
      url: `${siteUrl}/topics/${topic.slug}`,
      lastModified: getTopicLastModified(topic.file),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
