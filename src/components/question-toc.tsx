"use client";

import type { TocEntry } from "@/lib/types";

type TocGroup = {
  children: TocEntry[];
  overview?: TocEntry;
  title: string;
};

type GroupedToc = {
  groups: TocGroup[];
  standalone: TocEntry[];
};

const overviewTitlePattern = /\s+Overview$/i;

export function QuestionToc({
  onSelectQuestion,
  questions,
  selectedQuestionId,
}: {
  onSelectQuestion: (questionId: string) => void;
  questions: TocEntry[];
  selectedQuestionId?: string;
}) {
  const groupedToc = getGroupedToc(questions);

  return (
    <aside className="toc-panel" aria-label="Sections in this document">
      {groupedToc ? (
        <div className="toc-list grouped">
          {groupedToc.standalone.map((question) => (
            <TocButton
              key={question.id}
              onSelectQuestion={onSelectQuestion}
              question={question}
              selected={selectedQuestionId === question.id}
            />
          ))}

          {groupedToc.groups.map((group) => {
            const groupActive =
              group.overview?.id === selectedQuestionId ||
              group.children.some((question) => question.id === selectedQuestionId);

            return (
              <div className={groupActive ? "toc-group active" : "toc-group"} key={group.title}>
                {group.overview ? (
                  <button
                    className={
                      selectedQuestionId === group.overview.id
                        ? "toc-group-button active"
                        : "toc-group-button"
                    }
                    data-question-id={group.overview.id}
                    onClick={() => onSelectQuestion(group.overview!.id)}
                    type="button"
                  >
                    <strong>{group.title}</strong>
                    <small>{group.children.length} sections</small>
                  </button>
                ) : (
                  <div className="toc-group-label">
                    <strong>{group.title}</strong>
                    <small>{group.children.length} sections</small>
                  </div>
                )}

                <div className="toc-sublist">
                  {group.children.map((question) => (
                    <TocButton
                      child
                      key={question.id}
                      onSelectQuestion={onSelectQuestion}
                      question={question}
                      selected={selectedQuestionId === question.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : questions.length ? (
        <div className="toc-list">
          {questions.map((question) => (
            <TocButton
              key={question.id}
              onSelectQuestion={onSelectQuestion}
              question={question}
              selected={selectedQuestionId === question.id}
            />
          ))}
        </div>
      ) : (
        <div className="toc-empty">No matching sections.</div>
      )}
    </aside>
  );
}

function TocButton({
  child = false,
  onSelectQuestion,
  question,
  selected,
}: {
  child?: boolean;
  onSelectQuestion: (questionId: string) => void;
  question: TocEntry;
  selected: boolean;
}) {
  return (
    <button
      className={[selected ? "active" : "", child ? "toc-child-button" : ""]
        .filter(Boolean)
        .join(" ")}
      data-question-id={question.id}
      onClick={() => onSelectQuestion(question.id)}
      type="button"
    >
      <strong>{question.question}</strong>
    </button>
  );
}

function getGroupedToc(questions: TocEntry[]): GroupedToc | undefined {
  const overviewPositions = questions.reduce<number[]>((positions, question, index) => {
    if (question.kind === "question" && overviewTitlePattern.test(question.question)) {
      positions.push(index);
    }

    return positions;
  }, []);

  if (overviewPositions.length < 2) {
    return undefined;
  }

  const groups = overviewPositions.map((start, order) => {
    const overview = questions[start];

    return {
      children: questions.slice(start + 1, overviewPositions[order + 1] ?? questions.length),
      overview,
      title: overview.question.replace(overviewTitlePattern, ""),
    };
  });

  return {
    groups,
    standalone: questions.slice(0, overviewPositions[0]),
  };
}
