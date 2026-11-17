# Escucha y Respuesta

**Prototipo.** Un asistente que le permite a un medio local responderle a su audiencia solo con lo que publicó, pasarle a un periodista las preguntas que no puede responder y ver qué pregunta su comunidad.

Lo hace [Factchequeado](https://factchequeado.com) para medios en español que informan a comunidades latinas en Estados Unidos, a partir de lo que aprendimos con ChatMigrante. *English: [README.md](README.md).*

![Cómo se procesa un mensaje](docs/architecture.svg)

## Cómo funciona

- **Modelos chicos, cada uno con una tarea.** Un modelo de decisión de ~2B ([d1-2B](https://huggingface.co/LiquidAI/d1-2B)) clasifica cada mensaje y revisa cada borrador; un modelo de embeddings de 0,6B ([harrier](https://huggingface.co/microsoft/harrier-oss-v1-0.6b)) busca en las notas del medio; un generador chico escribe la respuesta. d1 y harrier entran juntos en una GPU de 4 GB.
- **Nada sale sin revisar.** Antes de mandar una respuesta, d1 pregunta «¿Todo lo que dice está en las notas citadas?» y «¿Responde la pregunta?», cada una con una probabilidad calibrada. Si no pasa, la pregunta va a un periodista con el borrador y las fuentes.
- **El medio pone los límites.** Para cada tema elige si el asistente responde solo, responde solo con mucha confianza o se lo pasa siempre a un periodista.
- **Los periodistas le enseñan sin reentrenar.** Una respuesta escrita en la bandeja se suma a la base, y la próxima persona que pregunte la recibe, con la cita.
- **Privacidad por defecto.** Una instalación y una base por medio. Los datos personales se quitan antes de guardar, las conversaciones vencen a la semana y cualquiera puede borrar la suya escribiendo «borrar».

Canales: chat web, WhatsApp, Messenger e Instagram. La página de la redacción tiene la bandeja, avisos por Slack y correo, un tablero de lo que pregunta la comunidad, la base de conocimiento y los ajustes.

## Para empezar

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                       # elegir el generador
.venv/bin/python -m app.ingesta            # cargar el RSS del medio
.venv/bin/python -m app.usuarios crear --email vos@medio.org --nombre "Vos" --rol admin
cd ../frontend && npm install && npm run build
cd .. && ./demo.sh                         # http://localhost:8000
```

Python 3.12, Node 20+ y una GPU NVIDIA con 4 GB de VRAM (también corre en CPU, más lento). El generador es cualquier servidor compatible con la API de OpenAI, local o en la nube.

Las guías están en inglés, en [docs/](docs/). El código, los prompts y los comentarios están en español.

## Estado

Un prototipo que funciona, no un producto terminado. Lo próximo: un set de evaluación con preguntas reales de la comunidad, generadores chicos locales, mejor anonimización, notas de voz y atender a varios medios desde una instalación compartida.

## Licencia

A definir. Los modelos tienen sus propias licencias (d1: LFM Open License v1.0).
