import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Infinite Monitor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const fontData = await readFile(
    join(process.cwd(), "node_modules/geist/dist/fonts/geist-mono/GeistMono-Medium.ttf")
  );

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          backgroundColor: "#000000",
          fontFamily: "GeistMono",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            fontSize: 64,
            fontWeight: 500,
            letterSpacing: "0.2em",
            textTransform: "uppercase" as const,
          }}
        >
          <span style={{ color: "#52525b" }}>Infinite</span>
          <span style={{ color: "#d4d4d8" }}>Monitor</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "GeistMono",
          data: fontData,
          style: "normal",
          weight: 500,
        },
      ],
    }
  );
}
