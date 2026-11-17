# Setup

This guide takes a newsroom from an empty server to a working assistant. Each installation serves one newsroom: it has its own database, articles, settings and team.

## 1. What you need

| | Minimum | Notes |
|---|---|---|
| Server | Linux, Python 3.12, Node 20+ | Node is only needed to build the web interface |
| GPU | NVIDIA with 4 GB of VRAM | Runs d1 (8-bit) and harrier together. Without a GPU, d1 runs on CPU at ~17 s per check |
| RAM | 8 GB | Add ~7 GB to run Gemma 4 E4B locally on CPU |
| Generator | Any OpenAI-compatible server | Ollama (local or cloud), llama.cpp or vLLM. See [the generator options](#4-choose-a-generator) |
| Articles | An RSS feed with full text or a summary | WordPress feeds work as they are |

## 2. Install

```bash
git clone <this repository> escucha-respuesta
cd escucha-respuesta/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env

cd ../frontend
npm install
npm run build
```

The first run downloads d1-2B and harrier from Hugging Face (several GB). The d1 revision is pinned in `D1_REVISION` because it loads code from its repository.

## 3. Configure `.env`

Open `backend/.env`. Every variable is explained in `.env.example`. These are the ones you need to set:

- `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`: the generator.
- `NOMBRE_MEDIO`, `RSS_URL`: the starting values. They can be changed later from the newsroom page.
- `SESION_SEGURA=si` once the server is behind HTTPS.

## 4. Choose a generator

The generator drafts replies. Every other model runs on your server. To switch generators, change two variables and restart.

| Option | Good for | Settings |
|---|---|---|
| Ollama Cloud, `gemma4:31b` | Trying it out on a laptop | `LLM_BASE_URL=https://ollama.com/v1` and a key from ollama.com |
| Ollama local, `gemma4:e4b` | A pilot on a server with 16 GB of RAM or a GPU with 8 GB | `ollama pull gemma4:e4b`, then `LLM_BASE_URL=http://localhost:11434/v1` |
| llama.cpp, `LFM3-1.7B` | Very small hardware (experimental) | See the `llama-server` command in `.env.example`, and set `LLM_RAZONAR=no` |
| vLLM | Several newsrooms or heavy traffic | `LLM_BASE_URL=https://<your-server>/v1` |

With a hosted generator, each message and the cited articles are sent to that provider. With a local one, nothing leaves your server.

## 5. Load the articles

```bash
cd backend
.venv/bin/python -m app.ingesta
```

This downloads the RSS feed, splits each article into chunks of about 200 tokens and embeds them. It can be run again at any time and only adds new articles. Journalists can also click **Actualizar RSS** on the newsroom page.

## 6. Create the first admin

```bash
.venv/bin/python -m app.usuarios crear --email you@newsroom.org --nombre "Your name" --rol admin
```

The password is asked in the terminal (at least 10 characters). Everyone else is added from the newsroom page, under **Equipo**.

There are two roles:
- **periodista**: reads the inbox, answers escalated questions, sees the dashboard and the knowledge base.
- **admin**: also changes the settings and manages the team.

## 7. Run it

To try it out:

```bash
./demo.sh          # from the repository root: one process, capped at 7 GB of RAM
```

On a server, run uvicorn behind a reverse proxy with HTTPS (Caddy, nginx) and keep it alive with systemd:

```bash
cd backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

| URL | Who uses it |
|---|---|
| `/redaccion` | The newsroom: inbox, dashboard, knowledge base, settings, team |
| `/chat` | The audience. It can be embedded in the newsroom's site with an `<iframe>` |
| `/webhooks/meta` | Meta, for WhatsApp, Messenger and Instagram ([docs/channels.md](channels.md)) |
| `/` | A demo page that explains the project |

## 8. Adapt it to your newsroom

Sign in at `/redaccion` and open **Ajustes**. No restart is needed: changes apply from the next message.

- **El medio**: the newsroom's name and RSS feed.
- **Qué es este servicio**: what the assistant knows about itself. This "service sheet" reaches the generator as the first article on every turn. The assistant uses it to introduce itself in the first reply, and to answer questions such as "who is behind this?" or "what happens to my data?". d1 checks those answers against the sheet, like any other answer. Write it in your newsroom's voice and keep it true.
- **Cuánto responde solo, por tema**: for each topic, choose one of three levels:
  - *Automático*: answer when d1's checks pass.
  - *Exigente*: answer only with higher scores.
  - *Siempre la redacción*: never answer automatically.

  If a message touches several topics, the strictest level wins. Urgent messages always go to the newsroom.
- **Mensajes fijos**: the reply for urgent messages and the reply when a question is escalated. The assistant never improvises these.
- **Avisos a la redacción**: who gets an email when a question reaches the inbox, and when to send it: everything, only urgent messages, or nothing. Slack and the mail server are configured in `.env` ([notifications.md](notifications.md)).

## Embed the chat on your site

Add one line before `</body>` on the newsroom's site. In WordPress, use the theme editor or any "header and footer scripts" plugin:

```html
<script src="https://escucha.yournewsroom.org/widget.js" defer></script>
```

This adds a floating button in the bottom corner that opens the chat in a panel. The first time, it also shows a short invitation. You can set these as attributes on the same tag:

| Attribute | What it changes |
|---|---|
| `data-color="#f0ab34"` | The button's color. The icon turns dark on light colors |
| `data-invitacion="…"` | The invitation text. Use `""` to hide it |
| `data-lado="izquierda"` | Puts the button on the left |

The chat runs in an iframe served by this installation, so the newsroom's site never sees the conversation.

To try it on any site without touching it, open `/muestra.html?sitio=https://yournewsroom.org`. This loads the site in the background with the widget on top. It only works if the site allows being shown in a frame.

## 9. Daily work

See [newsroom-guide.md](newsroom-guide.md).

## Data and retention

- **Conversations** are deleted a week after the last message (`VENCIMIENTO_HORAS`, 168 by default), or immediately when the person writes «borrar».
- **Before storage**, phone numbers, emails and ID numbers are removed from every message. This uses regular expressions today, so names and addresses are not caught yet.
- **Questions answered automatically** keep only labels: type, topics, location and d1's scores.
- **Escalated questions** keep the text and the thread, so a journalist can answer them.
- **Traces** of each turn (timings, raw generator output, d1 scores) are kept for 30 days (`TRAZAS_DIAS`).
- **Passwords** are stored with scrypt, and sessions as SHA-256 hashes.
- **Back up** `backend/data/escucha.db`. It is the only stateful file.
