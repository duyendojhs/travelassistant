# Step 08 - Frontend Product UI

## Goal

Build the modern TravelAssistant user experience with minimal scrolling and real app workflows.

## Required Env Before Running

In frontend local env:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_NAME=TravelAssistant
NEXT_PUBLIC_MAP_PROVIDER=osm
```

If using Mapbox:

```env
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=...
```

## Scope

Build screens:

- App shell with compact navigation.
- Chat workspace with streaming answer, source drawer, quick actions, and feedback.
- Voice workspace with mic control, transcript, status stepper, answer, citations, TTS playback, and text fallback.
- Planner wizard with step transitions instead of long forms.
- Explorer with search, filters, card/list toggle, map panel, and detail drawer.
- Evidence view with tabs/accordions for chunks, sources, graph, and final answer.
- Auth screens.
- Saved trips, wishlist, and preferences.

Design rules:

- Use `TravelAssistant` branding.
- Rewrite all Vietnamese copy correctly in UTF-8. Do not copy mojibake.
- Borrow only high-level token ideas from old UI.
- Avoid long landing pages. The first screen should be a usable assistant.
- Use stable responsive dimensions and avoid text overflow.
- Use real loading, error, empty, disabled, and rate-limited states.

## Validation

Run:

```powershell
npm run typecheck
npm run lint
npm run build
```

If a dev server can be started, verify with browser automation:

- Desktop viewport.
- Mobile viewport.
- Main chat flow.
- Planner wizard.
- Source drawer.
- No obvious overlap or excessive scrolling.

## End Report

Report screens built, checks run, screenshots/browser checks if available, and any backend endpoint gaps.

## API Key Notice For Next Step

Step 09 does not require AI keys. It needs an admin/root user in the local database and backend running.
