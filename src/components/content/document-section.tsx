import type { ComponentType } from "react";
import { ProseSection } from "@/components/content/prose-section";
import { QuestionSection } from "@/components/content/question-section";
import type { SectionRendererProps } from "@/components/content/types";
import type { Question } from "@/lib/types";

const sectionRenderers: Record<Question["kind"], ComponentType<SectionRendererProps>> = {
  question: QuestionSection,
  prose: ProseSection,
};

export function DocumentSection({ section }: SectionRendererProps) {
  const Renderer = sectionRenderers[section.kind];

  return <Renderer section={section} />;
}
