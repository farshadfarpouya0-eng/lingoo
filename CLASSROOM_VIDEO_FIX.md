# Classroom video repair — authenticated embedded rooms

## Diagnosis

The screenshots show three related symptoms:

1. `meet.jit.si` disconnects embedded meetings after five minutes. This is a public-service policy, not a camera error or a timeout that can responsibly be removed with a client configuration flag.
2. The browser blocks a separate Jitsi login popup.
3. Students wait for a moderator because the old integration issued no authenticated moderator identity.

The previous client also marked the room `Connected` after a 2.2-second timer, even if the provider had not admitted the participant. Switching to the whiteboard unmounted the video mount node without disposing its API instance.

## Source changes

- Removed anonymous `meet.jit.si` embedding and its CSP/permissions allowances. Missing provider configuration now produces an actionable setup state, not a demo call or a fabricated successful connection.
- Added 8x8 JaaS RS256 authentication and an alternative HS256 integration for a private, JWT-protected Jitsi deployment.
- Added `POST /api/lessons/[id]/video-token`. Every request rechecks the authenticated user, active lesson membership, suspension, lesson window, selected platform and admin sandbox restriction.
- The teacher (or an admin in a designated test lesson) receives moderator permission. Students never receive moderator permission from a browser-supplied flag.
- JWTs are scoped to one room, expire after at most 15 minutes (or the lesson grace boundary), and are returned with `private, no-store`. Signing keys are never sent to the browser.
- Provider credentials entered in Admin → Integrations use the existing AES-256-GCM encrypted settings storage. Environment variables are also supported.
- Connection status now waits for `videoConferenceJoined`; loading and authorization have timeouts and retry controls. Camera/microphone errors have separate guidance.
- The video iframe stays mounted while the whiteboard is open. Leave/unmount disposes the API instance.
- The account name is used as the verified meeting identity; no separate Jitsi login is opened.
- Daily, Google Meet and Zoom remain alternative classroom choices. Daily continues to use its own private, owner-aware meeting tokens.

No schema change or new migration is required. Existing lessons that selected `lingo` use the new token flow after deployment and provider setup. Other lesson data is untouched.

## Operator setup — recommended JaaS

1. Create an application and an RSA API key in the official 8x8 JaaS console: https://jaas.8x8.vc/. Confirm the account/plan permits your intended embedded usage. This code cannot create or activate a provider account for you.
2. Keep `INTEGRATION_ENCRYPTION_KEY` (or the existing stable `SESSION_SECRET` fallback) configured. Do not rotate it without re-encrypting saved settings.
3. In Admin → Integrations → Video rooms, choose **8x8 JaaS** and enter:
   - App ID: the complete `vpaas-magic-cookie-...` identifier.
   - API key ID: the key identifier (`kid`) shown by the console; a full `appId/keyId` is also accepted.
   - Private key: the matching downloaded RSA PEM private key, including BEGIN/END lines. Never use a wallet private key.
4. Save and run **Test connection**. This checks the signing configuration and external API reachability; it is not a live media or billing-entitlement test.
5. Open an eligible test lesson as teacher and student in separate browser sessions. Verify both identities, teacher moderation, audio, camera, screen sharing, reconnection and a call longer than five minutes.

Environment alternative:

- `VIDEO_PROVIDER=jaas`
- `JAAS_APP_ID`
- `JAAS_API_KEY_ID`
- `JAAS_PRIVATE_KEY` (PEM; escaped `\n` line breaks are supported)

Saved admin settings take precedence over environment values, matching the existing integration system. Remove a saved credential to use its environment fallback. Keep `VIDEO_PROVIDER` consistent with the credentials; an incomplete explicit provider fails closed rather than falling back to a public room.

## Alternative — your own Jitsi server

Use your own HTTPS Jitsi deployment, not the public demo. Configure Prosody JWT authentication (`token_verification`), `allow_empty_token=false`, the matching JWT application ID/secret, and `token_affiliation` (or an equivalent token moderation plugin). Disable `muc_allowners` / automatic first-join owner behavior so students cannot be promoted merely for arriving first. Anonymous guests must not bypass the intended access policy. Self-hosted tokens use boolean moderator values and owner/member affiliation; JaaS uses its documented string moderator claim.

Set `VIDEO_PROVIDER=self-hosted`, `JITSI_DOMAIN`, `JITSI_APP_ID`, and `JITSI_APP_SECRET` (32+ characters), or save these in the admin card. **Also set `JITSI_DOMAIN` in the hosting environment and rebuild/redeploy** so the static CSP and Permissions-Policy headers permit your hostname. The admin database setting alone cannot change those build-time headers.

## Existing Daily alternative

The teacher can select the existing Daily classroom when the administrator has configured `DAILY_API_KEY`, `DAILY_DOMAIN`, and `RECORDING_PROVIDER=daily`. Recording additionally requires provider entitlement, webhook registration and participant consent. Daily is not silently substituted for Jitsi and is not configured by this repair.

## Verification boundary

A real provider account/key was not supplied in this sandbox. Automated checks can verify token signatures, room scope, roles, configuration validation and blocked access; a two-browser live media test still requires valid provider credentials. Do not interpret a successful application build as proof of a live video call.

No GitHub push, hosted database migration, production credential change or live deployment was performed by this source repair.

## References

- https://developer.8x8.com/jaas/docs/api-keys-jwt/
- https://developer.8x8.com/jaas/docs/faq/
- https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/
- https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe-events/
- https://community.jitsi.org/t/important-embedding-meet-jit-si-in-your-web-app-will-no-longer-be-supported-please-use-jaas/123003
