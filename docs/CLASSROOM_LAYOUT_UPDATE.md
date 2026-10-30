# Classroom layout update

- Reused the existing `/classroom/[id]` route and existing `ClassroomLive` / `LingoRoom` call flow.
- Reorganized the classroom page so the live room is the primary panel and the textbook/whiteboard/practice workspace sits beside it on wide screens.
- On smaller screens the two panels stack for responsive use.
- This is a layout integration only. Real two-way video depends on the configured `joinUrl` provider/service and the browser's camera/microphone permissions. It does not replace or newly implement a WebRTC signaling service.
- Build/typecheck have not been verified in this environment; test with two separate accounts before deployment.
