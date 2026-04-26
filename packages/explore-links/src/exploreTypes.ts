export const EXPLORE_TYPES = ["discipline", "region", "season"] as const;
export type ExploreHubType = (typeof EXPLORE_TYPES)[number];

export function isExploreHubType(s: string): s is ExploreHubType {
  return (EXPLORE_TYPES as readonly string[]).includes(s);
}

export type ManualExploreHub = {
  slug: string;
  label: string;
  variants: string[];
};
