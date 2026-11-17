# Escucha y Respuesta

Most newsroom chatbots put a general-purpose language model in charge and trust it to stay within its sources. Escucha y Respuesta works the other way around: small decision models make every call. A 2B model classifies each message and checks each draft against the articles it cites, with a calibrated probability for every check. When a check fails, the question goes to a journalist, so a mistake costs a journalist some time instead of reaching the public as misinformation.

Each newsroom decides, topic by topic, how confident the system must be before it answers on its own. It can let the assistant handle routine questions about voting dates and keep every immigration question in a journalist's hands. The models that make those decisions fit on a 4 GB GPU, on a server the newsroom controls.

This is a working prototype by [Factchequeado](https://factchequeado.com), built for Spanish-language newsrooms serving Latino communities in the United States and building on what we learned running ChatMigrante. *Español: [README.es.md](README.es.md).*

![How a message is handled](docs/architecture.svg)

## How it works

- [d1-2B](https://huggingface.co/LiquidAI/d1-2B) classifies every message and checks every draft. It doesn't write text: it answers questions like "Is everything it says in the cited articles?" and "Does it answer the question?", each with a probability. In our tests, a 31B language model reported 95–100% confidence on every message, while d1's lowest scores matched the genuinely ambiguous ones.
- [harrier](https://huggingface.co/microsoft/harrier-oss-v1-0.6b), a 0.6B embedding model, searches the newsroom's articles. A small generator drafts the reply from them.
- When a journalist answers an escalated question, the answer joins the knowledge base, so the system learns from journalists without retraining.
- Each newsroom has its own installation and database. Personal data is stripped before storage, conversations expire after a week, and anyone can delete theirs by writing «borrar».

It works over web chat, WhatsApp, Messenger and Instagram. The newsroom page has the inbox, Slack and email alerts, a dashboard of what the community asks, the knowledge base and the settings.

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

A working prototype, not production software. Next: an evaluation set built from real community questions, self-owned GPU infrastructure, better anonymization, voice notes, and serving several newsrooms from one shared installation.

## License

[Apache 2.0](LICENSE). The models keep their own licenses: d1 uses the LFM Open License v1.0, and each generator has its own terms.
