# Escucha y Respuesta

**Prototype.** An assistant that lets a local newsroom answer its audience using only what it has published, hand the questions it can't answer to a journalist, and see what its community is asking.

Built by [Factchequeado](https://factchequeado.com) for Spanish-language newsrooms serving Latino communities in the United States, building on what we learned running ChatMigrante. *Español: [README.es.md](README.es.md).*

![How a message is handled](docs/architecture.svg)

## How it works

- **Small models, each with one job.** A ~2B decision model ([d1-2B](https://huggingface.co/LiquidAI/d1-2B)) classifies every message and checks every draft; a 0.6B embedding model ([harrier](https://huggingface.co/microsoft/harrier-oss-v1-0.6b)) searches the newsroom's articles; a small generator writes the reply. d1 and harrier run together on a 4 GB GPU.
- **Nothing goes out unchecked.** Before a reply is sent, d1 asks "Is everything it says in the cited articles?" and "Does it answer the question?", each with a calibrated probability. If a check fails, the question goes to a journalist with the draft and the sources.
- **The newsroom sets the limits.** For each topic, it chooses whether the assistant answers on its own, answers only with high confidence, or always hands over to a journalist.
- **Journalists teach it without retraining.** An answer written in the inbox joins the knowledge base, so the next person who asks gets it, with a citation.
- **Privacy by default.** One installation and database per newsroom. Personal data is stripped before storage, conversations expire after a week, and anyone can delete theirs by writing «borrar».

Channels: web chat, WhatsApp, Messenger and Instagram. The newsroom page includes the inbox, Slack and email alerts, a dashboard of what the community asks, the knowledge base and settings.

## Quick start

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                       # choose the generator
.venv/bin/python -m app.ingesta            # load the newsroom's RSS feed
.venv/bin/python -m app.usuarios crear --email you@newsroom.org --nombre "You" --rol admin
cd ../frontend && npm install && npm run build
cd .. && ./demo.sh                         # http://localhost:8000
```

Python 3.12, Node 20+ and an NVIDIA GPU with 4 GB of VRAM (it also runs on CPU, slowly). The generator is any OpenAI-compatible server, local or hosted.

| Guide | |
|---|---|
| [setup.md](docs/setup.md) | Installation, generator choice, adapting it to a newsroom |
| [architecture.md](docs/architecture.md) | Pipeline, data model, design decisions |
| [channels.md](docs/channels.md) | WhatsApp, Messenger and Instagram |
| [notifications.md](docs/notifications.md) | Slack and email alerts |
| [newsroom-guide.md](docs/newsroom-guide.md) | Daily work for journalists |

Code, prompts and comments are in Spanish.

## Status

A working prototype, not production software. Next: an evaluation set built from real community questions, small local generators, better anonymization, voice notes, and serving several newsrooms from one shared installation.

## License

To be defined. Models keep their own licenses (d1: LFM Open License v1.0).
