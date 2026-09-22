// Parses a `type: timeline` viz block: lanes of timed segments plus
// milestone markers, all in seconds.
//
//   type: timeline
//   title: Blocking page
//   end: 3
//   styles.css :: 0-1.0 :: download
//   Parser :: 0.01-1.52 :: blocked :: stopped at vendor.js
//   @ 1.55 :: First paint

const segmentKinds = [
  "download",
  "wait",
  "parse",
  "blocked",
  "run",
  "blank",
  "partial",
  "painted",
] as const;

export type TimelineSegmentKind = (typeof segmentKinds)[number];

type TimelineSegment = {
  end: number;
  kind: TimelineSegmentKind;
  note?: string;
  start: number;
};

type TimelineMarker = {
  label: string;
  time: number;
};

export type TimelineSpec = {
  end: number;
  lanes: { label: string; segments: TimelineSegment[] }[];
  markers: TimelineMarker[];
  ticks: number[];
  title?: string;
};

export const timelineKindLabels = {
  download: "Downloading",
  wait: "Downloaded, waiting",
  parse: "Parsing HTML",
  blocked: "Blocked",
  run: "Running JavaScript",
  blank: "Nothing painted",
  partial: "Partly painted",
  painted: "Painted",
} satisfies Record<TimelineSegmentKind, string>;

const tickSteps = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
const maxTickIntervals = 6;

/** Returns undefined unless the block declares `type: timeline`. */
export function parseTimeline(source: string): TimelineSpec | undefined {
  let isTimeline = false;
  let title: string | undefined;
  let declaredEnd = 0;
  const lanes = new Map<string, TimelineSegment[]>();
  const markers: TimelineMarker[] = [];

  for (const line of source.split("\n").map((part) => part.trim())) {
    if (!line) {
      continue;
    }

    const header = line.match(/^(type|title|end):\s*(.+)$/i);

    if (header) {
      const key = header[1].toLowerCase();
      const value = header[2].trim();

      if (key === "type") {
        isTimeline = value.toLowerCase() === "timeline";
      } else if (key === "title") {
        title = value;
      } else {
        declaredEnd = toSeconds(value) ?? 0;
      }

      continue;
    }

    const [first, ...rest] = line.split("::").map((part) => part.trim());

    if (first.startsWith("@")) {
      const time = toSeconds(first.slice(1));

      if (time !== undefined && rest[0]) {
        markers.push({ label: rest[0], time });
      }

      continue;
    }

    const [span, kind, note] = rest;
    const range = span ? parseSpan(span) : undefined;

    if (!first || !range || !isSegmentKind(kind)) {
      continue;
    }

    const segments = lanes.get(first) ?? [];
    segments.push({ ...range, kind, note: note || undefined });
    lanes.set(first, segments);
  }

  if (!isTimeline) {
    return undefined;
  }

  const latest = Math.max(
    declaredEnd,
    ...markers.map((marker) => marker.time),
    ...Array.from(lanes.values(), (segments) => Math.max(...segments.map((s) => s.end))),
  );
  const step =
    tickSteps.find((candidate) => latest / candidate <= maxTickIntervals) ??
    tickSteps[tickSteps.length - 1];
  const end = latest > 0 ? Math.ceil(latest / step - 1e-9) * step : step;
  const ticks = Array.from({ length: Math.round(end / step) + 1 }, (_, index) =>
    Number((index * step).toFixed(3)),
  );

  return {
    end,
    lanes: Array.from(lanes, ([label, segments]) => ({ label, segments })),
    markers: markers.toSorted((a, b) => a.time - b.time),
    ticks,
    title,
  };
}

function isSegmentKind(value: string | undefined): value is TimelineSegmentKind {
  return segmentKinds.includes(value as TimelineSegmentKind);
}

function parseSpan(span: string) {
  const [start, end = start] = span.split(/\s*[-–]\s*/).map(toSeconds);

  if (start === undefined || end === undefined || end < start) {
    return undefined;
  }

  return { end, start };
}

function toSeconds(value: string | undefined) {
  const seconds = Number(value?.trim().replace(/s$/, ""));

  return value?.trim() && Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
