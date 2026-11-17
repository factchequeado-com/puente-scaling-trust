# Notifications: Slack and email

When a question reaches the journalist inbox, the newsroom can be notified on Slack and by email. Each notification includes:
- the question, with phone numbers, emails and ID numbers removed;
- why it was escalated;
- its topics and location;
- the assistant's draft, when there is one;
- the articles it found;
- a link to the inbox.

The person who wrote is never identified: their phone number or channel ID never leaves the server.

**Ajustes > Avisos a la redacción** controls two things:
- **When to notify:** everything that reaches the inbox, only urgent messages, or nothing.
- **Who gets the email:** a list of addresses. Slack posts to the channel chosen when the webhook was created.

The page shows what is configured and has a **test** button. Without configuration, notifications are written to the server log.

Notifications are sent in the background, so a slow mail server never delays the reply to the person.

## Slack

Incoming webhooks work on Slack's free plan.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and select **Create New App > From scratch**. Choose the newsroom's workspace.
2. Under **Incoming Webhooks**, turn them on and select **Add New Webhook to Workspace**. Choose the channel, for example `#bandeja-escucha`.
3. Copy the URL (`https://hooks.slack.com/services/...`) into `SLACK_WEBHOOK_URL` in `backend/.env`, and restart.

The message shows the question, the reason, the topics, the draft and the articles, with an **Abrir la bandeja** button. Urgent messages are marked with 🚨.

## Email

Any SMTP server works. Set these in `backend/.env`:

```
SMTP_HOST=
SMTP_PORT=587
SMTP_USUARIO=
SMTP_CLAVE=
SMTP_REMITENTE=
URL_PUBLICA=https://escucha.yournewsroom.org   # used for the link to the inbox
```

The connection always uses STARTTLS.

### With Google Workspace (recommended if the newsroom already has it)

Google Workspace, including Google Workspace for Nonprofits, can send these notifications with no extra provider. The messages stay within the newsroom's own domain. There are two ways:

**Option A: SMTP relay.** This is the best option for a server. An admin turns it on in **Admin console > Apps > Google Workspace > Gmail > Routing > SMTP relay service**:
- allow either the server's IP address, or authentication with a Workspace account;
- require TLS;
- only allow sending from your domains.

```
SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
SMTP_USUARIO=avisos@yournewsroom.org     # leave empty if you allow the server's IP instead
SMTP_CLAVE=<app password>                # leave empty if you allow the server's IP instead
SMTP_REMITENTE=avisos@yournewsroom.org
```

**Option B: an account with an app password.** This is simpler, and enough for a pilot. The account needs 2-Step Verification, and an admin may have disabled app passwords. Create one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USUARIO=avisos@yournewsroom.org
SMTP_CLAVE=<app password>
SMTP_REMITENTE=avisos@yournewsroom.org
```

Two tips:
- Use a dedicated sending account or alias.
- Send to a **Google Group** (for example `redaccion-escucha@yournewsroom.org`) instead of listing people in Ajustes. Then you manage who receives the emails in Workspace.

Gmail has daily sending limits per account. They are far above what an inbox notifier sends.

### Other providers

Amazon SES, Postmark, Brevo and Resend all offer SMTP. Use them if the newsroom has no Workspace, or wants delivery logs. They are one more company that sees the question text.

## Privacy

A notification is a copy of the question outside the server: in Slack, and in the recipients' mailboxes. That copy is not deleted by «borrar» or when the conversation expires.
- **For the least exposure**, set notifications to *only urgent messages*. Journalists then check the inbox for everything else.
- **Before choosing Slack**, keep in mind that Slack's retention is set in the Slack workspace, not here.
