# Google Calendar Setup — Secure Cleaning Aus

## Goal
Write booking follow-up events into the Secure Cleaning Aus Google Calendar.

## Current state
The codebase now includes a Google Calendar helper, but it still needs OAuth completion:
- Client ID
- Client Secret
- Refresh Token
- Calendar ID

## Recommended setup
Use the Google account that owns `info@securecleaning.au`.

## Steps
1. Go to Google Cloud Console
2. Create or select a project
3. Enable the Google Calendar API
4. Configure OAuth consent screen
5. Create OAuth Client Credentials
6. Capture:
   - `GOOGLE_CALENDAR_CLIENT_ID`
   - `GOOGLE_CALENDAR_CLIENT_SECRET`
7. Complete one OAuth authorization flow to obtain a refresh token
8. Set:
   - `GOOGLE_CALENDAR_REFRESH_TOKEN`
   - `GOOGLE_CALENDAR_ID=info@securecleaning.au`

## Notes
- The current app does not yet offer client-facing slot booking with live availability.
- The present integration is best used as an internal follow-up / inspection scheduling helper.
- Once we build inspector slot management, this calendar integration will become the write layer for actual appointments.
