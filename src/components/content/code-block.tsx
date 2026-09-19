"use client";

import { Check, Clipboard, CodeXml, Terminal } from "lucide-react";
import { Children, isValidElement, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { getCodeText } from "@/lib/react-text";

const languageLabels: Record<string, string> = {
  bash: "Shell",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  dockerfile: "Dockerfile",
  html: "HTML",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  output: "Output",
  py: "Python",
  python: "Python",
  sh: "Shell",
  shell: "Shell",
  text: "Output",
  ts: "TypeScript",
  tsx: "TSX",
  txt: "Output",
  yaml: "YAML",
  yml: "YAML",
};

const outputLanguages = new Set(["console", "output", "text", "txt"]);

const jsTokenPattern =
  /\/\/.*|\/\*.*?\*\/|(["'`])(?:\\.|(?!\1).)*\1|\b(?:async|await|break|case|catch|class|const|continue|default|delete|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|switch|throw|try|typeof|var|void|while|yield)\b|\b(?:false|Infinity|NaN|null|true|undefined)\b|\b\d+(?:\.\d+)?\b|\b[A-Z][A-Za-z0-9_$]*(?=[\s.(])|\b[A-Za-z_$][\w$]*(?=\s*\()|[{}()[\].,;:?]/g;

const shellTokenPattern =
  /#.*|\$[A-Za-z_][\w]*|--?[A-Za-z0-9][\w-]*|(["'])(?:\\.|(?!\1).)*\1|\b\d+(?:\.\d+)?\b/g;

const dataTokenPattern =
  /(["'])(?:\\.|(?!\1).)*\1|\b(?:false|null|true)\b|\b\d+(?:\.\d+)?\b|[{}[\]:,]/g;

type HighlightStrategy = {
  getClassName: (token: string) => string;
  pattern: RegExp;
};

const highlightStrategies = new Map<string, HighlightStrategy>(
  (
    [
      [["js", "javascript", "jsx", "ts", "tsx"], jsTokenPattern, getJsTokenClass],
      [["bash", "sh", "shell"], shellTokenPattern, getShellTokenClass],
      [["json", "yaml", "yml"], dataTokenPattern, getDataTokenClass],
    ] as const
  ).flatMap(([languages, pattern, getClassName]) =>
    languages.map((language): [string, HighlightStrategy] => [language, { getClassName, pattern }]),
  ),
);

export function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const codeElement = Children.toArray(children).find(
    (child): child is ReactElement<{ children?: ReactNode; className?: string }> =>
      isValidElement(child),
  );
  const className = codeElement?.props.className ?? "";
  const language = getCodeLanguage(className);
  const isOutput = outputLanguages.has(language);
  const languageLabel = languageLabels[language] ?? language.toUpperCase();
  const showLanguageLabel = !isOutput && language !== "plain";
  const code = getCodeText(codeElement?.props.children ?? children).replace(/\n$/, "");
  const lines = code.split("\n");
  const lineNumberWidth = String(lines.length).length;
  const showLineNumbers = !isOutput && lines.length > 1;
  const CodeIcon = isOutput ? Terminal : CodeXml;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={[
        "code-panel",
        isOutput ? "output-code" : "source-code",
        showLineNumbers ? "with-line-numbers" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="code-panel-header">
        <div className="code-panel-title">
          <CodeIcon size={15} />
          <span>{isOutput ? "Output" : "Code"}</span>
          {showLanguageLabel ? <span className="code-language">{languageLabel}</span> : null}
        </div>
        <button
          aria-label={copied ? "Copied code" : "Copy code"}
          className="code-copy-button"
          onClick={() => void copyCode()}
          type="button"
        >
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <pre className="code-panel-pre">
        <code className={className}>
          {lines.map((line, index) => (
            <span className="code-line" key={`${index}-${line}`}>
              {showLineNumbers ? (
                <span className="code-line-number">
                  {String(index + 1).padStart(lineNumberWidth, " ")}
                </span>
              ) : null}
              <span className="code-line-content">{renderCodeLine(line, language, isOutput)}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function getCodeLanguage(className?: string) {
  return className?.match(/language-([a-zA-Z0-9_-]+)/)?.[1].toLowerCase() ?? "plain";
}

function renderCodeLine(line: string, language: string, isOutput: boolean) {
  if (!line || isOutput) {
    return line || " ";
  }

  const strategy = highlightStrategies.get(language);

  if (!strategy) {
    return line;
  }

  return highlightCodeLine(line, strategy.pattern, strategy.getClassName);
}

function highlightCodeLine(line: string, pattern: RegExp, getClassName: (token: string) => string) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of line.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > cursor) {
      nodes.push(line.slice(cursor, index));
    }

    nodes.push(
      <span className={getClassName(token)} key={`${tokenIndex}-${index}`}>
        {token}
      </span>,
    );
    cursor = index + token.length;
    tokenIndex += 1;
  }

  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }

  return nodes.length ? nodes : line;
}

function getJsTokenClass(token: string) {
  if (token.startsWith("//") || token.startsWith("/*")) return "syntax-comment";
  if (/^["'`]/.test(token)) return "syntax-string";
  if (/^\d/.test(token)) return "syntax-number";
  if (/^(false|Infinity|NaN|null|true|undefined)$/.test(token)) return "syntax-literal";
  if (/^[A-Z]/.test(token)) return "syntax-class";
  if (/^[A-Za-z_$]/.test(token) && !isJsKeyword(token)) return "syntax-function";
  if (/^[{}()[\].,;:?]$/.test(token)) return "syntax-punctuation";

  return "syntax-keyword";
}

function getShellTokenClass(token: string) {
  if (token.startsWith("#")) return "syntax-comment";
  if (/^["']/.test(token)) return "syntax-string";
  if (token.startsWith("$")) return "syntax-variable";
  if (token.startsWith("-")) return "syntax-attr";
  if (/^\d/.test(token)) return "syntax-number";

  return "syntax-keyword";
}

function getDataTokenClass(token: string) {
  if (/^["']/.test(token)) return "syntax-string";
  if (/^\d/.test(token)) return "syntax-number";
  if (/^(false|null|true)$/.test(token)) return "syntax-literal";

  return "syntax-punctuation";
}

function isJsKeyword(token: string) {
  return /^(async|await|break|case|catch|class|const|continue|default|delete|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|switch|throw|try|typeof|var|void|while|yield)$/.test(
    token,
  );
}
