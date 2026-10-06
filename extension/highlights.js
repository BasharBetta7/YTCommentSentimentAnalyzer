const PORT_NAME = "comment-pulse-highlights";

// Chrome copies this function into the tab's isolated world. Keep it self-contained.
export function installCommentHighlighter() {
  if (globalThis.__commentPulseHighlighterInstalled) return;
  globalThis.__commentPulseHighlighterInstalled = true;
  let disposeSession = null;

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "comment-pulse-highlights") return;
    disposeSession?.();

    const attribute = "data-comment-pulse-sentiment";
    const sentiments = ["positive", "neutral", "negative"];
    const highlighted = new Set();
    const labels = new Map();
    let videoId = null;
    let selected = null;
    let scheduled = null;
    let disposed = false;
    let previousCount = -1;
    const style = document.createElement("style");
    style.textContent = `
      [${attribute}] {
        border-radius: 8px !important;
        outline: 2px solid var(--comment-pulse-color) !important;
        outline-offset: 3px !important;
        background-color: var(--comment-pulse-background) !important;
      }
      [${attribute}="positive"] { --comment-pulse-color: #298570; --comment-pulse-background: #29857024; }
      [${attribute}="neutral"] { --comment-pulse-color: #d7ab46; --comment-pulse-background: #d7ab4624; }
      [${attribute}="negative"] { --comment-pulse-color: #dd786b; --comment-pulse-background: #dd786b24; }
    `;
    (document.head || document.documentElement).append(style);

    function normalize(text) {
      return text.normalize("NFC").replace(/\s+/gu, " ").trim();
    }

    function currentVideoId() {
      const url = new URL(location.href);
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.pathname === "/watch") return url.searchParams.get("v");
      if (["shorts", "live", "embed"].includes(parts[0])) return parts[1];
      if (["youtu.be", "www.youtu.be"].includes(url.hostname)) return parts[0];
      return null;
    }

    function send(message) {
      if (!disposed) {
        try { port.postMessage({ type: "highlight-status", ...message }); } catch { dispose(); }
      }
    }

    function removeMarks() {
      for (const node of highlighted) node.removeAttribute(attribute);
      highlighted.clear();
    }

    function clear() {
      observer.disconnect();
      if (scheduled !== null) cancelAnimationFrame(scheduled);
      scheduled = null;
      selected = null;
      previousCount = -1;
      removeMarks();
    }

    function invalidate() {
      clear();
      labels.clear();
      videoId = null;
      send({ reason: "video-changed" });
    }

    function paint() {
      scheduled = null;
      if (!selected || disposed) return;
      if (currentVideoId() !== videoId) { invalidate(); return; }
      removeMarks();

      const texts = document.querySelectorAll(
        "ytd-comment-view-model #content-text, ytd-comment-renderer #content-text, ytm-comment-renderer .comment-text",
      );
      for (const text of texts) {
        // The backend only analyzes top-level comments, never their replies.
        if (text.closest("ytd-comment-replies-renderer, ytm-comment-replies-renderer")) continue;
        const copy = text.cloneNode(true);
        for (const br of copy.querySelectorAll("br")) br.replaceWith(" ");
        for (const image of copy.querySelectorAll("img")) image.replaceWith(image.alt || "");
        if (labels.get(normalize(copy.textContent || "")) !== selected) continue;
        const container = text.closest("ytd-comment-view-model, ytd-comment-renderer, ytm-comment-renderer");
        container.setAttribute(attribute, selected);
        highlighted.add(container);
      }
      if (highlighted.size !== previousCount) {
        previousCount = highlighted.size;
        send({ sentiment: selected, count: highlighted.size });
      }
    }

    const observer = new MutationObserver(() => {
      if (selected && scheduled === null) scheduled = requestAnimationFrame(paint);
    });

    function onMessage(message) {
      if (disposed) return;
      if (message.type === "set-comments") {
        clear();
        labels.clear();
        videoId = message.videoId;
        if (currentVideoId() !== videoId) { invalidate(); return; }
        for (const comment of message.comments || []) {
          if (typeof comment.text !== "string" || typeof comment.sentiment !== "string") continue;
          const text = normalize(comment.text);
          const sentiment = comment.sentiment.trim().toLowerCase();
          if (!text || !sentiments.includes(sentiment)) continue;
          // Conflicting labels for identical text cannot be matched unambiguously.
          labels.set(text, labels.has(text) && labels.get(text) !== sentiment ? null : sentiment);
        }
      } else if (message.type === "highlight" && sentiments.includes(message.sentiment)) {
        clear();
        selected = message.sentiment;
        paint();
        if (selected) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      } else if (message.type === "clear") {
        clear();
      }
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      labels.clear();
      style.remove();
      document.removeEventListener("yt-navigate-start", invalidate);
      window.removeEventListener("popstate", invalidate);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(dispose);
    }

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(dispose);
    document.addEventListener("yt-navigate-start", invalidate);
    window.addEventListener("popstate", invalidate);
    disposeSession = dispose;
  });
}

export function createPageHighlighter(onStatus, api = globalThis.chrome) {
  let port = null;
  let generation = 0;
  let selected = null;

  function disconnect() {
    generation += 1;
    selected = null;
    const previous = port;
    port = null;
    previous?.disconnect();
  }

  function sendSelection() {
    if (!port) return;
    try {
      port.postMessage(selected ? { type: "highlight", sentiment: selected } : { type: "clear" });
    } catch {
      disconnect();
      onStatus({ reason: "unavailable" });
    }
  }

  return {
    disconnect,
    highlight(sentiment) {
      if (selected === sentiment) return;
      selected = sentiment;
      sendSelection();
    },
    async connect(tabId, videoId, comments) {
      disconnect();
      const request = generation;
      try {
        await api.scripting.executeScript({ target: { tabId }, func: installCommentHighlighter });
        if (request !== generation) return;
        const connection = api.tabs.connect(tabId, { name: PORT_NAME });
        port = connection;
        connection.onMessage.addListener((message) => {
          if (port === connection && message.type === "highlight-status"
            && (!message.sentiment || message.sentiment === selected)) onStatus(message);
        });
        connection.onDisconnect.addListener(() => {
          // Read lastError so Chrome doesn't report an unchecked port error.
          void api.runtime.lastError;
          if (port === connection) {
            port = null;
            onStatus({ reason: "unavailable" });
          }
        });
        connection.postMessage({ type: "set-comments", videoId, comments });
        sendSelection();
      } catch {
        if (request === generation) {
          disconnect();
          onStatus({ reason: "unavailable" });
        }
      }
    },
  };
}
