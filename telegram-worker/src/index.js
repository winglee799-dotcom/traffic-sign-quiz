const DEFAULT_ALLOWED_ORIGINS = [
  "https://winglee799-dotcom.github.io",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
  "null"
];

function json(body, init = {}, origin = "") {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("access-control-max-age", "86400");
  }
  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function emptyResponse(origin = "") {
  const headers = new Headers();
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("access-control-max-age", "86400");
  }
  return new Response(null, {
    status: 204,
    headers,
  });
}

function normalizeOrigin(origin) {
  return (origin || "").trim();
}

function getAllowedOrigins(env) {
  const raw = String(env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function allowOrigin(requestOrigin, env) {
  const origin = normalizeOrigin(requestOrigin);
  if (!origin) return "";
  const allowed = getAllowedOrigins(env);
  return allowed.includes(origin) ? origin : "";
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function formatWrongQuestions(wrongQuestions = []) {
  if (!wrongQuestions.length) return "无";
  return wrongQuestions
    .slice(0, 20)
    .map((item) => {
      const selected = item.selected || "未答";
      const correct = item.correct || "?";
      return `第${item.id}题：${selected} / 正确${correct}`;
    })
    .join("\n");
}

function buildTelegramMessage(payload) {
  const title = payload.forceSubmit ? "自动交卷结果" : "交卷结果";
  const passText = payload.passed ? "合格" : "未合格";
  const wrongLines = formatWrongQuestions(payload.wrongQuestions);
  const examTime = escapeText(payload.submittedAtLocal || "");
  const page = escapeText(payload.page || "");

  return [
    `【${title}】`,
    `分数：${payload.score}/100`,
    `判定：${passText}`,
    `答对：${payload.correctCount} 题`,
    `答错：${payload.wrongCount} 题`,
    `未答：${payload.unansweredCount} 题`,
    `用时：${payload.usedSeconds || 0} 秒`,
    examTime ? `时间：${examTime}` : "",
    page ? `页面：${page}` : "",
    "",
    "错题：",
    wrongLines,
  ]
    .filter(Boolean)
    .join("\n");
}

async function postToTelegram(env, message) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN secret");
  }
  if (!env.TELEGRAM_CHAT_ID) {
    throw new Error("Missing TELEGRAM_CHAT_ID secret");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        disable_web_page_preview: true,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const description = data.description || `HTTP ${response.status}`;
    throw new Error(`Telegram send failed: ${description}`);
  }

  return data;
}

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("Origin") || "";
    const corsOrigin = allowOrigin(requestOrigin, env);

    if (request.method === "OPTIONS") {
      return emptyResponse(corsOrigin);
    }

    if (request.method !== "POST") {
      return json(
        { ok: false, error: "Method not allowed" },
        { status: 405, headers: { allow: "POST, OPTIONS" } },
        corsOrigin
      );
    }

    if (!corsOrigin) {
      return json(
        { ok: false, error: "Origin not allowed" },
        { status: 403 }
      );
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json(
        { ok: false, error: "Invalid JSON payload" },
        { status: 400 },
        corsOrigin
      );
    }

    const score = Number(payload.score || 0);
    const correctCount = Number(payload.correctCount || 0);
    const wrongCount = Number(payload.wrongCount || 0);
    const unansweredCount = Number(payload.unansweredCount || 0);
    const totalCount = Number(payload.totalCount || 0);
    const usedSeconds = Number(payload.usedSeconds || 0);
    const passed = Boolean(payload.passed);
    const forceSubmit = Boolean(payload.forceSubmit);
    const wrongQuestions = Array.isArray(payload.wrongQuestions)
      ? payload.wrongQuestions
      : [];

    const message = buildTelegramMessage({
      score,
      correctCount,
      wrongCount,
      unansweredCount,
      totalCount,
      usedSeconds,
      passed,
      forceSubmit,
      wrongQuestions,
      submittedAtLocal: payload.submittedAtLocal,
      page: payload.page,
    });

    try {
      await postToTelegram(env, message);
      return json(
        { ok: true, sent: true },
        { status: 200 },
        corsOrigin
      );
    } catch (error) {
      return json(
        { ok: false, error: error instanceof Error ? error.message : "Telegram send failed" },
        { status: 502 },
        corsOrigin
      );
    }
  },
};
