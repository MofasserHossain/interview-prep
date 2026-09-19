import { ImageResponse } from "next/og";
import { brand, logoPaths, logoStroke, siteDescription, siteName } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = siteName;

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: brand.background,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 72,
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            background: brand.foreground,
          }}
        >
          <svg width="46" height="46" viewBox="0 0 24 24" stroke={brand.background} {...logoStroke}>
            {logoPaths.map((d) => (
              <path d={d} key={d} />
            ))}
          </svg>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: brand.muted, letterSpacing: -0.4 }}>
          {siteName}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            color: brand.foreground,
            letterSpacing: -2.5,
            lineHeight: 1.05,
          }}
        >
          Interview questions, organised for study.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: brand.muted,
            lineHeight: 1.4,
            maxWidth: 940,
          }}
        >
          {siteDescription}
        </div>
      </div>
    </div>,
    size,
  );
}
