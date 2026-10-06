import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeVideo, extractVideoId, summarizeSentiments } from "../lib.js";

const videoId = "dQw4w9WgXcQ";
const baseUrl = "http://127.0.0.1:8000";
const comment = (sentiment) => ({ text: "A comment", sentiment });
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

test("recognizes supported YouTube video URLs", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${videoId}&t=43`,
    `https://youtube.com/watch?list=example&v=${videoId}`,
    `https://m.youtube.com/watch?v=${videoId}`,
    `https://music.youtube.com/watch?v=${videoId}`,
    `https://www.youtube.com/shorts/${videoId}?feature=share`,
    `https://www.youtube.com/live/${videoId}`,
    `https://www.youtube.com/embed/${videoId}`,
    `https://www.youtube-nocookie.com/embed/${videoId}`,
    `https://youtu.be/${videoId}?si=example`,
  ]) assert.equal(extractVideoId(url), videoId, url);
  assert.equal(extractVideoId("https://youtu.be/a_b-cD12345"), "a_b-cD12345");
});

test("rejects other sites, invalid IDs, and pages without a video", () => {
  for (const url of [
    undefined, "", "not a url", "chrome://extensions/",
    `https://youtube.com.example.org/watch?v=${videoId}`,
    `https://example.org/watch?v=${videoId}`,
    `https://youtube.com@evil.example/watch?v=${videoId}`,
    `ftp://youtube.com/watch?v=${videoId}`,
    "https://youtube.com/", "https://youtube.com/playlist?list=example",
    "https://youtube.com/watch?v=short", "https://youtube.com/watch?v=1234567890!",
    `https://youtu.be/${videoId}/extra`, `https://youtube.com/results?v=${videoId}`,
  ]) assert.equal(extractVideoId(url), null, String(url));
});

test("uses the returned sample as denominator and accepts backend label casing", () => {
  assert.deepEqual(summarizeSentiments([
    comment("Positive"), comment(" positive "), comment("Neutral"), comment("Negative"),
  ]), {
    total: 4, counts: { positive: 2, neutral: 1, negative: 1 },
    percentages: { positive: 50, neutral: 25, negative: 25 },
  });
});

test("empty samples never produce NaN", () => {
  assert.deepEqual(summarizeSentiments([]), {
    total: 0, counts: { positive: 0, neutral: 0, negative: 0 },
    percentages: { positive: 0, neutral: 0, negative: 0 },
  });
});

test("rounding sums to 100% within 0.1 percentage points for sample sizes 1–100", () => {
  for (let total = 1; total <= 100; total += 1) {
    for (let positive = 0; positive <= total; positive += 1) {
      const negative = Math.floor((total - positive) / 2);
      const neutral = total - positive - negative;
      const comments = [
        ...Array(positive).fill(comment("Positive")),
        ...Array(neutral).fill(comment("Neutral")),
        ...Array(negative).fill(comment("Negative")),
      ];
      const { percentages, counts } = summarizeSentiments(comments);
      assert.ok(Math.abs(Object.values(percentages).reduce((a, b) => a + b, 0) - 100) < 1e-9);
      for (const name of Object.keys(counts)) {
        assert.ok(Math.abs(percentages[name] - counts[name] / total * 100) < 0.10000001);
        if (!counts[name]) assert.equal(percentages[name], 0);
      }
    }
  }
});

test("invalid responses cannot silently change the statistics", () => {
  assert.throws(() => summarizeSentiments(null), /comments list/);
  for (const item of [null, {}, comment(2), comment("LABEL_2"), comment("unknown")]) {
    assert.throws(() => summarizeSentiments([item]), /unsupported sentiment/);
  }
});

test("posts the API contract and returns the sentiment summary", async () => {
  const summary = await analyzeVideo(videoId, 25, {
    baseUrl: `${baseUrl}/`,
    fetchImpl: async (url, options) => {
      assert.equal(url, `${baseUrl}/analyze`);
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), { video_id: videoId, max_comments: 25 });
      assert.equal(options.credentials, "omit");
      return response({ video_id: videoId, comments: [comment("Negative")] });
    },
  });
  assert.equal(summary.percentages.negative, 100);
  assert.equal(summary.total, 1);
  assert.deepEqual(summary.comments, [comment("Negative")]);
});

test("validates input before making a request", async () => {
  const options = { baseUrl, fetchImpl: () => assert.fail("Must not fetch invalid input") };
  await assert.rejects(analyzeVideo("bad", 25, options), /valid YouTube video/);
  for (const size of [0, 101, 1.5, "25"]) {
    await assert.rejects(analyzeVideo(videoId, size, options), /between 1 and 100/);
  }
});

test("reports an unreachable backend", async () => {
  await assert.rejects(analyzeVideo(videoId, 100, {
    baseUrl, fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
  }), /Cannot reach the backend at http:\/\/127.0.0.1:8000/);
});

test("reports server and validation errors without rendering server HTML", async () => {
  await assert.rejects(analyzeVideo(videoId, 100, {
    baseUrl, fetchImpl: async () => new Response("<h1>Internal Server Error</h1>", { status: 500 }),
  }), /could not analyze this video \(500\)/);
  await assert.rejects(analyzeVideo(videoId, 100, {
    baseUrl, fetchImpl: async () => response({ detail: "Comments are disabled." }, 403),
  }), /Comments are disabled/);
  await assert.rejects(analyzeVideo(videoId, 100, {
    baseUrl, fetchImpl: async () => response({ detail: [{ msg: "Invalid input" }] }, 422),
  }), /rejected the request \(422\)/);
});

test("rejects malformed JSON and results for another video", async () => {
  await assert.rejects(analyzeVideo(videoId, 100, {
    baseUrl, fetchImpl: async () => new Response("not JSON"),
  }), /invalid JSON/);
  await assert.rejects(analyzeVideo(videoId, 100, {
    baseUrl, fetchImpl: async () => response({ video_id: "abcdefghijk", comments: [] }),
  }), /different video/);
});

test("aborts a stalled request with a useful message", async () => {
  await assert.rejects(analyzeVideo(videoId, 25, {
    baseUrl, timeoutMs: 10,
    fetchImpl: (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  }), /Analysis timed out/);
});
