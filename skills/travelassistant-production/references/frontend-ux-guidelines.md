# Frontend UX Guidelines

## Product Shape

TravelAssistant should open as a usable travel assistant, not a long marketing page. The first screen should expose the core product: ask, speak, plan, view sources, and continue to itinerary.

## Low-Scroll Rule

Avoid forcing users through long pages. Use:

- Tabs for major modes: Chat, Voice, Planner, Explore, Saved.
- Stepper/wizard for itinerary creation.
- Drawers for sources, filters, and place details.
- Accordions for citations and long evidence blocks.
- Pagination or virtualized lists for destinations and admin tables.
- Segmented controls for budget, group type, travel style, and retrieval mode.
- Sticky bottom action bars on mobile.

## Modern Visual Direction

- Brand: `TravelAssistant`.
- Tone: clean, practical, trustworthy, image-rich, travel-oriented.
- Palette can borrow teal, sand, white, and soft blue from the old UI, but avoid one-color monotony.
- Use real image slots with stable aspect ratios. Source images from object storage/CDN or safe seed placeholders.
- Use Leaflet/OpenStreetMap for maps first.
- Use lucide icons where appropriate and consistent.
- Use Vietnamese UI copy with valid UTF-8. Do not copy mojibake text.

## Core Screens

- App shell with compact navigation.
- Chat workspace with answer stream, sources drawer, quick actions, feedback.
- Voice workspace with mic control, transcript, step status, TTS playback, text fallback.
- Planner wizard with destination, days, budget, travelers, interests, generated itinerary, map, save/share.
- Explorer with search, filters, card/list toggle, map panel, place details drawer.
- Evidence view for advanced users/admin demo.
- Account area for saved trips, wishlist, preferences.
- Admin dashboard for CMS CRUD, data quality, RAG quality, cost, and event metrics.

## Responsive Rules

- Desktop: two or three panel workspace, minimal page scroll.
- Mobile: one primary task per screen, bottom nav or segmented tabs, sticky action area.
- Keep touch targets at least 44px.
- Prevent text overflow in buttons, cards, nav, chips, and tables.
- Support reduced motion.

## UX Safety

- Always show "data may change" warnings for prices, opening hours, weather, and availability.
- Always show sources for grounded claims.
- Show loading, empty, error, retry, and partial-result states.
- Make disabled and rate-limited states explicit.
- Avoid technical terms on consumer screens unless explained shortly.
