import { notFound, redirect } from "next/navigation";
import { confirmedProgramId } from "../../../lib/confirmedProgramIdentity";
import { fetchPublicExploreList } from "../../../lib/exploreApi";
import { buildValidHubKeySetFromExploreIndex } from "../../../lib/exploreNavWeb";
import { getServerApiBaseUrl, safeServerFetch } from "../../../lib/serverApiBase";
import { ProgramPdpClient, type Program, type PublicReview } from "./program-pdp.client";

type Props = { params: Promise<{ id: string }> };

// Status changes must be checked on each request, including manual withdrawal.
export const dynamic = "force-dynamic";

export default async function ProgramPage({ params }: Props) {
  const { id: rawId } = await params;
  const id = typeof rawId === "string" ? rawId : "";
  if (!id) notFound();
  const canonicalId = confirmedProgramId(id);
  // Temporary 307 keeps the curated decision reversible; never forwards contact/query data.
  if (canonicalId !== id) redirect(`/program/${canonicalId}`);

  const base = getServerApiBaseUrl();
  const [programResponse, reviewsResponse, items] = await Promise.all([
    safeServerFetch(`${base}/programs/${encodeURIComponent(id)}`, { cache: "no-store" }),
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
