import { Layers, ListOrdered, Workflow } from "lucide-react";
import { TimelineChart } from "@/components/content/timeline-chart";
import { parseTimeline } from "@/lib/timeline";

type VisualizationKind = "flow" | "stack" | "queues";

type VisualizationItem = {
  active: boolean;
  label: string;
  note?: string;
};

type VisualizationSpec = {
  items: VisualizationItem[];
  kind: VisualizationKind;
  title?: string;
};

const kindIcons = {
  flow: Workflow,
  queues: ListOrdered,
  stack: Layers,
} satisfies Record<VisualizationKind, typeof Workflow>;

const kindLabels = {
  flow: "Flow",
  queues: "Priority",
  stack: "Stack",
} satisfies Record<VisualizationKind, string>;

export function Visualization({ source }: { source: string }) {
  const timeline = parseTimeline(source);

  if (timeline) {
    return <TimelineChart spec={timeline} />;
  }

  const spec = parseVisualization(source);

  if (!spec || spec.items.length === 0) {
    return null;
  }

  const Icon = kindIcons[spec.kind];
  const showNumbers = spec.kind !== "stack";

  return (
    <figure className={`viz-panel viz-${spec.kind}`}>
      <div className="viz-header">
        <Icon size={14} />
        <span className="viz-title">{spec.title ?? kindLabels[spec.kind]}</span>
        <span className="viz-kind">{kindLabels[spec.kind]}</span>
      </div>

      <ol className="viz-items">
        {spec.items.map((item, index) => (
          <li
            className={item.active ? "viz-item is-active" : "viz-item"}
            key={`${index}-${item.label}`}
          >
            <span aria-hidden="true" className="viz-rail">
              <span className="viz-marker">{showNumbers ? index + 1 : null}</span>
            </span>
            <span className="viz-body">
              <span className="viz-label">{item.label}</span>
              {item.note ? <span className="viz-note">{item.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      {spec.kind === "stack" ? (
        <figcaption className="viz-baseline">bottom of stack</figcaption>
      ) : null}
    </figure>
  );
}

function parseVisualization(source: string): VisualizationSpec | undefined {
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let kind: VisualizationKind = "flow";
  let title: string | undefined;
  const items: VisualizationItem[] = [];

  for (const line of lines) {
    const header = line.match(/^(type|title):\s*(.+)$/i);

    if (header) {
      const [, key, value] = header;

      if (key.toLowerCase() === "type") {
        kind = normalizeKind(value);
      } else {
        title = value;
      }

      continue;
    }

    const active = line.startsWith(">");
    const content = active ? line.slice(1).trim() : line;
    const [label, note] = content.split("::").map((part) => part.trim());

    if (label) {
      items.push({ active, label, note: note || undefined });
    }
  }

  return { items, kind, title };
}

function normalizeKind(value: string): VisualizationKind {
  const normalized = value.trim().toLowerCase();

  if (normalized === "stack" || normalized === "queues") {
    return normalized;
  }

  return "flow";
}
