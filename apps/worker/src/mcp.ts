import { addPrivatePoem, getPoem, listPoems, PoemWithTags } from "./api";
import { authorizeMcpRequest, API_ORIGIN } from "./mcp-oauth";
import { HttpError, Identity } from "./types";

const RESOURCE_METADATA = `${API_ORIGIN}/.well-known/oauth-protected-resource`;
const AUTH_SCHEME = { type: "oauth2", scopes: ["openid", "profile", "email"] } as const;
const AUTH_META = { securitySchemes: [AUTH_SCHEME], "openai/securitySchemes": [AUTH_SCHEME], ui: { visibility: ["model", "app"] } };
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const MAX_BYTES = 128 * 1024;
const outputSchema = { type: "object", additionalProperties: true } as const;
const nullableString = (maxLength: number) => ({ type: ["string", "null"], maxLength });

const TOOLS = [
  {
    name: "search_poems", title: "Search Poems",
    description: "Search the poems available to the signed-in user: shared poems plus that user's private poems. Search matches titles, authors, poem text, explainers and tags.",
    inputSchema: {
      type: "object", properties: {
        query: { type: "string", maxLength: 300, description: "Optional words or phrase to find." },
        tags: { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 }, description: "Optional tag names; every supplied tag must match." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      }, additionalProperties: false,
    },
    outputSchema, securitySchemes: [AUTH_SCHEME], _meta: AUTH_META,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_poem", title: "Get Poem",
    description: "Return one shared or user-owned private poem by ID, including its source, rights, attribution, tags and explainer metadata.",
    inputSchema: { type: "object", properties: { poem_id: { type: "string", format: "uuid" } }, required: ["poem_id"], additionalProperties: false },
    outputSchema, securitySchemes: [AUTH_SCHEME], _meta: AUTH_META,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "add_poem", title: "Add Private Poem",
    description: "Add a poem to the signed-in user's private library. Ownership is always derived from the authenticated ZITADEL subject; caller-supplied user IDs and public access are not accepted. Duplicate title and author pairs are rejected.",
    inputSchema: {
      type: "object", properties: {
        title: { type: "string", minLength: 1, maxLength: 200 }, author: nullableString(160),
        body: { type: "string", minLength: 1, maxLength: 20_000 }, language: { type: "string", minLength: 1, maxLength: 12, default: "en" },
        tags: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 80 } },
        source_type: nullableString(80), source_title: nullableString(240), source_section: nullableString(160), source_page: nullableString(40),
        source_url: { type: ["string", "null"], format: "uri", maxLength: 2_000 }, rights_note: nullableString(500),
        attribution_year: { type: ["integer", "null"], minimum: 1, maximum: 2100 }, explainer: nullableString(4_000),
      }, required: ["title", "body"], additionalProperties: false,
    },
    outputSchema, securitySchemes: [AUTH_SCHEME], _meta: AUTH_META,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const json = (body: unknown, status = 200, extra: HeadersInit = {}) => new Response(body === null ? null : JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
});
const rpcError = (id: string | number | null, code: number, message: string, status = 200) => json({ jsonrpc: "2.0", id, error: { code, message } }, status);
const toolResult = (data: unknown, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, ...(isError ? { isError: true } : {}) });

class ToolError extends Error {}

function validateKeys(input: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(input).some((key) => !keys.includes(key))) throw new ToolError("Invalid tool arguments.");
}

function search(items: PoemWithTags[], args: Record<string, unknown>): { poems: PoemWithTags[]; count: number } {
  validateKeys(args, ["query", "tags", "limit"]);
  if (args.query !== undefined && (typeof args.query !== "string" || args.query.length > 300)) throw new ToolError("query must be a string of at most 300 characters.");
  if (args.tags !== undefined && (!Array.isArray(args.tags) || args.tags.length > 20 || args.tags.some((tag) => typeof tag !== "string" || tag.length > 80))) throw new ToolError("tags must contain at most 20 tag names.");
  const limit = args.limit === undefined ? 20 : args.limit;
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 100) throw new ToolError("limit must be a whole number from 1 to 100.");
  const query = typeof args.query === "string" ? args.query.trim().toLocaleLowerCase() : "";
  const tags = Array.isArray(args.tags) ? args.tags.map((tag) => String(tag).trim().toLocaleLowerCase()).filter(Boolean) : [];
  const matches = items.filter((poem) => {
    const haystack = [poem.title, poem.author, poem.body, poem.explainer, ...poem.tags.map((tag) => tag.name)].filter(Boolean).join("\n").toLocaleLowerCase();
    const poemTags = new Set(poem.tags.map((tag) => tag.name.toLocaleLowerCase()));
    return (!query || haystack.includes(query)) && tags.every((tag) => poemTags.has(tag));
  });
  return { poems: matches.slice(0, Number(limit)), count: matches.length };
}

