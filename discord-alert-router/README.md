# Huggins Discord Alert Router v1

Small Node service used as the Stage 1 Discord delivery rail for family, task, command-brief, Rosetta, and trading alerts.

## Endpoints

- `GET /health` — reports service health and which routes are configured.
- `POST /alert` — sends one alert to a configured Discord webhook.

`POST /alert` requires:

```
Authorization: Bearer <ROUTER_TOKEN>
Content-Type: application/json
```

Example body:

```json
{
  "route": "system",
  "title": "SYSTEM TEST",
  "message": "Discord Stage 1 delivery path is working.",
  "severity": "success",
  "source": "Family Command",
  "action": "No action required."
}
```

## Allowed routes

| route | Render environment variable |
| --- | --- |
| system | DISCORD_SYSTEM_TEST_WEBHOOK |
| family | DISCORD_FAMILY_ALERTS_WEBHOOK |
| task | DISCORD_TASK_ALERTS_WEBHOOK |
| command | DISCORD_COMMAND_BRIEFS_WEBHOOK |
| trading | DISCORD_TRADING_ALERTS_WEBHOOK |
| rosetta | DISCORD_ROSETTA_BACKUP_WEBHOOK |

If the selected route does not have its webhook environment variable configured, the service returns `503 route_not_configured`.

## Security

- Discord webhook URLs are secrets.
- Never commit webhook URLs or the router token to GitHub.
- Keep webhook URLs in protected Notion Alert Config and/or protected Render environment variables.
- The alert endpoint rejects calls without the router bearer token.
- Discord mentions are disabled by default in outgoing payloads to prevent accidental @everyone/@role pings.

## Stage 1 validation sequence

1. Create `#system-test` in Discord.
2. Create a webhook for that channel.
3. Store the webhook in the protected Notion Alert Config.
4. Add the same webhook as `DISCORD_SYSTEM_TEST_WEBHOOK` in the Render service environment.
5. Send one test alert through `POST /alert`.
6. Confirm receipt on phone/iPad with audible Discord notification.
7. Repeat for family/task/command routes only after system-test passes.
