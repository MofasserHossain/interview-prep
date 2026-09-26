import type { StudyBlockDefinition } from "@/lib/study-blocks";

export function StudyCallout({ definition }: { definition: StudyBlockDefinition }) {
  return <p className={`study-section-label ${definition.variant}`}>{definition.title}</p>;
}
