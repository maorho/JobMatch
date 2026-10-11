import { NextRequest, NextResponse } from "next/server";
import { handleMcp, MCP_PROTOCOL_VERSION } from "@/app/lib/mcp/server";
import { userIdFromApiKey } from "@/app/lib/auth/apiKey";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const HEADERS = { "Content-Type": "application/json", "MCP-Protocol-Version": MCP_PROTOCOL_VERSION, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };

/**
 * MCP endpoint (Streamable HTTP, stateless). Clients POST JSON-RPC here with
 * `Authorization: Bearer jm_live_…` for the personal tools; anonymous calls
 * get the public catalog tools. No SSE stream is offered (GET → 405), which
 * the spec allows for servers that don't push.
 */
export async function POST(req: NextRequest) {
  const userId = (await userIdFromApiKey(req.headers.get("authorization"))) || (await getUserIdFromRequest(req).catch(() => null));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: HEADERS });
  }
  const out = await handleMcp(body, { userId });
  if (out === null) return new NextResponse(null, { status: 202, headers: HEADERS });
  return NextResponse.json(out, { headers: HEADERS });
}

export async function GET() {
  return new NextResponse("This MCP server is stateless and does not offer a server-sent event stream. POST JSON-RPC messages to this URL.", { status: 405, headers: { ...HEADERS, "Content-Type": "text/plain", Allow: "POST, OPTIONS" } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}

export async function DELETE() {
  return new NextResponse(null, { status: 204, headers: HEADERS }); // nothing to tear down: no sessions
}
