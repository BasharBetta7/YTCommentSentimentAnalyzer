# Comment Pulse

A Chrome Manifest V3 popup for the YouTube comment sentiment backend. It reads the
active video's URL, requests a sample, and shows a stacked sentiment bar with
positive, neutral, and negative percentages and counts.

## Run locally

1. Start the existing backend **from the `YTCommentSentimentAnalyzer` directory**,
   using the Python environment with your backend/model dependencies installed:

   ```bash
   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
   ```

   The backend needs `YT_API_KEY` in your environment or project `.env`, plus its
   local checkpoint, tokenizer, vectorizer, and NLTK resources. Keep the API key on
   the backend. The extension does not need it.

2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
   and select this `extension` directory. No build or npm install step is needed.
3. Pin **Comment Pulse** in Chrome's toolbar. Open a YouTube video and click it.
4. Choose 25, 50, or 100 recent comments and click **Analyze comments**. Keep the
   popup open until the request completes. Closing it discards the current view;
   reopening it lets you request a new analysis.
5. Hover over a sentiment's bar segment to highlight matching comments on YouTube
   in the same color. You can also use Tab to focus a segment. Moving away or
   closing the popup clears the highlights.

Highlights apply to analyzed top-level comments currently loaded on the page.
Scroll to the comments and select **Newest first** before opening the extension
for the best overlap with the backend's recent-comment sample. New comments added
by YouTube are matched while a segment is active. The backend supplies comment text,
so matching normalizes whitespace and Unicode, preserves emoji, and excludes
replies. Identical text with conflicting labels is left unmarked.

After updating an existing installation, click **Reload** for Comment Pulse on
`chrome://extensions` to load the added `scripting` permission.

Watch, Shorts, live, embed, and `youtu.be` video URLs are recognized. YouTube home,
search, playlist, and channel pages do not trigger requests. The URL is checked
again on each analysis and before rendering its result to handle YouTube navigation.

## Backend connection

`config.js` defaults to `http://127.0.0.1:8000` with a 90-second timeout. Change
`API_BASE_URL` to use another backend. For a different host or HTTPS, also update
`host_permissions` in `manifest.json`, then reload the extension.

The popup uses the existing API contract:

```http
POST /analyze
Content-Type: application/json

{"video_id":"dQw4w9WgXcQ","max_comments":100}
```

```json
{
  "video_id": "dQw4w9WgXcQ",
  "comments": [
    {"text": "Great video!", "sentiment": "Positive"},
    {"text": "Thanks for sharing.", "sentiment": "Neutral"},
    {"text": "I disagree.", "sentiment": "Negative"}
  ]
}
```

Percentages use the **number of returned comments**, which can be smaller than the
requested sample. They are rounded to tenths with a total of 100%. An empty list
displays an empty state. Unexpected sentiment labels or mismatched video IDs display
an error. The backend samples recent top-level comments; these percentages do not
include all comments or replies.

API requests run from the popup using Chrome's host permissions. `activeTab` gives
access to the current URL and title. The added `scripting` permission installs an
isolated comment highlighter on that tab after analysis. A connection to the popup
clears highlights and disconnects observers when the popup closes or the video
changes. See Chrome's official
[scripting documentation](https://developer.chrome.com/docs/extensions/reference/api/scripting),
[activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
and [network request documentation](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

## Tests

With Node.js 20 or newer, run these dependency-free tests from this directory:

```bash
npm test
```

Manual checks with the backend running:

- A YouTube watch page or Short shows its current title and video ID.
- Analysis shows three percentages totaling 100%, plus sample counts.
- Hovering or keyboard-focusing a bar segment highlights only matching sampled
  comments in that sentiment's color; moving away clears them.
- Closing the popup, reanalyzing, or navigating videos removes page highlights.
- A video with no returned comments shows an empty state.
- A non-video tab disables analysis.
- Stopping the backend produces a clear error; restarting it allows a retry.
- Navigating to another video before clicking Analyze uses the new video ID.

For HTTP 500, inspect the backend logs. The popup cannot distinguish a YouTube API
error (including disabled comments or quota errors) from an inference failure when
the backend returns the same generic 500 response for them.
