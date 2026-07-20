import { NextRequest } from "next/server";
import { handleMediaRequest } from "./handler";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleMediaRequest(request);
}
