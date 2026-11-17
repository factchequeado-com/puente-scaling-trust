# Escucha y Respuesta

La mayoría de los chatbots para medios pone a un modelo de lenguaje generalista a cargo y confía en que no se aparte de sus fuentes. Escucha y Respuesta funciona al revés: cada decisión la toman modelos de decisión chicos. Un modelo de 2B clasifica cada mensaje y revisa cada borrador contra las notas que cita, con una probabilidad calibrada para cada control. Si un control falla, la pregunta va a un periodista: un error le cuesta un rato a la redacción en lugar de llegarle al público como desinformación.

Cada medio decide, tema por tema, cuánta confianza necesita el sistema para responder solo. Puede dejar que el asistente conteste las preguntas de rutina sobre fechas de votación y que todas las de inmigración pasen por un periodista. Los modelos que toman esas decisiones entran en una GPU de 4 GB, en un servidor que controla el medio.

Es un prototipo que funciona, hecho por [Factchequeado](https://factchequeado.com) para medios en español que informan a comunidades latinas en Estados Unidos, a partir de lo que aprendimos con [ChatMigrante](https://factchequeado.com/press-releases/20250312/factchequeado-presenta-chatmigrante/). *English: [README.md](README.md).*

![Cómo se procesa un mensaje](docs/architecture.svg)

## Cómo funciona

- [d1-2B](https://huggingface.co/LiquidAI/d1-2B) clasifica cada mensaje y revisa cada borrador. No escribe texto: responde preguntas como «¿Todo lo que dice está en las notas citadas?» y «¿Responde la pregunta?», cada una con una probabilidad. En nuestras pruebas, un modelo de lenguaje de 31B dio entre 95 y 100 % de confianza en todos los mensajes, mientras que los puntajes más bajos de d1 coincidieron con los casos realmente ambiguos.
- [harrier](https://huggingface.co/microsoft/harrier-oss-v1-0.6b), un modelo de embeddings de 0,6B, busca en las notas del medio. Un generador chico escribe la respuesta a partir de ellas.
- Cuando un periodista responde una pregunta derivada, la respuesta se suma a la base: el sistema aprende de la redacción sin reentrenar.
- Cada medio tiene su propia instalación y su base. Los datos personales se quitan antes de guardar, las conversaciones vencen a la semana y cualquiera puede borrar la suya escribiendo «borrar».

Funciona por chat web, WhatsApp, Messenger e Instagram. La página de la redacción tiene la bandeja, avisos por Slack y correo, un tablero de lo que pregunta la comunidad, la base de conocimiento y los ajustes.

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

Un prototipo que funciona, no un producto terminado. Lo próximo: un set de evaluación con preguntas reales de la comunidad, infraestructura propia con GPU, mejor anonimización, notas de voz y atender a varios medios desde una instalación compartida.

## Licencia

[Apache 2.0](LICENSE). Los modelos tienen sus propias licencias: d1 usa la LFM Open License v1.0, y cada generador tiene sus propios términos.