async function callTool(env: Env, identity: Identity, name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "search_poems") return search(await listPoems(env, identity.id), args);
  if (name === "get_poem") {
    validateKeys(args, ["poem_id"]);
    if (typeof args.poem_id !== "string") throw new ToolError("poem_id is required.");
    return { poem: await getPoem(env, identity.id, args.poem_id) };
  }
  if (name === "add_poem") {
    validateKeys(args, ["title", "author", "body", "language", "tags", "source_type", "source_title", "source_section", "source_page", "source_url", "rights_note", "attribution_year", "explainer"]);
    return { poem: await addPrivatePoem(env, identity, args) };
  }
  throw new ToolError("Unknown tool.");
}

async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing JSON body.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw new RangeError("Request exceeds 128 KiB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "forbidden_origin" }, 403);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "POST" });
  if (!(request.headers.get("Content-Type") || "").match(/^application\/json(?:\s*;|$)/i)) return rpcError(null, -32600, "Content-Type must be application/json.", 415);
  const accept = request.headers.get("Accept") || "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) return rpcError(null, -32600, "Accept must include application/json and text/event-stream.", 406);
  const version = request.headers.get("MCP-Protocol-Version");
  if (version && !VERSIONS.includes(version)) return rpcError(null, -32600, "Unsupported MCP protocol version.", 400);
  let body: unknown;
  try {
    body = await readJson(request);
  } catch (cause) {
    return rpcError(null, cause instanceof RangeError ? -32600 : -32700, cause instanceof RangeError ? cause.message : "Invalid JSON.", cause instanceof RangeError ? 413 : 400);
  }
  if (!isObject(body)) return rpcError(null, -32600, "Invalid JSON-RPC request (batching unsupported).", 400);
  const hasId = Object.hasOwn(body, "id");
  const id = hasId && (typeof body.id === "string" || Number.isInteger(body.id)) ? body.id as string | number : null;
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string" || (hasId && id === null) || (body.params !== undefined && !isObject(body.params))) return rpcError(null, -32600, "Invalid JSON-RPC request (batching unsupported).", 400);
  if (!hasId) return json(null, 202);
  const params = (body.params || {}) as Record<string, unknown>;
  let result: unknown;
  if (body.method === "initialize") {
    if (typeof params.protocolVersion !== "string" || !isObject(params.capabilities) || !isObject(params.clientInfo) || typeof params.clientInfo.name !== "string" || typeof params.clientInfo.version !== "string") return rpcError(id, -32602, "Invalid initialize parameters.");
    result = { protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "poetic-ping", version: "1.0.0" }, instructions: "Search and read shared or user-owned poems. Add poems only when the user asks; new poems are private and owned by the authenticated Poetic Ping account." };
  } else if (body.method === "ping") {
    result = {};
  } else if (body.method === "tools/list") {
    if (params.cursor !== undefined) return rpcError(id, -32602, "This server has no additional tool pages.");
    result = { tools: TOOLS };
  } else if (body.method === "tools/call") {
    if (typeof params.name !== "string" || !TOOLS.some((tool) => tool.name === params.name)) return rpcError(id, -32602, "Unknown tool.");
    if (params.arguments !== undefined && !isObject(params.arguments)) return rpcError(id, -32602, "Tool arguments must be an object.");
    const auth = await authorizeMcpRequest(request, env);
    if (!auth.identity) {
      const challenge = `Bearer resource_metadata="${RESOURCE_METADATA}", scope="openid profile email", error="invalid_token", error_description="Sign in to Poetic Ping to continue"`;
      return json({ jsonrpc: "2.0", id, result: {
        ...toolResult({ error: auth.status === 401 ? "Sign in to Poetic Ping to use this tool." : auth.error }, true),
        ...(auth.status === 401 ? { _meta: { "mcp/www_authenticate": [challenge] } } : {}),
      } }, auth.status === 503 ? 503 : 200, auth.status === 401 ? { "WWW-Authenticate": challenge } : {});
    }
    try {
      result = toolResult(await callTool(env, auth.identity, params.name, (params.arguments || {}) as Record<string, unknown>));
    } catch (cause) {
      const message = cause instanceof ToolError || cause instanceof HttpError ? cause.message : "Poem operation failed. Try again later.";
      result = toolResult({ error: message }, true);
    }
  } else {
    return rpcError(id, -32601, "Method not found.");
  }
  return json({ jsonrpc: "2.0", id, result });
}
