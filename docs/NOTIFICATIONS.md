# Notifications

Events and who gets them:

| Application status | Candidate | Company members |
| ------------------ | --------- | --------------- |
| `applied` | invite to Stage 1, if the vacancy has an assessment | new applicant |
| `stage1_failed` | Stage 1 result | |
| `stage1_disqualified`, `stage2_disqualified` | session stopped | |
| `stage2_pending` | invite to Stage 2 | |
| `evaluated` | results ready | report ready |
| `shortlisted`, `rejected`, `hired` | status change | |

The worker sends what is due every 30 seconds. A failed send retries after 1 min, 5 min, 30 min and 2 h, then stays `failed`.

## Email
`EMAIL_BACKEND=console` logs messages. For real mail set `EMAIL_BACKEND=smtp`, `SMTP_HOST`, `SMTP_FROM`, and `SMTP_USERNAME` and `SMTP_PASSWORD` if the server needs them. The server must support STARTTLS.

## Telegram
1. Create a bot with @BotFather.
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (without `@`) and `TELEGRAM_WEBHOOK_SECRET` (a random string using only `A-Z a-z 0-9 _ -`). Setting only some of them stops the app from starting.
3. Register the webhook. The URL must be public HTTPS:

```sh
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_API_HOST/api/v1/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message"]'
```

People connect from the settings page.
