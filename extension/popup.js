import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "./config.js";
import { analyzeVideo, extractVideoId, SENTIMENTS } from "./lib.js";
import { createPageHighlighter } from "./highlights.js";

const element = (id) => document.getElementById(id);
const popup = element("popup");
const button = element("analyze-button");
const sampleSelect = element("max-comments");
let currentVideoId = null;
let currentTabId = null;
let busy = false;
let hoveredSentiment = null;
let activeSentiment = null;
let highlightingUnavailable = false;
const defaultHighlightHint = "Hover over a color to highlight loaded comments.";
const highlighter = createPageHighlighter((message) => {
  if (popup.dataset.state !== "success") return;
  if (message.reason === "video-changed") {
    showState("ready", "The video changed", "Analyze the current video's comments to continue.", "Ready");
  } else if (message.reason === "unavailable") {
    highlightingUnavailable = true;
    element("highlight-hint").textContent = "Page highlighting is unavailable. Refresh YouTube and try again.";
  } else if (Number.isInteger(message.count)) {
    element("highlight-hint").textContent = message.count
      ? `Highlighting ${message.count} loaded ${message.sentiment} ${message.count === 1 ? "comment" : "comments"}.`
      : "No matches loaded. Scroll to comments and choose Newest first.";
  }
});

function updateHighlight() {
  if (popup.dataset.state !== "success") return;
  const focused = document.querySelector(".segment:focus-visible");
  const sentiment = hoveredSentiment || focused?.dataset.sentiment || null;
  for (const name of SENTIMENTS) element(`${name}-segment`).dataset.active = String(name === sentiment);
  if (!highlightingUnavailable && sentiment !== activeSentiment) {
    element("highlight-hint").textContent = sentiment ? `Finding loaded ${sentiment} comments…` : defaultHighlightHint;
  }
  activeSentiment = sentiment;
  highlighter.highlight(sentiment);
}

function resetHighlights() {
  hoveredSentiment = null;
  activeSentiment = null;
  highlighter.disconnect();
  for (const name of SENTIMENTS) element(`${name}-segment`).dataset.active = "false";
}

function showState(state, title, description, badge) {
  if (state !== "success") {
    resetHighlights();
    element("highlight-hint").textContent = "Percentages reflect the sampled comments.";
  }
  popup.dataset.state = state;
  element("results").hidden = state !== "success";
  element("state-panel").hidden = state === "success";
  element("status-badge").textContent = badge;
  element("state-title").textContent = title;
  element("state-description").textContent = description;
  element("button-label").textContent = state === "loading" ? "Analyzing comments…"
    : state === "error" ? "Try again" : state === "success" || state === "empty" ? "Analyze again" : "Analyze comments";
  const disabled = state === "loading" || !currentVideoId;
  button.disabled = disabled;
  sampleSelect.disabled = disabled;
  popup.setAttribute("aria-busy", String(state === "loading"));
}

function showReady() {
  showState("ready", "What's the mood in the comments?",
    "Analyze a sample to see how the conversation feels.", "Ready");
}

async function readCurrentVideo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;
  currentVideoId = extractVideoId(tab?.url);
  const title = currentVideoId ? (tab.title || "YouTube video").replace(/\s*[-–—|]\s*YouTube$/, "") : "Open a YouTube video";
  element("video-title").textContent = title;
  element("video-title").title = title;
  element("video-id").textContent = currentVideoId ? `VIDEO / ${currentVideoId}` : "Watch pages, Shorts, and live videos supported";
  if (!currentVideoId) {
    showState("unavailable", "Your next video starts here",
      "Open a video on YouTube, then click this extension to analyze its comments.", "No video");
  }
  return currentVideoId;
}

function renderSummary(summary) {
  if (!summary.total) {
    showState("empty", "No comments to analyze yet",
      "This video has no available comments. Try another video or check back later.", "No comments");
    return;
  }
  const leaders = SENTIMENTS.filter((name) => summary.counts[name] === Math.max(...Object.values(summary.counts)));
  const title = leaders.length === 1 ? `${leaders[0][0].toUpperCase()}${leaders[0].slice(1)} leads` : "A mixed conversation";
  element("result-title").textContent = title;
  element("sample-count").textContent = `${summary.total} recent ${summary.total === 1 ? "comment" : "comments"} analyzed`;
  const descriptions = [];
  for (const name of SENTIMENTS) {
    const percent = `${summary.percentages[name]}%`;
    const count = summary.counts[name];
    element(`${name}-segment`).style.width = percent;
    element(`${name}-segment`).title = `Highlight ${name} comments: ${percent} (${count})`;
    element(`${name}-segment`).disabled = count === 0;
    element(`${name}-segment`).setAttribute("aria-label", `${name}: ${percent}, ${count} comments. Highlight matching comments.`);
    element(`${name}-percentage`).textContent = percent;
    element(`${name}-count`).textContent = `${count} ${count === 1 ? "comment" : "comments"}`;
    descriptions.push(`${name}: ${percent}`);
  }
  element("sentiment-bar").setAttribute("aria-label", descriptions.join(", "));
  showState("success", "", "", "Complete");
  highlightingUnavailable = false;
  element("highlight-hint").textContent = defaultHighlightHint;
  void highlighter.connect(currentTabId, currentVideoId, summary.comments);
}

async function analyze() {
  if (busy) return;
  busy = true;
  button.disabled = true;
  sampleSelect.disabled = true;
  try {
    // YouTube navigates without full page reloads, so read the URL for every request.
    const videoId = await readCurrentVideo();
    if (!videoId) return;
    const maxComments = Number(sampleSelect.value);
    showState("loading", "Reading the room…",
      `Fetching and analyzing up to ${maxComments} comments. Keep this popup open while it runs.`, "Analyzing");
    const summary = await analyzeVideo(videoId, maxComments, {
      baseUrl: API_BASE_URL,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    // Never show a completed result against a different video's title.
    if (await readCurrentVideo() !== videoId) {
      if (currentVideoId) showReady();
      return;
    }
    renderSummary(summary);
  } catch (error) {
    showState("error", "We couldn't finish the analysis", error.message, "Try again");
  } finally {
    busy = false;
  }
}

for (const name of SENTIMENTS) {
  const segment = element(`${name}-segment`);
  segment.addEventListener("pointerenter", () => {
    if (segment.disabled) return;
    hoveredSentiment = name;
    updateHighlight();
  });
  segment.addEventListener("pointerleave", () => { hoveredSentiment = null; updateHighlight(); });
  segment.addEventListener("focus", updateHighlight);
  segment.addEventListener("blur", () => queueMicrotask(updateHighlight));
}
window.addEventListener("blur", () => {
  hoveredSentiment = null;
  activeSentiment = null;
  if (popup.dataset.state === "success" && !highlightingUnavailable) element("highlight-hint").textContent = defaultHighlightHint;
  highlighter.highlight(null);
  for (const name of SENTIMENTS) element(`${name}-segment`).dataset.active = "false";
});
// The tab's port disconnect handler also clears marks when Chrome destroys the popup.
window.addEventListener("pagehide", () => highlighter.disconnect());

button.addEventListener("click", analyze);
sampleSelect.addEventListener("change", showReady);

try {
  if (await readCurrentVideo()) showReady();
} catch {
  element("video-title").textContent = "Open a YouTube video";
  element("video-id").textContent = "Active tab unavailable";
  showState("unavailable", "Open this from the Chrome toolbar",
    "Load Comment Pulse as an extension, then open it on a YouTube video.", "No video");
}
