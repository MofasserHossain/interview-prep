import { SectionBody } from "@/components/content/section-body";
import type { SectionRendererProps } from "@/components/content/types";

export function ProseSection({ section }: SectionRendererProps) {
  return (
    <section className="document-section prose-section" id={section.id}>
      <div className="question-title-row">
        <h2>{section.question}</h2>
      </div>
      <SectionBody markdown={section.answer} />
    </section>
  );
}
