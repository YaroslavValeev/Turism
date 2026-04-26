export type ProgramCardProgram = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation?: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  priceFromRub: number | null;
  levelRequired?: string | null;
  audienceFit?: string | null;
  riskLevel?: string | null;
  organizer?: {
    displayName: string;
    verificationStatus?: string;
    reviewCount?: number;
    ratingAvg?: number | null;
    verificationBadge?: string | null;
  };
  media?: { id?: string; url: string; mediaType: string }[];
  autoPublished?: boolean;
  sourceType?: string | null;
  sourceUrl?: string | null;
  reviewStatus?: string | null;
};
