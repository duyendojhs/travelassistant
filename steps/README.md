# TravelAssistant Implementation Steps

These files are designed to be run one at a time by an AI agent.

Start each new session from the repository root and give the agent this instruction:

```text
Use the skill at skills/travelassistant-production/SKILL.md.
Execute only steps/NN-step-name.md.
Do not continue to later steps unless I ask.
At the end, give a short report and tell me which API keys or services are needed before the next step.
```

Rules:

- Treat `project_root` as the application root.
- Keep paths in code relative to the project.
- Do not copy broken legacy code from `../ts` or `../UI`.
- Commit no secrets. Use `.env.example` only.
- If an API key is required and missing, implement the interface and stop before live provider calls.

Recommended order:

1. `00-start-here.md`
2. `01-scaffold-foundation.md`
3. `02-config-security.md`
4. `03-database-auth-rbac.md`
5. `04-content-media-api.md`
6. `05-rag-ingestion-qdrant.md`
7. `06-chat-itinerary-streaming.md`
8. `07-voice-image-pipeline.md`
9. `08-frontend-product-ui.md`
10. `09-admin-cms-bi.md`
11. `10-infra-deploy.md`
12. `11-verification-hardening.md`
