import { Children, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import type { Components } from "react-markdown";
import { CodeBlock } from "@/components/content/code-block";
import { StudyCallout } from "@/components/content/study-callout";
import { Visualization } from "@/components/content/visualization";
import { capitalizeFirstReadableText, getCodeText } from "@/lib/react-text";
import { findStudyBlock } from "@/lib/study-blocks";

export const markdownComponents: Components = {
  code({ children, className, node: _node, ...props }) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  li({ children, node: _node, ...props }) {
    return <li {...props}>{capitalizeFirstReadableText(children)}</li>;
  },
  pre({ children }) {
    const codeElement = Children.toArray(children).find(
      (child): child is ReactElement<{ children?: ReactNode; className?: string }> =>
        isValidElement(child),
    );

    if (codeElement?.props.className?.includes("language-viz")) {
      return <Visualization source={getCodeText(codeElement.props.children)} />;
    }

    return <CodeBlock>{children}</CodeBlock>;
  },
  p({ children, node: _node, ...props }) {
    const definition = findStudyBlock(getCodeText(children));

    if (definition) {
      return <StudyCallout definition={definition} />;
    }

    return <p {...props}>{children}</p>;
  },
  table({ children, node: _node, ...props }) {
    return (
      <div className="markdown-table-wrap">
        <table {...props}>{children}</table>
      </div>
    );
  },
};
