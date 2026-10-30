# LeakLock · Minh’s MVP demo

A separate pitch demo of LeakLock. The original extension at the repository root stays unchanged.

## Try it

1. Download this repository and open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**, choose **Load unpacked**, and select the `extension` folder inside `LeakLock (Minh) version`.
3. Open **Your filters**, enable a filter, and refresh Reddit or Instagram.
4. For a manual demo, turn on **Settings → Demo controls**. Hover over a post or Reel and click the eye-off icon to show **Locked**. Choose **Undo hide** to restore it.

Reddit locks use compact cards; Reels keep their original size. Manual locks stay in place when you scroll away and back during the current page session. Refreshing starts a new demo session.

## Scope

This is an MVP for pitching. Automatic filtering uses available text, captions, hashtags, and page metadata. It does not analyze video or audio and does not yet generate filters from natural-language requests.

The ready-to-load build is in `extension/`; editable source is in `source/`. To rebuild after source changes, run `npm ci` and `npm run build` from `source/` using Node.js 22 or later.
