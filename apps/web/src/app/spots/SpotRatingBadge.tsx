import { formatScore, type PublicSpotRating } from "../../lib/spotsApi";

const BAND_COLORS: Record<string, { bg: string; fg: string }> = {
  premium_plus: { bg: "#0d695e", fg: "#fff" },
  premium: { bg: "#14897a", fg: "#fff" },
  standard: { bg: "#d2faf3", fg: "#0d4f47" },
  basic: { bg: "#f3f4f1", fg: "#3f4a48" },
  below_standard: { bg: "#fff4e5", fg: "#7a4a00" },
};

export function SpotRatingBadge({ rating }: { rating: PublicSpotRating | null }) {
  if (!rating) {
    return (
      <span
        style={{
          display: "inline-block",
          padding: "0.25rem 0.6rem",
          borderRadius: 999,
          background: "#f3f4f1",
          color: "#58706d",
          fontSize: "0.85rem",
        }}
      >
        Рейтинг ещё не присвоен
      </span>
    );
  }
  const colors = BAND_COLORS[rating.band] ?? BAND_COLORS.basic;
  return (
    <span
      title={`Методика ${rating.methodologyVersion}, действует до ${new Date(rating.expiresAt).toLocaleDateString("ru-RU")}`}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: "0.4rem",
        padding: "0.3rem 0.7rem",
        borderRadius: 999,
        background: colors.bg,
        color: colors.fg,
        fontWeight: 700,
      }}
    >
      <span style={{ fontSize: "1.05rem" }}>{formatScore(rating.officialScore)}</span>
      <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{rating.bandLabelRu}</span>
    </span>
  );
}
