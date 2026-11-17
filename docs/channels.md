# Channels: WhatsApp, Messenger and Instagram

The web chat (`/chat`) works out of the box. WhatsApp, Messenger and Instagram connect through Meta's platform, using one webhook for all three: `https://<your-server>/webhooks/meta`.

Each person gets one conversation per channel, processed by the same pipeline as the web chat. The person's identifier (a phone number for WhatsApp, a page-scoped ID for Messenger and Instagram) is stored only while the conversation exists. It is deleted when the conversation expires (a week after the last message), or immediately when the person writes «borrar».

When a journalist answers an escalated question, the answer is sent back on the same channel.

## Test mode

You can try the full flow without any Meta credentials:
- **Without tokens**, outgoing messages are written to the server log instead of being sent.
- **Without `META_APP_SECRET`**, webhook signatures are not checked. A warning is logged; never run like this in production.

```bash
curl -s localhost:8000/webhooks/meta -H 'Content-Type: application/json' -d '{
  "object": "whatsapp_business_account",
  "entry": [{"changes": [{"value": {"messages": [
    {"from": "15550001111", "type": "text", "text": {"body": "¿Es cierto que California manda 7 boletas a los demócratas?"}}
  ]}}]}]
}'
```

The log then shows `[whatsapp, modo de prueba] a 1555…:` followed by the reply and the cited article.

## 1. Create a Meta app

1. Go to [developers.facebook.com](https://developers.facebook.com/apps), create an app of type **Business** and link it to the newsroom's Business portfolio.
2. In **App settings > Basic**, copy the **App secret** into `META_APP_SECRET`.
3. Choose a long random **verify token** and put it in `META_VERIFY_TOKEN`. You will paste the same value in Meta.
4. Restart the server.

## 2. WhatsApp (Cloud API)

1. In the app, add the **WhatsApp** product.
2. Under **WhatsApp > API Setup**, copy the **Phone number ID** into `WHATSAPP_PHONE_NUMBER_ID`.
3. Create a **System User** in Business Settings with access to the WhatsApp account. Generate a permanent token with `whatsapp_business_messaging` and put it in `WHATSAPP_TOKEN`. The temporary token on the API Setup page expires in 24 hours.
4. Under **WhatsApp > Configuration > Webhook**:
   - set the callback URL to `https://<your-server>/webhooks/meta` and paste the verify token;
   - subscribe to the **messages** field.
5. Send a message to the number from a phone. Until the app is published, only numbers added as testers can write to it.

Limits:
- The assistant can only reply within 24 hours of the person's last message (Meta's customer service window). Conversations last a week, so a journalist's answer sent after those 24 hours is rejected by Meta and logged; it still appears in the web chat. Replying later on WhatsApp requires an approved message template, which is not implemented yet.
- Only text messages are processed. For audio, images or locations, the assistant replies that it can only read text for now.

## 3. Messenger

1. Add the **Messenger** product and connect the newsroom's Facebook Page.
2. Generate a **Page access token** with `pages_messaging` and put it in `MESSENGER_PAGE_TOKEN`.
3. In **Messenger > Webhooks**, use the same callback URL and verify token, and subscribe the page to **messages**.

## 4. Instagram

1. Connect the newsroom's Instagram professional account to the Facebook Page.
2. Add **Instagram** messaging to the app. Generate a token with `instagram_manage_messages` and put it in `INSTAGRAM_TOKEN`.
3. Subscribe to **messages** with the same callback URL and verify token.

Messenger and Instagram send the same webhook format (`messaging` events). The server tells them apart by the `object` field (`page` or `instagram`) and ignores echoes of its own messages.

## How it works in the code

`backend/app/canales.py`:
- `firma_valida`: checks `X-Hub-Signature-256` with HMAC-SHA256 of the body and the app secret.
- `mensajes_entrantes`: normalizes the three formats into `{canal, remitente, texto}`.
- `atender`: answers Meta right away and processes each message in a background thread, because Meta retries webhooks that take more than a few seconds.
- `enviar`: calls the Graph API (`/{phone-number-id}/messages` for WhatsApp, `/me/messages` for Messenger and Instagram). Citations are added at the end of the message, with their links.
- `avisar_respuesta`: sends the journalist's answer to the channel the question came from.

The **Ajustes** page shows which channels are configured. Set the Graph API version with `META_GRAPH_VERSION`, and check Meta's changelog when upgrading.
