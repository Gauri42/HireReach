# HireReach

> Reach the right HR, faster.

HireReach is a Chrome extension that helps you send personalised LinkedIn messages (with an optional file such as your resume) to HR and recruiter connections, one chat at a time, right from your Connections page.

![logo](icons/icon128.png)

## Features

- **Filter by job title**: scan your connections and pick the ones whose headline matches (HR, Recruiter, Talent Acquisition and more). You can add your own keywords.
- **Pick people**: search, select all or clear, and review the matches before anything is sent.
- **Personalised message**: write once, `{firstName}` is replaced for each person, with a live preview.
- **File attachment**: attach a resume, PDF or image (up to 20 MB). It is added to every chat.
- **Send & Next**: opens each chat, fills the message, attaches the file and presses Send for you.
- **Skips recent chats**: people you messaged in the last 2 days (or whose chat has a Today/Yesterday message) are tagged and skipped.
- **Safe fallbacks**: if a chat box cannot be filled, a Copy message button lets you paste it yourself.

## Install (unpacked)

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Open <https://www.linkedin.com/mynetwork/invite-connect/connections/> and refresh the page.

## How to use

1. Click the **HireReach** button at the bottom of the page.
2. **Filter**: choose job titles and click **Scan connections**.
3. **Matches**: tick the people you want to message.
4. **Message**: write your message, optionally click **Attach** to add a file.
5. **Send**: click **Send & Next**. HireReach sends the message and opens the next chat.

Use **Skip** to leave someone out and **Stop** to end the run at any time.

## Notes

- Keep to roughly 20-30 messages per day. LinkedIn may restrict accounts that send too many messages.
- The attached file is kept until you refresh the page.
- LinkedIn changes its page structure from time to time. If a chat box is not found, open the browser console and look for the `[HireReach] message box not found` warning.
- This project is not affiliated with or endorsed by LinkedIn. Use it responsibly and in line with LinkedIn's terms.

## Project structure

```
hirereach/
  manifest.json   Chrome extension manifest (MV3)
  content.js      UI panel and all logic (runs on LinkedIn)
  icons/          Extension icons and logo
```
