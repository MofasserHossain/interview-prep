import { cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";

export function capitalizeFirstReadableText(value: ReactNode) {
  return capitalizeFirstReadableTextOnce(value)[0];
}

function capitalizeFirstReadableTextOnce(value: ReactNode): [ReactNode, boolean] {
  if (typeof value === "string") {
    return capitalizeTextStart(value);
  }

  if (Array.isArray(value)) {
    let changed = false;
    const children = value.map((child) => {
      if (changed) return child;

      const [nextChild, didChange] = capitalizeFirstReadableTextOnce(child);
      changed = didChange;

      return nextChild;
    });

    return [children, changed];
  }

  if (isValidElement<{ children?: ReactNode }>(value)) {
    if (isCodeLikeElement(value)) {
      return [value, false];
    }

    const [children, changed] = capitalizeFirstReadableTextOnce(value.props.children);

    if (!changed) {
      return [value, false];
    }

    return [cloneElement(value, undefined, children), true];
  }

  return [value, false];
}

function capitalizeTextStart(value: string): [string, boolean] {
  const match = value.match(/^(\s*["'([{]*)([a-z])/);

  if (!match) {
    return [value, false];
  }

  const index = match[1].length;

  return [
    `${value.slice(0, index)}${value.charAt(index).toUpperCase()}${value.slice(index + 1)}`,
    true,
  ];
}

function isCodeLikeElement(value: ReactElement) {
  return typeof value.type === "string" && ["code", "kbd", "pre", "samp"].includes(value.type);
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
