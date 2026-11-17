# Newsroom guide

What journalists do at `/redaccion`, day to day.

## Bandeja (inbox)

Every question the assistant didn't answer arrives here. Each one shows:
- the question and the conversation thread;
- what links the person shared (what was circulating, never treated as a source);
- why it was escalated: urgent, no published article covers it, the answer failed d1's checks, or the topic always goes to the newsroom;
- the draft the assistant wrote, when there is one.

What you can do with each question:
- **Answer it.** The reply appears in the person's chat, or is sent on WhatsApp, Messenger or Instagram, as long as the conversation still exists, which is a week after the last message. On WhatsApp, Meta only allows replies within 24 hours of the person's last message. With **Sumar a la base** checked, your answer joins the knowledge base. The next person who asks something similar gets an automatic reply that cites the newsroom.
- **Mark it as a story idea.** Questions the community asks that haven't been covered yet.
- **Discard it.** For spam, or questions that need no reply.

Urgent messages are listed first. The person has already received the newsroom's fixed urgent reply, never a generated one.

## Panel (dashboard)

What the community asks, for today, the last 7 days or the last 30 days:
- answered, escalated and closed questions;
- topics with the most unanswered questions;
- places where questions are rising compared with the previous period;
- average time to answer escalated questions.

## Base de notas (knowledge base)

The articles the assistant can draw on, from the RSS feed and from the newsroom's own answers. **Actualizar RSS** adds new articles.

## Ajustes and Equipo

Admins adapt the assistant to the newsroom in **Ajustes**, and manage who has access in **Equipo**. See [setup.md](setup.md#8-adapt-it-to-your-newsroom).

## Understanding a decision

Every turn stores a trace for 30 days: how long each step took, what the generator returned, and d1's scores.
- **Escalated questions** show these scores in the inbox.
- **Any question's full trace** is available at `/api/consultas/<id>/traza` while you are signed in.
- **In the chat**, opening `/chat?detalles=1` shows the scores next to each reply.
