import { NextResponse } from "next/server";
import { handler } from "@/lib/api-utils";
import { lastOrigin } from "@/lib/origin";
import { openApi } from "@/lib/api-docs";

/** The OpenAPI 3 description of /api/v1, for Postman, Swagger UI or a client generator. Public: no data. */
export const GET = handler(
  async () => NextResponse.json(openApi(lastOrigin()), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } }),
  { auth: false }
);
