/**
 * Cloudflare Worker — mesbud.com order form endpoint (PRO)
 *
 * Why Worker:
 * - GitHub Pages is static (no server), but Turnstile requires **server-side** validation.
 *
 * Deploy:
 * 1) Create a Turnstile widget for mesbud.com → get SITE KEY + SECRET
 * 2) Deploy this Worker
 * 3) Set env vars (Worker → Settings → Variables):
 *    - TURNSTILE_SECRET (required)
 *    - ALLOWED_ORIGINS (recommended): https://mesbud.com,https://www.mesbud.com
 *    Optional delivery:
 *    - TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *    - WEBHOOK_URL (Zapier/Make/CRM gateway) — POST JSON
 *
 * Route:
 * - mesbud.com/api/order*
 */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

const json = (obj, init = {}) =>
  new Response(JSON.stringify(obj), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });

const parseAllowedOrigins = (env) => {
  const raw = (env.ALLOWED_ORIGINS || "").trim();
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  // secure defaults
  return ["https://mesbud.com", "https://www.mesbud.com"];
};

const corsHeaders = (origin) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
  "vary": "Origin",
});

const safe = (v) => String(v || "").replace(/[\r\n]+/g, " ").trim();
const clamp = (s, max) => safe(s).slice(0, max);

const isEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());

export default {
  async fetch(request, env, ctx) {
    const allowed = parseAllowedOrigins(env);
    const origin = request.headers.get("Origin") || "";

    // CORS / Origin allowlist (PRO)
    const originAllowed = origin && allowed.includes(origin);

    if (request.method === "OPTIONS") {
      if (!originAllowed) return new Response("", { status: 403 });
      return new Response("", { headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "not_found" }, { status: 404 });
    }

    if (!originAllowed) {
      // Do not expose wide CORS
      return json({ ok: false, error: "forbidden_origin" }, { status: 403 });
    }

    const ctype = request.headers.get("Content-Type") || "";
    if (!ctype.toLowerCase().includes("application/json")) {
      return json({ ok: false, error: "content_type" }, { status: 415, headers: corsHeaders(origin) });
    }

    if (!env.TURNSTILE_SECRET) {
      // Protect from running unguarded in production
      return json({ ok: false, error: "turnstile_not_configured" }, { status: 503, headers: corsHeaders(origin) });
    }

    let data;
    try {
      data = await request.json();
    } catch (e) {
      return json({ ok: false, error: "bad_json" }, { status: 400, headers: corsHeaders(origin) });
    }

    // Honeypot (silent drop)
    if (data.website && String(data.website).trim()) {
      return json({ ok: true }, { headers: corsHeaders(origin) });
    }

    // Basic fill-time check (protect from scripted posts)
    const now = Date.now();
    const ts = Number(data.ts || 0);
    if (!ts || now - ts < 2000 || now - ts > 60 * 60 * 1000) {
      return json({ ok: false, error: "bad_ts" }, { status: 400, headers: corsHeaders(origin) });
    }

    // Turnstile verification (server-side)
    const token = String(data["cf-turnstile-response"] || "").trim();
    if (!token) {
      return json({ ok: false, error: "missing_turnstile" }, { status: 400, headers: corsHeaders(origin) });
    }

    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "";

    const form = new URLSearchParams();
    form.set("secret", env.TURNSTILE_SECRET);
    form.set("response", token);
    if (ip) form.set("remoteip", ip);

    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });

    const verify = await verifyRes.json().catch(() => ({}));
    if (!verify.success) {
      return json({ ok: false, error: "turnstile_failed" }, { status: 403, headers: corsHeaders(origin) });
    }

    // Minimal server-side input validation (do NOT store sensitive details)
    const name = clamp(data.name, 120);
    const email = clamp(data.email, 160);
    const message = clamp(data.message, 2500);

    if (name.length < 2 || !isEmail(email) || message.length < 8) {
      return json({ ok: false, error: "invalid_fields" }, { status: 400, headers: corsHeaders(origin) });
    }

    const payload = {
      name,
      role: clamp(data.role, 160),
      company: clamp(data.company, 200),
      email,
      phone: clamp(data.phone, 60),
      service: clamp(data.service, 200),
      message,
      lang: clamp(data.__lang, 8),
      at: new Date().toISOString(),
      ip: clamp(ip, 80),
      ua: clamp(request.headers.get("User-Agent") || "", 220),
      page: clamp(data.__page || "", 200),
    };

    // Delivery option 1: Telegram (simple + reliable)
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      const textLines = [
        "📩 New request (mesbud.com)",
        `Name: ${payload.name}`,
        `Role: ${payload.role}`,
        `Company: ${payload.company}`,
        `Email: ${payload.email}`,
        `Phone: ${payload.phone}`,
        `Service: ${payload.service}`,
        `Message: ${payload.message}`,
        `Lang: ${payload.lang}`,
        `IP: ${payload.ip}`,
      ];
      const text = textLines.join("\n");

      ctx.waitUntil(
        fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text,
            disable_web_page_preview: true,
          }),
        }).catch(() => {})
      );
    }

    // Delivery option 2: Webhook to Zapier/Make/CRM
    if (env.WEBHOOK_URL) {
      ctx.waitUntil(
        fetch(env.WEBHOOK_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => {})
      );
    }

    return json({ ok: true }, { headers: corsHeaders(origin) });
  },
};
