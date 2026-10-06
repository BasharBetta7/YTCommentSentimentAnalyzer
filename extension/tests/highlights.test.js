import assert from "node:assert/strict";
import { test } from "node:test";
import { createPageHighlighter, installCommentHighlighter } from "../highlights.js";

function event() {
  const listeners = new Set();
  return {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    emit: (...args) => { for (const fn of listeners) fn(...args); },
  };
}

function setup(execute = async () => {}) {
  const connections = [];
  const statuses = [];
  const injections = [];
  const api = {
    runtime: { lastError: null },
    scripting: { executeScript: (options) => { injections.push(options); return execute(); } },
    tabs: {
      connect(tabId, options) {
        const connection = {
          tabId, options, sent: [], closed: false,
          onMessage: event(), onDisconnect: event(),
          postMessage(message) { this.sent.push(message); },
          disconnect() { this.closed = true; this.onDisconnect.emit(); },
        };
        connections.push(connection);
        return connection;
      },
    },
  };
  return {
    client: createPageHighlighter((message) => statuses.push(message), api),
    connections, statuses, injections,
  };
}

const comments = [{ text: "Great video!", sentiment: "Positive" }];
const videoId = "dQw4w9WgXcQ";

test("injects into the analyzed tab and sends its sampled comments", async () => {
  const { client, connections, injections } = setup();
  await client.connect(42, videoId, comments);
  assert.deepEqual(injections[0].target, { tabId: 42 });
  assert.equal(injections[0].func, installCommentHighlighter);
  assert.equal(connections[0].tabId, 42);
  assert.equal(connections[0].options.name, "comment-pulse-highlights");
  assert.deepEqual(connections[0].sent[0], { type: "set-comments", videoId, comments });
  client.highlight("positive");
  client.highlight(null);
  assert.deepEqual(connections[0].sent.slice(-2), [
    { type: "highlight", sentiment: "positive" }, { type: "clear" },
  ]);
  client.disconnect();
  assert.equal(connections[0].closed, true);
});

test("preserves hover that begins while injection is still pending", async () => {
  let injected;
  const { client, connections } = setup(() => new Promise((resolve) => { injected = resolve; }));
  const pending = client.connect(42, videoId, comments);
  client.highlight("negative");
  injected();
  await pending;
  assert.deepEqual(connections[0].sent.at(-1), { type: "highlight", sentiment: "negative" });
});

test("never opens a late connection after closing the popup", async () => {
  let injected;
  const { client, connections, statuses } = setup(() => new Promise((resolve) => { injected = resolve; }));
  const pending = client.connect(42, videoId, comments);
  client.disconnect();
  injected();
  await pending;
  assert.equal(connections.length, 0);
  assert.deepEqual(statuses, []);
});

test("reports injection failures without breaking the sentiment results", async () => {
  const { client, statuses } = setup(async () => { throw new Error("Cannot access tab"); });
  await client.connect(42, videoId, comments);
  assert.deepEqual(statuses, [{ reason: "unavailable" }]);
});

test("filters delayed counts for sentiments that are no longer active", async () => {
  const { client, connections, statuses } = setup();
  await client.connect(42, videoId, comments);
  client.highlight("positive");
  client.highlight("neutral");
  connections[0].onMessage.emit({ type: "highlight-status", sentiment: "positive", count: 5 });
  connections[0].onMessage.emit({ type: "highlight-status", sentiment: "neutral", count: 2 });
  client.highlight(null);
  connections[0].onMessage.emit({ type: "highlight-status", sentiment: "neutral", count: 3 });
  assert.deepEqual(statuses, [{ type: "highlight-status", sentiment: "neutral", count: 2 }]);
});

test("reanalysis closes the old session and ignores messages from it", async () => {
  const { client, connections, statuses } = setup();
  await client.connect(42, videoId, comments);
  await client.connect(42, videoId, comments);
  assert.equal(connections[0].closed, true);
  connections[0].onMessage.emit({ type: "highlight-status", reason: "video-changed" });
  assert.deepEqual(statuses, []);
  connections[1].onDisconnect.emit();
  assert.deepEqual(statuses, [{ reason: "unavailable" }]);
});

test("rapid consecutive analyses cannot attach an older session", async () => {
  const resolve = [];
  const { client, connections } = setup(() => new Promise((done) => resolve.push(done)));
  const old = client.connect(42, videoId, comments);
  const fresh = client.connect(99, "abcdefghijk", []);
  resolve[1]();
  await fresh;
  resolve[0]();
  await old;
  assert.equal(connections.length, 1);
  assert.equal(connections[0].tabId, 99);
});
