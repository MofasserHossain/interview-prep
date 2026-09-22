import { ChartGantt } from "lucide-react";
import type { CSSProperties } from "react";
import { timelineKindLabels } from "@/lib/timeline";
import type { TimelineSegmentKind, TimelineSpec } from "@/lib/timeline";

// Markers closer than this share a column, so their badges stack instead of
// overlapping.
const markerCrowding = 0.06;

export function TimelineChart({ spec }: { spec: TimelineSpec }) {
  const { end, lanes, markers, ticks, title } = spec;

  if (lanes.length === 0) {
    return null;
  }

  const at = (seconds: number) => `${(Math.min(seconds, end) / end) * 100}%`;
  const levels = stackMarkers(markers.map((marker) => marker.time / end));
  const kinds = new Set<TimelineSegmentKind>(
    lanes.flatMap((lane) => lane.segments.map((segment) => segment.kind)),
  );
  const markerLines = markers.map((marker) => (
    <span
      aria-hidden="true"
      className="timeline-marker-line"
      key={`${marker.time}-${marker.label}`}
      style={{ left: at(marker.time) }}
    />
  ));

  return (
    <figure
      className="viz-panel viz-timeline"
      style={
        {
          "--timeline-intervals": ticks.length - 1,
          "--timeline-marker-levels": Math.max(0, ...levels) + 1,
        } as CSSProperties
      }
    >
      <div className="viz-header">
        <ChartGantt size={14} />
        <span className="viz-title">{title ?? "Timeline"}</span>
        <span className="viz-kind">Timeline</span>
      </div>

      <div className="timeline-chart">
        {markers.length > 0 ? (
          <div aria-hidden="true" className="timeline-row timeline-marker-row">
            <span />
            <div className="timeline-track">
              {markers.map((marker, index) => (
                <span
                  className="timeline-marker-badge"
                  key={`${marker.time}-${marker.label}`}
                  style={{ left: at(marker.time), "--level": levels[index] } as CSSProperties}
                >
                  {index + 1}
                </span>
              ))}
              {markerLines}
            </div>
          </div>
        ) : null}

        {lanes.map((lane) => (
          <div className="timeline-row" key={lane.label}>
            <span className="timeline-lane">{lane.label}</span>
            <div className="timeline-track">
              {lane.segments.map((segment) => {
                const description = `${lane.label}: ${timelineKindLabels[segment.kind]}, ${formatSpan(segment.start, segment.end)}${segment.note ? ` (${segment.note})` : ""}`;

                return (
                  <span
                    className={`timeline-fill timeline-segment is-${segment.kind}`}
                    key={`${segment.start}-${segment.end}-${segment.kind}`}
                    style={{ left: at(segment.start), width: at(segment.end - segment.start) }}
                    title={description}
                  >
                    <span className="timeline-sr">{description}</span>
                    {segment.note ? (
                      <span aria-hidden="true" className="timeline-segment-note">
                        {segment.note}
                      </span>
                    ) : null}
                  </span>
                );
              })}
              {markerLines}
            </div>
          </div>
        ))}

        <div aria-hidden="true" className="timeline-row timeline-axis">
          <span />
          <div className="timeline-track">
            {ticks.map((tick, index) => (
              <span className="timeline-tick" key={tick} style={{ left: at(tick) }}>
                {formatSeconds(tick, index === ticks.length - 1)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <figcaption className="timeline-legend">
        <span className="timeline-legend-group">
          {Array.from(kinds, (kind) => (
            <span className="timeline-legend-item" key={kind}>
              <span aria-hidden="true" className={`timeline-fill timeline-swatch is-${kind}`} />
              {timelineKindLabels[kind]}
            </span>
          ))}
        </span>
        {markers.length > 0 ? (
          <span className="timeline-legend-group">
            {markers.map((marker, index) => (
              <span className="timeline-legend-item" key={`${marker.time}-${marker.label}`}>
                <span aria-hidden="true" className="timeline-marker-number">
                  {index + 1}
                </span>
                {marker.label}
                <span className="timeline-marker-time">{formatSeconds(marker.time, true)}</span>
              </span>
            ))}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

/** Badge row per marker: 0 unless it crowds the previous marker. */
function stackMarkers(positions: number[]) {
  return positions.reduce<number[]>((levels, position, index) => {
    const crowded = index > 0 && position - positions[index - 1] < markerCrowding;
    levels.push(crowded ? levels[index - 1] + 1 : 0);
    return levels;
  }, []);
}

function formatSeconds(seconds: number, withUnit: boolean) {
  const value = Number(seconds.toFixed(2)).toString();
  return withUnit ? `${value} s` : value;
}

function formatSpan(start: number, end: number) {
  return start === end
    ? `at ${formatSeconds(start, true)}`
    : `${formatSeconds(start, false)}–${formatSeconds(end, true)}`;
}
