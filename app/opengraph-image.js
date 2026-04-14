import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Vanta AI workspace";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at top right, rgba(168,85,247,0.42), transparent 28%), linear-gradient(160deg, #05010b 12%, #12091d 52%, #090410 100%)",
          color: "white",
          padding: "56px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
            borderRadius: "18px",
            padding: "12px 18px",
            fontSize: "24px",
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            color: "rgba(221, 214, 254, 0.9)",
          }}
        >
          <div
            style={{
              height: "10px",
              width: "10px",
              borderRadius: "999px",
              background: "#a855f7",
              boxShadow: "0 0 30px #a855f7",
            }}
          />
          Vanta
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ fontSize: "88px", fontWeight: 700, letterSpacing: "-0.06em" }}>
            Focused AI,
            <div style={{ color: "rgba(255,255,255,0.52)" }}>
              without the interface noise.
            </div>
          </div>
          <div
            style={{
              maxWidth: "820px",
              fontSize: "30px",
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.62)",
            }}
          >
            Streaming chat, synced conversations, public share pages, research mode,
            and image-aware prompts in a minimal workspace.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "16px",
            fontSize: "22px",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          <div>chat</div>
          <div>sync</div>
          <div>research</div>
          <div>share</div>
        </div>
      </div>
    ),
    size
  );
}
