# Leak Lock · Pitch MVP

Leak Lock helps people avoid spoilers and unwanted content while keeping the rest of their feed open.

## The experience

- Choose a topic or add words and phrases you want to filter.
- Hide matching posts, comments, and Reels on supported Reddit and Instagram pages.
- Reveal content when you choose, pause filtering, or allow a creator.
- Keep your preferences on your device, with no account required.

## Demo flow

1. Open Leak Lock, enable a filter, and refresh the feed.
2. In **Settings**, turn on **Demo controls**.
3. Hover over a post or Reel and click the eye-off icon. It shows **Locked** with a soft blur effect. Reddit uses a compact card; Instagram Reels keep their original size.
4. Choose **Undo hide** to restore it.

Demo controls are off by default. Manual locks follow the same post or Reel when you scroll away and back during the current page session. Undo or turning demo controls off clears them. Refreshing the page starts a new demo session. Automatic and demo locks share the same soft blur look and “Locked” label. Reddit uses compact cards; Reels retain their original size.

To run the prepared extension, open `chrome://extensions`, enable Developer mode, and load the sibling `../extension` folder. Reload the extension and refresh your tabs after an update.

## Prototype scope

This MVP demonstrates the filtering experience for a pitch. It currently uses available text, captions, and hashtags. It does not analyze video, audio, or text embedded in images, and it does not yet turn a natural-language request into a complete topic filter.
