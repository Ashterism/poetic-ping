import { authenticate } from "./auth";
import { handleApi } from "./api";
import { runSchedule } from "./scheduler";
import { HttpError } from "./types";

function cors(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGIN.split(",").map((value) => value.trim());
  return {
    ...(allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(value: unknown, request: Request, env: Env, status = 200): Response {
  return Response.json(value, { status, headers: cors(request, env) });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env) });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "poetic-ping-api", version: "db-key-fix-1" }, request, env);
    if (url.pathname === "/__scheduled" && env.ENVIRONMENT === "production") return json({ error: "Not found." }, request, env, 404);
    if (!url.pathname.startsWith("/api/")) return json({ error: "Not found." }, request, env, 404);
    try {
      const identity = await authenticate(request, env);
      return json(await handleApi(request, env, identity), request, env);
    } catch (cause) {
      const status = cause instanceof HttpError ? cause.status : 500;
      const message = cause instanceof HttpError ? cause.message : "An unexpected error occurred.";
      if (status === 500) console.error(JSON.stringify({ message: "Unhandled request error", path: url.pathname, reason: cause instanceof Error ? cause.message : "unknown" }));
      return json({ error: message }, request, env, status);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runSchedule(env, new Date(controller.scheduledTime))
        .then((result) => console.log(JSON.stringify({ message: "Schedule complete", cron: controller.cron, ...result })))
        .catch((cause: unknown) => {
          console.error(JSON.stringify({ message: "Schedule failed", cron: controller.cron, reason: cause instanceof Error ? cause.message : "unknown" }));
          throw cause;
        }),
    );
  },
} satisfies ExportedHandler<Env>;
