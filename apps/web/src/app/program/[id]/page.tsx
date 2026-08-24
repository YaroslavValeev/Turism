import { notFound } from "next/navigation";
import { fetchPublicExploreList } from "../../../lib/exploreApi";
import { buildValidHubKeySetFromExploreIndex } from "../../../lib/exploreNavWeb";
import { getServerApiBaseUrl, safeServerFetch } from "../../../lib/serverApiBase";
import { ProgramPdpClient, type Program, type PublicReview } from "./program-pdp.client";

type Props = { params: Promise<{ id: string }> };

export default async function ProgramPage({ params }: Props) {
  const { id: rawId } = await params;
  const id = typeof rawId === "string" ? rawId : "";
  if (!id) notFound();

  const base = getServerApiBaseUrl();
  const [programResponse, reviewsResponse, items] = await Promise.all([
    safeServerFetch(`${base}/programs/${encodeURIComponent(id)}`, { next: { revalidate: 300 } }),
    safeServerFetch(`${base}/reviews/public?programId=${encodeURIComponent(id)}`, { next: { revalidate: 300 } }),
    fetchPublicExploreList(),
  ]);
  if (!programResponse?.ok) notFound();

  const program = (await programResponse.json()) as Program;
  const reviews = reviewsResponse?.ok ? ((await reviewsResponse.json()) as PublicReview[]) : [];
  const validHubKeys = buildValidHubKeySetFromExploreIndex(items);
  return (
    <ProgramPdpClient
      id={id}
      validHubKeys={validHubKeys}
      initialProgram={program}
      initialReviews={Array.isArray(reviews) ? reviews : []}
    />
  );
}
