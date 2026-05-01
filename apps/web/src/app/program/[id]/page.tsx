import { fetchPublicExploreList } from "../../../lib/exploreApi";
import { buildValidHubKeySetFromExploreIndex } from "../../../lib/exploreNavWeb";
import { ProgramPdpClient } from "./program-pdp.client";

type Props = { params: Promise<{ id: string }> };

export default async function ProgramPage({ params }: Props) {
  const { id: rawId } = await params;
  const id = typeof rawId === "string" ? rawId : "";
  const items = await fetchPublicExploreList();
  const validHubKeys = buildValidHubKeySetFromExploreIndex(items);
  return <ProgramPdpClient id={id} validHubKeys={validHubKeys} />;
}
