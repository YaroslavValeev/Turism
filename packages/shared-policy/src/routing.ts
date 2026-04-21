export type LayerRole = "product" | "governance" | "runtime";

export interface RoutingRule {
  id: string;
  name: string;
  version: string;
  sourceLayer: LayerRole;
  targetLayer: LayerRole;
  condition: string;
  policy: "allow" | "review" | "deny";
}

export const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  {
    id: "route-owner-intent-to-governance",
    name: "Owner intent must pass governance",
    version: "1.0.0",
    sourceLayer: "product",
    targetLayer: "governance",
    condition: "all owner commands",
    policy: "allow"
  },
  {
    id: "route-governance-to-runtime",
    name: "Execution only after governance decision",
    version: "1.0.0",
    sourceLayer: "governance",
    targetLayer: "runtime",
    condition: "decision is validated and approvals resolved",
    policy: "allow"
  },
  {
    id: "prevent-product-runtime-bypass",
    name: "Product cannot directly execute runtime actions",
    version: "1.0.0",
    sourceLayer: "product",
    targetLayer: "runtime",
    condition: "direct execution request",
    policy: "deny"
  }
];
