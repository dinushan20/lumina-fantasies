import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background:
            "radial-gradient(circle at top left, rgba(251,146,60,0.28), transparent 28%), radial-gradient(circle at right center, rgba(244,114,182,0.22), transparent 26%), linear-gradient(180deg, #0f1420, #090c14)",
          color: "#fff7ed",
          padding: "72px",
          fontFamily: "Georgia"
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 32,
            padding: 48,
            width: "100%",
            background: "rgba(18, 24, 37, 0.78)"
          }}
        >
          <div style={{ fontSize: 22, letterSpacing: "0.4em", textTransform: "uppercase", color: "rgba(254,215,170,0.86)" }}>
            Lumina Fantasies
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 860 }}>
            <div style={{ fontSize: 76, lineHeight: 1.02 }}>Private, ethical AI fantasy companions and creator twins.</div>
            <div style={{ fontSize: 30, lineHeight: 1.45, color: "rgba(255,237,213,0.82)" }}>
              Consent-first storytelling, streaming chat, creator-approved digital twins, and premium voice narration.
            </div>
          </div>
          <div style={{ fontSize: 24, color: "rgba(253,186,116,0.9)" }}>Closed beta · moderation-first · privacy-first</div>
        </div>
      </div>
    ),
    size
  );
}
