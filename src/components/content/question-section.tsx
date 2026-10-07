import { SectionBody } from "@/components/content/section-body";
import { PracticeAnswer } from "@/components/practice-mode";
import type { SectionRendererProps } from "@/components/content/types";

export function QuestionSection({ section }: SectionRendererProps) {
  return (
    <section className="document-section" id={section.id}>
      <div className="question-title-row">
        <span className="question-number" aria-label={`Question ${section.number}`}>
          {section.number}
        </span>
        <h2>{section.question}</h2>
      </div>
      <PracticeAnswer>
        <SectionBody markdown={section.answer} />
      </PracticeAnswer>
    </section>
  );
}
