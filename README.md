# toolbox-challenge-backend

API REST que consume el API externo de Toolbox, formatea el contenido de los archivos CSV y lo expone como JSON.

> **Estado:** esqueleto de la aplicación e infraestructura de observabilidad (`BACKEND - TASK-001`).
> La lógica de negocio del challenge —listar archivos, descargarlos, parsear los CSV y exponer
> `GET /files/data`— corresponde a las tarjetas `TASK-002` a `TASK-005` y todavía no está implementada.

---

## Requisitos

- **NodeJS 14** (probado en v14.21.3)

El repo incluye `.nvmrc`, así que alcanza con:

```bash
nvm use
```

<details>
<summary><strong>Apple Silicon:</strong> NodeJS 14 no tiene build nativa para arm64</summary>

NodeJS 14 es anterior al soporte oficial de macOS arm64, así que hay que instalar la build x64 y
correrla bajo Rosetta 2:

```bash
arch -x86_64 zsh
nvm install 14
nvm use 14
```

Todos los comandos del proyecto deben ejecutarse desde ese shell x86_64.
</details>

## Instalación y uso

```bash
npm install              # instalar dependencias
npm start                # levantar el API (puerto 3000 por defecto)
npm test                 # correr toda la suite (Mocha + Chai)
npm run test:unit        # sólo los tests unitarios
npm run test:integration # sólo los tests de integración
```

No hace falta configurar **ninguna** variable de entorno: todos los valores están en
`src/shared/config.js`. Un clon limpio arranca con `npm install && npm start`.

## Endpoints

### `GET /files/health`

Verifica que la aplicación está en pie y responde.

```bash
curl -s http://localhost:3000/files/health
```

```json
{ "status": "ok" }
```

### Errores

Toda respuesta de error sale en `application/json`, nunca en HTML, y nunca incluye el stack trace.

```bash
curl -s http://localhost:3000/unknown
```

```json
{ "error": { "code": "ROUTE_NOT_FOUND", "message": "Route not found: GET /unknown" } }
```

## Arquitectura

Modular por feature. Cada módulo es autocontenido y expone su propio router:

```
src/
├── server.js                 # entrypoint: levanta el servidor
├── app.js                    # arma la app: middleware compartido + routers, sin listen()
├── modules/
│   └── files/
│       ├── index.js              # barril: declara la API pública del módulo
│       ├── files.routes.js       # exporta filesRouter
│       ├── files.controller.js   # única capa que toca req/res
│       └── files.service.js      # orquestación de dominio, datos planos
└── shared/
    ├── config.js             # configuración, valores hardcodeados
    ├── logger.js             # pino: una línea de log por request
    ├── appError.js           # errores tipados
    └── http/
        ├── errors.js         # notFound + errorHandler: la cola de la cadena
        └── httpClient.js     # cliente del API externo (lo usa TASK-002)
```

**Reglas de capa:** cada capa conoce sólo a la de abajo y sólo por su firma. El service nunca ve
`req`/`res`; el controller es el único que los toca. No hay capas sin trabajo real: la capa
`repository`, que aísla el API externo, aparece con `TASK-002`, cuando haya I/O que aislar.

**Encapsulación:** un módulo declara su API pública en `index.js` y expone sólo su router. `app.js`
nunca importa un archivo interno de una feature. Dentro del módulo las capas se cablean con imports
directos; un módulo sólo puede importar de sí mismo o de `shared/`, nunca de otro módulo.

**Programación funcional:** sin clases. La inyección de dependencias se reserva para la infraestructura
de `shared/` que los tests necesitan intercambiar de verdad (`emit`, `random`, config), expuesta como
factory. No se aplica a las capas de un módulo: un parámetro de cableado que ningún test usa es
ceremonia.

Agregar una feature = una carpeta nueva en `src/modules/` más una línea en `app.js`.

## Logging

