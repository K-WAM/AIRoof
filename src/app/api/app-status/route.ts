import { NextResponse } from "next/server";
import facts from "../../../../app-status.json";

export const dynamic = "force-dynamic";

/** Public build facts only: no service initialization, auth, database or AI work. */
export function GET() {
  return NextResponse.json({
    ...facts,
    generatedAt: new Date().toISOString(),
    deploy: {
      commit: (process.env.APP_STATUS_BUILD_COMMIT || "").slice(0, 7),
      env: process.env.APP_STATUS_DEPLOY_ENV === "production" ? "production" : "preview",
    },
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
