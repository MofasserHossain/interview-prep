import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Topic } from "@/lib/types";

export function DocPagination({
  nextTopic,
  previousTopic,
}: {
  nextTopic?: Topic;
  previousTopic?: Topic;
}) {
  return (
    <nav className="doc-pagination" aria-label="Previous and next documents">
      {previousTopic ? (
        <Link href={`/topics/${previousTopic.slug}`}>
          <ArrowLeft size={17} />
          <div>
            <span>Previous</span>
            <strong>{previousTopic.subtopicTitle}</strong>
          </div>
        </Link>
      ) : (
        <span />
      )}

      {nextTopic ? (
        <Link className="next" href={`/topics/${nextTopic.slug}`}>
          <div>
            <span>Next</span>
            <strong>{nextTopic.subtopicTitle}</strong>
          </div>
          <ArrowRight size={17} />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
