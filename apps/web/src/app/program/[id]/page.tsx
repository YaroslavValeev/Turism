import { fetchPublicExploreList } from "../../../lib/exploreApi";
import { buildValidHubKeySetFromExploreIndex } from "../../../lib/exploreNavWeb";
import { ProgramPdpClient } from "./program-pdp.client";

type Props = { params: { id: string } };

export default async function ProgramPage({ params }: Props) {
  const id = typeof params?.id === "string" ? params.id : "";
  const items = await fetchPublicExploreList();
  const validHubKeys = buildValidHubKeySetFromExploreIndex(items);
  return <ProgramPdpClient id={id} validHubKeys={validHubKeys} />;
}
