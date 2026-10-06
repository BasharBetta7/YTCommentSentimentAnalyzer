const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const SENTIMENTS = ["positive", "neutral", "negative"];

export function extractVideoId(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(url.protocol)) return null;

  const host = url.hostname;
  const parts = url.pathname.split("/").filter(Boolean);
  let id = null;
  if (["youtu.be", "www.youtu.be"].includes(host) && parts.length === 1) {
    id = parts[0];
  } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (["shorts", "live", "embed"].includes(parts[0]) && parts.length === 2) id = parts[1];
  } else if (["youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)
    && parts[0] === "embed" && parts.length === 2) {
    id = parts[1];
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

export function summarizeSentiments(comments) {
  if (!Array.isArray(comments)) throw new Error("The backend response is missing its comments list.");
  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const comment of comments) {
    const sentiment = typeof comment?.sentiment === "string" ? comment.sentiment.trim().toLowerCase() : "";
    if (!SENTIMENTS.includes(sentiment)) {
      throw new Error("The backend returned an unsupported sentiment label.");
    }
    counts[sentiment] += 1;
  }

  // Allocate tenths of a percent so the displayed percentages sum to 100.0%.
  const total = comments.length;
  const shares = SENTIMENTS.map((name) => {
    const scaled = total ? counts[name] * 1000 / total : 0;
    return { name, tenths: Math.floor(scaled), remainder: scaled - Math.floor(scaled) };
  });
  let remaining = total ? 1000 - shares.reduce((sum, share) => sum + share.tenths, 0) : 0;
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (remaining-- > 0) share.tenths += 1;
  }
  const percentages = Object.fromEntries(shares.map(({ name, tenths }) => [name, tenths / 10]));
  return { total, counts, percentages };
}

export async function analyzeVideo(videoId, maxComments, {
  baseUrl,
  timeoutMs = 90_000,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!VIDEO_ID.test(videoId ?? "")) throw new Error("Open a valid YouTube video first.");
  if (!Number.isInteger(maxComments) || maxComments < 1 || maxComments > 100) {
    throw new Error("Choose between 1 and 100 comments.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, max_comments: maxComments }),
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = typeof body?.detail === "string" ? body.detail.slice(0, 240) : null;
      if (response.status >= 500) {
        throw new Error(`The backend could not analyze this video (${response.status}). Check the server logs and try again.`);
      }
      throw new Error(detail || `The backend rejected the request (${response.status}). Try another video.`);
    }
    const data = await response.json().catch(() => {
      throw new Error("The backend returned an invalid JSON response.");
    });
    if (data?.video_id !== videoId) throw new Error("The backend returned results for a different video. Please retry.");
    return { ...summarizeSentiments(data.comments), comments: data.comments };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Analysis timed out. Try a smaller comment sample or check the backend.");
    }
    if (error instanceof TypeError) {
      throw new Error(`Cannot reach the backend at ${baseUrl}. Make sure your FastAPI server is running.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
