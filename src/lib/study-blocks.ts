type StudyBlockVariant = "benefit" | "example" | "important" | "interview";

export type StudyBlockDefinition = {
  aliases?: string[];
  match: string;
  title: string;
  variant: StudyBlockVariant;
};

const studyBlockDefinitions: StudyBlockDefinition[] = [
  { match: "benefits", title: "Benefits", variant: "benefit" },
  { match: "use cases", title: "Use Cases", variant: "benefit" },
  { match: "why this is good", title: "Why This Is Good", variant: "benefit" },
  { match: "why it matters", title: "Why It Matters", variant: "benefit" },
  {
    match: "benefit over traditional callbacks",
    title: "Benefit Over Traditional Callbacks",
    variant: "benefit",
  },
  { match: "benefit over promise.all()", title: "Benefit Over Promise.all", variant: "benefit" },
  {
    match: "benefits over .then() chains",
    title: "Benefits Over .then() Chains",
    variant: "benefit",
  },
  { match: "example", title: "Example", variant: "example" },
  { match: "walkthrough", title: "Walkthrough", variant: "example" },
  { match: "mental model", title: "Mental Model", variant: "example" },
  { match: "callback style", title: "Callback Style", variant: "example" },
  { match: "promise style", title: "Promise Style", variant: "example" },
  { match: "promise chain", title: "Promise Chain", variant: "example" },
  { match: "sequential", title: "Sequential", variant: "example" },
  { match: "concurrent", title: "Concurrent", variant: "example" },
  { match: "important", title: "Important", variant: "important" },
  { match: "why", title: "Why", variant: "important" },
  { match: "key reasoning", title: "Key Reasoning", variant: "important" },
  { match: "priority order", title: "Priority Order", variant: "important" },
  { match: "reliable rule", title: "Reliable Rule", variant: "important" },
  { match: "interview caveat", title: "Interview Caveat", variant: "important" },
  {
    match: "when .then() is still fine",
    title: "When .then() Is Still Fine",
    variant: "important",
  },
  {
    match: "when not to use promise.all()",
    title: "When Not To Use Promise.all",
    variant: "important",
  },
  {
    match: "interview note",
    title: "Interview Note",
    variant: "interview",
    aliases: ["interview notes"],
  },
  { match: "interview method", title: "Interview Method", variant: "interview" },
  { match: "strong answer", title: "Strong Interview Answer", variant: "interview" },
];

const definitionsByLabel = new Map(
  studyBlockDefinitions.flatMap((definition) =>
    [definition.match, ...(definition.aliases ?? [])].map(
      (label): [string, StudyBlockDefinition] => [label, definition],
    ),
  ),
);

const maxLabelLength =
  Math.max(...Array.from(definitionsByLabel.keys(), (label) => label.length)) + 1;

export function findStudyBlock(text: string) {
  const trimmed = text.trim();

  if (trimmed.length > maxLabelLength) {
    return undefined;
  }

  return definitionsByLabel.get(trimmed.replace(/:$/, "").toLowerCase());
}
