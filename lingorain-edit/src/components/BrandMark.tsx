type Props = { className?: string; size?: number; src?: string; alt?: string };

/**
 * Lingorain mark — a speech bubble whose tail becomes a raindrop.
 * Pass `src` to use an uploaded/custom logo instead of the built-in SVG.
 */
export default function BrandMark({ className = "", size = 38, src = "", alt = "" }: Props) {
  const width = Math.round(size * 0.95);

  if (src) {
    return (
      <span
        className={`relative grid shrink-0 place-items-center overflow-hidden ${className}`}
        style={{
          width,
          height: size,
          borderRadius: "12px 12px 12px 5px",
          background: "#fff",
          boxShadow: "0 2px 10px rgba(20,62,55,.18), inset 0 0 0 1px rgba(20,62,55,.08)",
        }}
      >
        <img src={src} alt={alt} width={width} height={size} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`relative grid shrink-0 place-items-center ${className}`}
      style={{
        width,
        height: size,
        borderRadius: "12px 12px 12px 5px",
        background: "linear-gradient(155deg,#1e5c4d 0%,#143e37 52%,#0c2a25 100%)",
        boxShadow:
          "0 2px 10px rgba(20,62,55,.28), inset 0 1px 0 rgba(255,255,255,.14), inset 0 -1px 0 rgba(0,0,0,.18)",
        color: "#e8cd9c",
      }}
    >
      <svg viewBox="0 0 32 36" width={Math.round(size * 0.66)} height={Math.round(size * 0.74)} fill="none">
        <ellipse cx="16" cy="14.8" rx="12.4" ry="11.6" fill="currentColor" />
        <path d="M8.6 22.6 6.7 32l8.2-6.1Z" fill="currentColor" />
        <path d="M11 12.4h10M11 17.4h7.2" stroke="#143e37" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}