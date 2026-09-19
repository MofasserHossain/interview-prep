import { ImageResponse } from "next/og";
import { getInterviewData } from "@/lib/content";
import { brand, logoPaths, logoStroke, siteName } from "@/lib/site";

const size = { width: 1200, height: 630 };
const contentType = "image/png";

export function generateStaticParams() {
  return getInterviewData().topics.map((topic) => ({ topicSlug: topic.slug }));
}

/**
 * Supplies a per-topic `og:image:alt`, which a module-level `alt` export cannot
 * do because it has no access to the route params.
 */
export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ topicSlug: string }> | { topicSlug: string };
}) {
  const { topicSlug } = await params;
  const topic = getInterviewData().topics.find((item) => item.slug === topicSlug);

  return [
    {
      id: "og",
      size,
      contentType,
      alt: topic
        ? `${topic.subtopicTitle} — ${topic.trackTitle} interview questions on ${siteName}`
        : siteName,
    },
  ];
}

export default async function TopicOpengraphImage({
  params,
}: {
  params: Promise<{ topicSlug: string }>;
}) {
  const { topicSlug } = await params;
  const topic = getInterviewData().topics.find((item) => item.slug === topicSlug);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: brand.background,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 60,
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 14,
            background: brand.foreground,
          }}
        >
          <svg width="38" height="38" viewBox="0 0 24 24" stroke={brand.background} {...logoStroke}>
            {logoPaths.map((d) => (
              <path d={d} key={d} />
            ))}
          </svg>
        </div>
        <div style={{ display: "flex", fontSize: 27, color: brand.muted, letterSpacing: -0.3 }}>
          {topic ? topic.trackTitle : siteName}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: brand.foreground,
            letterSpacing: -2.2,
            lineHeight: 1.08,
          }}
        >
          {topic?.subtopicTitle ?? siteName}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: brand.muted,
            lineHeight: 1.4,
            maxWidth: 960,
          }}
        >
          {topic?.description ?? ""}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 25,
          color: brand.muted,
        }}
      >
        <div style={{ display: "flex" }}>{topic?.questionCount ?? 0} questions</div>
        <div style={{ display: "flex" }}>·</div>
        <div style={{ display: "flex" }}>{topic?.readingMinutes ?? 0} min read</div>
        <div style={{ display: "flex" }}>·</div>
        <div style={{ display: "flex" }}>{siteName}</div>
      </div>
    </div>,
    size,
  );
}
