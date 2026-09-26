import { ImageResponse } from "next/og";
import { brand, logoPaths, logoStroke } from "@/lib/site";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: brand.foreground,
      }}
    >
      <svg width="116" height="116" viewBox="0 0 24 24" stroke={brand.background} {...logoStroke}>
        {logoPaths.map((d) => (
          <path d={d} key={d} />
        ))}
      </svg>
    </div>,
    size,
  );
}
