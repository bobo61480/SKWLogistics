/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

const STATUS_WRITE_ENDPOINT =
  "https://script.google.com/a/macros/stylekoreanus.com/s/AKfycbwyVnU2jvOtMFXuY7KtX_8-hHXYVLrc6R2Dr_6akdDaTGQPc8duSo7tpguIuk00MjDl/exec";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function jsonResponse(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function forwardStatusUpdate(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  let body: string;
  try {
    body = JSON.stringify(await request.json());
  } catch {
    return jsonResponse({ ok: false, error: "Invalid status update." }, 400);
  }

  const upstreamRequest = (url: string) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body,
      redirect: "manual",
    });

  try {
    let response = await upstreamRequest(STATUS_WRITE_ENDPOINT);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return jsonResponse({ ok: false, error: "The source sheet redirect was invalid." }, 502);
      }
      response = await upstreamRequest(new URL(location, STATUS_WRITE_ENDPOINT).toString());
    }

    const text = await response.text();
    let result: { ok?: boolean; error?: string; row?: number } | null = null;
    try {
      result = JSON.parse(text);
    } catch {
      // An HTML sign-in page or other non-JSON response is not a successful write.
    }

    if (!response.ok || result?.ok !== true) {
      return jsonResponse(
        {
          ok: false,
          error: result?.error || "The source sheet did not accept this status change.",
        },
        response.ok ? 502 : response.status,
      );
    }
    return jsonResponse(result);
  } catch {
    return jsonResponse(
      { ok: false, error: "The source sheet could not be reached. Please try again." },
      502,
    );
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname === "/api/status") {
      return forwardStatusUpdate(request);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