Siguiendo la idea de [loggingsucks.com](https://loggingsucks.com/), **cada request produce una sola
línea JSON** con todo el contexto, en vez de varias líneas sueltas. El transporte es **pino**.

```json
{"level":30,"time":1787870370286,"service":"toolbox-challenge-backend","version":"1.0.0",
 "request_id":"6456b94c5a9c7f8f","method":"GET","path":"/files/health",
 "status_code":200,"duration_ms":11}
```

Cualquier punto del camino de la request puede sumarle atributos:

```js
req.logger.add({ files_failed: 2, lines_discarded: 37 })
```

Se acumulan en memoria y se escriben una sola vez, al terminar la respuesta. El acumulador vive en
`req` y no en el módulo, para que dos requests concurrentes no mezclen sus atributos.

El dominio de este challenge son las **fallas parciales** (archivos que no descargan, líneas que se
descartan), y es justamente lo que este formato comunica bien: una línea que dice
`files_failed_names: ["file2.csv"], lines_discarded: 37` cuenta toda la historia de la request. Los
campos de dominio se agregan a medida que se implementan las tarjetas correspondientes.

## Configuración

Todos los valores viven en `src/shared/config.js`. No se leen variables de entorno: el challenge
prohíbe depender de ellas, y hardcodearlas evita el parseo de strings y los defaults duplicados.

| Setting | Valor | Descripción |
|---|---|---|
| `port` | `3000` | Puerto del servidor |
| `service.name` / `service.version` | `toolbox-challenge-backend` / `1.0.0` | Campos constantes de la línea de log |
| `externalApi.baseUrl` | `https://echo-serv.tbxnet.com/v1/secret` | Base del API externo |
| `externalApi.token` | `aSuperSecretKey` | Token del API externo |
| `externalApi.timeoutMs` | `10000` | Timeout de las llamadas salientes |

## Tests

```bash
npm test
```

Mocha + Chai, con `supertest` para las rutas. La suite corre **sin red real**.

| Comando | Corre |
|---|---|
| `npm test` | Todo |
| `npm run test:unit` | `test/unit/` — funciones puras y piezas aisladas, sin Express |
| `npm run test:integration` | `test/integration/` — `supertest` contra `buildApp()` |

En cada push a `main` y en cada pull request, GitHub Actions corre `npm ci && npm test` sobre
**NodeJS 14** (`.github/workflows/ci.yml`), que es el runtime que exige el challenge. Los fakes son objetos literales inyectados por `buildApp()`, que devuelve la app
sin llamar a `listen()`.

## Decisiones de diseño

- **ESM nativo** (`"type": "module"`) en vez de CommonJS. Obliga a extensiones `.js` explícitas en los
  imports relativos y a leer `package.json` con `createRequire`, pero es JavaScript moderno sin transpilar.
- **pino como transporte de log**, fijado en la 8.x porque la 9 exige Node 18+.
- **El service no conoce el logging.** Devuelve `{ data, stats }` y el controller las pliega en la
  línea con `req.logger.add()`. El acumulador vive en `req` y no en el módulo, para que dos requests
  concurrentes no mezclen atributos; se descartó `AsyncLocalStorage` por agregar indirección.
- **`notFound` y `errorHandler` en un archivo.** No pueden ser la misma función —Express los
  distingue por aridad, 3 parámetros contra 4— pero son las dos puntas de la misma cadena.
- **Errores como factory sobre `Error`** en vez de subclases: conserva el stack trace sin introducir clases.
- **Todo el código fuente en inglés** (identificadores, comentarios, mensajes de error, nombres
  de tests). La documentación queda en español.
- **Versiones de dependencias fijadas por Node 14**: `chai@4` (la 5 es ESM-only y exige Node 18+),
  `mocha@10`, `sinon@15`. Ver `.claude/skills/node14-constraints/`.

## Skills de Claude Code

`.claude/skills/` contiene las reglas de arquitectura de este proyecto en formato ejecutable por
Claude Code. Sirven además como documentación de diseño para cualquier persona que trabaje en el repo:

| Skill | Cubre |
|---|---|
| `feature-module` | Capas de un módulo, encapsulación, reglas de import, contratos de respuesta |
| `logging` | Una línea de log por request, cómo enriquecerla, convención de campos |
| `node14-constraints` | APIs ausentes en NodeJS 14, ESM, versiones de dependencias compatibles |
| `testing-mocha-chai` | Qué se mockea en cada nivel, escenarios obligatorios, chai en ESM |
| `clean-code-solid` | SOLID en programación funcional, JSDoc, patrones descartados y por qué |
