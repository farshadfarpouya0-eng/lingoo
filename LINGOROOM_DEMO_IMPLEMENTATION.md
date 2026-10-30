# LingoRoom Demo

- Added a teacher-only `/dashboard/lingoroom-demo` route and dashboard entry.
- Replaced the old Persian-only device-check panel with an English LingoRoom-style practice environment.
- The demo includes a simulated student tile and local-only chat, a drawable whiteboard, speaking/writing practice prompts, local camera and microphone permission checks, speaker tone test, browser screen-share preview, and published textbook/lesson/audio previews.
- The demo does not create a lesson, booking, payment, student chat, or classroom workspace record. Demo chat, board marks, and practice responses remain in client state for the current browser session.
- Added a narrowly scoped `demo=1` asset-access path for authenticated teachers only; it still requires the material to be published. Existing booked-class asset authorization remains unchanged.
- Real-time remote video/participant connections are intentionally not simulated as live. The student tile and chat are clearly marked as simulated.
