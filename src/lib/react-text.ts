import { cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";

export function capitalizeFirstReadableText(value: ReactNode) {
  return capitalizeFirstReadableTextOnce(value)[0];
}

// The flag means "reached the first readable content". The walk stops there
// whether or not it needed a capital, so later text and code stay as written.
function capitalizeFirstReadableTextOnce(value: ReactNode): [ReactNode, boolean] {
  if (typeof value === "string") {
    return capitalizeTextStart(value);
  }

  if (Array.isArray(value)) {
    let reached = false;
    const children = value.map((child) => {
      if (reached) return child;

      const [nextChild, didReach] = capitalizeFirstReadableTextOnce(child);
      reached = didReach;

      return nextChild;
    });

    return [children, reached];
  }

  if (isValidElement<{ children?: ReactNode; node?: { tagName?: string } }>(value)) {
    if (isCodeLikeElement(value)) {
      return [value, true];
    }

    const [children, reached] = capitalizeFirstReadableTextOnce(value.props.children);

    if (!reached || children === value.props.children) {
      return [value, reached];
    }

    return [cloneElement(value, undefined, children), true];
  }

  return [value, false];
}

function capitalizeTextStart(value: string): [string, boolean] {
  const match = value.match(/^(\s*["'([{]*)([a-z])/);

  if (!match) {
    // Whitespace between elements isn't readable yet; any other text is.
    return [value, /\S/.test(value)];
  }

  const index = match[1].length;

  return [
    `${value.slice(0, index)}${value.charAt(index).toUpperCase()}${value.slice(index + 1)}`,
    true,
  ];
}

// Markdown renders through `markdownComponents`, so an inline `code` element's
// type is a component function; react-markdown's `node` prop keeps the tag name.
function isCodeLikeElement(value: ReactElement<{ node?: { tagName?: string } }>) {
  const tagName = typeof value.type === "string" ? value.type : value.props.node?.tagName;

  return tagName !== undefined && ["code", "kbd", "pre", "samp"].includes(tagName);
}

export function getCodeText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((child) => getCodeText(child)).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(value)) {
    return getCodeText(value.props.children);
  }

  return "";
}
