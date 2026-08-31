# toolbox-challenge-backend

API REST que consume el API externo de Toolbox (`https://echo-serv.tbxnet.com`), formatea el contenido
de sus archivos CSV descartando las líneas inválidas, y lo expone como JSON en `GET /files/data`.

> **Estado:** alcance obligatorio y opcional completos (`BACKEND - TASK-001` a `TASK-012`).

---

## Cómo ejecutarlo

### Con Docker — la forma recomendada

No hace falta instalar NodeJS: el contenedor trae el runtime que exige el enunciado.

```bash
docker compose up --build          # http://localhost:3000
```

O sin Compose:

```bash
docker build -t toolbox-api .
docker run --rm -p 3000:3000 toolbox-api
```

Para levantar también el cliente, su repo trae su propio compose; van en dos terminales:

```bash
cd toolbox-challenge-backend  && docker compose up --build   # API en :3000
cd toolbox-challenge-frontend && docker compose up --build   # app en :8080
```

### Sin Docker

Requiere **NodeJS 14** (probado en `v14.21.3`, npm `6.14.18`). El repo trae `.nvmrc`:

```bash
nvm use          # -> 14
npm install
npm start        # http://localhost:3000
```

| | |
|---|---|
| Puerto | **3000** |
| Variables de entorno | ninguna, ni obligatoria ni opcional |
| Dependencias globales | ninguna |

## Qué vas a ver

`npm start` —o `docker compose up`— escribe una línea y queda escuchando:

```json
{"level":30,"time":1787956126291,"service":"toolbox-challenge-backend","version":"1.0.0","event":"server_started","port":3000}
```

Y el endpoint principal responde un array de archivos con sus líneas ya formateadas:

```bash
curl -s http://localhost:3000/files/data
```

```json
[
  { "file": "test1.csv", "lines": [] },
  { "file": "test3.csv", "lines": [
      { "text": "g", "number": 101382507, "hex": "65badd1f29e6235199261cd3026a97f5" }
  ]}
]
```

**Van a aparecer archivos con `lines: []`, y está bien:** el API externo sirve datos sucios a propósito
y la mayoría de las líneas se descartan. El desglose está en
[Contra el API externo real](#contra-el-api-externo-real).

Cada request emite **una sola línea de log** con todo su contexto — cuántos archivos fallaron, cuáles,
y cuántas líneas se descartaron. Ver [Logging](#logging).

## Enlaces

| | |
|---|---|
| **Documentación del API (Postman)** | https://documenter.getpostman.com/view/27146414/2sBYAuSrSX |
| Board de Trello | https://trello.com/b/ZN8vBfxd |
| Repo del cliente | https://github.com/Rafael9902/toolbox-challenge-frontend |
| Historias de usuario | [`docs/user-stories.md`](docs/user-stories.md) |

## Comandos

```bash
npm start                # levantar el API en http://localhost:3000
npm test                 # toda la suite (Mocha + Chai)
npm run test:unit        # sólo los tests unitarios
npm run test:integration # sólo los tests de integración
npm run lint             # JavaScript Standard Style
```

## Endpoints

Todas las respuestas, incluidas las de error, salen en `application/json`.
El detalle completo con ejemplos está en la
[documentación publicada](https://documenter.getpostman.com/view/27146414/2sBYAuSrSX).

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/files/data` | Lista, descarga y formatea todos los archivos. Acepta `?fileName=` |
| `GET` | `/files/list` | Devuelve el listado tal cual lo expone el API externo |
| `GET` | `/files/health` | Verifica que la aplicación está en pie |

### `GET /files/data`

Array **pelado**, sin envoltorio, como lo fija el enunciado:

```json
[
  { "file": "test1.csv", "lines": [] },
  { "file": "test3.csv", "lines": [
      { "text": "g", "number": 101382507, "hex": "65badd1f29e6235199261cd3026a97f5" }
  ]}
]
```

`file` es el nombre del archivo procesado —no la primera columna del CSV— y `number` viaja como número,
no como texto.

**Ante fallas** (el porqué está en [Decisiones de diseño](#decisiones-de-diseño)):

| Situación | Respuesta |
|---|---|
| Falla la descarga de un archivo | `200`. Se omite ese archivo, los demás se devuelven |
| Fallan todas las descargas | `200` con `[]` |
| Archivo vacío o sin líneas válidas | `200`. Se incluye con `"lines": []` |
| Falla el **listado** | `502`: no hay nada parcial que devolver |

**Filtro opcional** `?fileName=test3.csv` → un solo elemento, y el API descarga **sólo ese archivo**.
Un nombre que no está en el listado responde `404`; un `fileName` presente pero vacío, `400`.

### `GET /files/list`

Espejo exacto del API externo, envoltorio incluido. No descarga nada.

```json
{ "files": ["test1.csv", "test2.csv", "test3.csv"] }
```

### `GET /files/health`

```json
{ "status": "ok" }
```

### Errores

Siempre la misma forma, nunca HTML, nunca con stack trace:

```json
{ "error": { "code": "ROUTE_NOT_FOUND", "message": "Route not found: GET /unknown" } }
```

| Código | HTTP | Cuándo |
|---|---|---|
| `INVALID_QUERY_PARAM` | `400` | `?fileName=` presente pero sin nombrar un archivo |
| `ROUTE_NOT_FOUND` | `404` | La ruta pedida no existe |
| `EXTERNAL_API_FILE_NOT_FOUND` | `404` | El `fileName` pedido no está en el listado |
| `EXTERNAL_API_UNAVAILABLE` | `502` | El listado del API externo falló o expiró |
| `INTERNAL` | `500` | Error no tipado. Al cliente le llega un mensaje genérico; el real queda en el log |

## Contra el API externo real

Los datos que sirve el API externo están sucios a propósito, y es justamente lo que este API tiene que
manejar sin caerse. Corrida real del **2026-08-28**:

| Métrica | Valor |
|---|---|
| Archivos listados | 9 |
| Archivos descargados | 7 |
| Archivos que no se pudieron descargar | 2 (`test4.csv`, `test5.csv`) |
| Filas de datos leídas | 54 |
| Filas válidas | **14** |
| Filas descartadas | **40** |

Desglose de los 40 descartes:

| Motivo | Filas |
|---|---|
| Alguna columna vacía | 14 |
| 2 columnas en vez de 4 | 9 |
| `number` no numérico | 9 |
| `hex` de 30 caracteres en vez de 32 | 5 |
| 6 columnas en vez de 4 | 3 |

Y todo eso entra en **una sola línea de log**, la que produjo ese mismo `curl`:

```json
{"level":30,"time":1787956134713,"service":"toolbox-challenge-backend","version":"1.0.0",
 "request_id":"1833c8709091dc9515deb20306a809de","method":"GET","path":"/files/data",
 "files_listed":9,"files_succeeded":7,"files_failed":2,"files_failed_names":["test4.csv","test5.csv"],
 "lines_valid":14,"lines_discarded":40,"status_code":200,"duration_ms":777}
```

Un `200` con 7 archivos no cuenta esa historia; esta línea sí. Es el motivo de todo el
[formato de logging](#logging).

> El API externo puede cambiar sus datos: los números de arriba describen esa corrida, no un contrato.

## Documentación del API

| Archivo | Qué es |
|---|---|
| [`docs/openapi.yaml`](docs/openapi.yaml) | Especificación **OpenAPI 3.0.3**: los tres endpoints, sus parámetros, y cada respuesta de éxito y de error con ejemplos |
| [`docs/toolbox-challenge-api.postman_collection.json`](docs/toolbox-challenge-api.postman_collection.json) | Colección **Postman v2.1** con una request por endpoint y por falla documentada |

La colección también está **publicada online**, sin necesidad de importar nada:
https://documenter.getpostman.com/view/27146414/2sBYAuSrSX

Para ver la spec de OpenAPI sin instalar nada, pegá el contenido de `openapi.yaml` en
[editor.swagger.io](https://editor.swagger.io/).

La colección de Postman **no es sólo una lista de requests**: cada una lleva sus tests, así que
`Run collection` verifica el contrato en vez de sólo mostrar respuestas. Y cada una trae **ejemplos
guardados** —incluidas las variantes de error— para poder leer las formas sin levantar nada. Con el API
corriendo:

```bash
npx newman run docs/toolbox-challenge-api.postman_collection.json
# 5 requests, 12 assertions, 0 failures
```

| Request | Ejemplos |
|---|---|
| Get files | Every file |
| Get files by file name | One file · Empty file name (400) · Unknown file name (404) |
| Get file names | The listing |
| Get service health | Up |
| Get an unknown route | Route not found (404) |

`Get files` deja en una variable el nombre de un archivo que **hoy** tiene líneas, y `Get files by file
name` la usa: así la colección corre entera aunque el API externo cambie sus datos.

Comprueba lo que el enunciado fija y es fácil de romper sin darse cuenta: que `/files/data` devuelva un
array **pelado**, que cada elemento tenga **sólo** `file` y `lines`, que `number` viaje como número JSON
y no como texto, que `/files/list` conserve el envoltorio `{ files }`, y que una ruta inexistente
responda JSON y no la página HTML de Express.

> `newman` corre en NodeJS 16 o superior; el API sigue corriendo en 14. Son procesos distintos, así que
> no hay conflicto: levantá el API con `nvm use` y corré `newman` desde otra terminal.

## Cómo se gestionó el trabajo

El challenge se planificó como un backlog de **historias de usuario**, no como una lista de tareas
técnicas. Cada una nació de un requisito del enunciado y quedó escrita con el mismo formato:

```
Como <rol>
Quiero <capacidad>
Para <beneficio>

Criterios de aceptación, en Gherkin:
  Dado ... Cuando ... Entonces ...
```

Las 12 historias de este repo están en [`docs/user-stories.md`](docs/user-stories.md), cada una con sus
criterios, notas técnicas, estimación en puntos y un chequeo **INVEST** explícito — independiente,
negociable, valiosa, estimable, pequeña y testeable.

**Los criterios de aceptación son el contrato.** Cuando el enunciado dejaba algo ambiguo, la decisión
quedó documentada en la historia y en las [Decisiones de diseño](#decisiones-de-diseño) en vez de
resolverse en silencio dentro del código.

### El tablero

**https://trello.com/b/ZN8vBfxd**

Un flujo Scrum de cuatro listas, con una tarjeta por historia:

```
Backlog  →  In Progress  →  In Review  →  Done
```

Etiquetas por área y por obligatoriedad: `BACKEND`, `FRONTEND`, `GLOBAL` y `REQUIRED`. Una tarjeta sin
`REQUIRED` es un punto opcional del enunciado.

| Área | Obligatorias | Opcionales |
|---|---|---|
| Backend | 8 | 4 |
| Frontend | 6 | 4 |
| Global (entrega) | 1 | — |

### Cómo avanza una tarjeta

El estado del tablero está atado al repositorio, no se mueve a mano:

| Movimiento | Qué lo dispara |
|---|---|
| `Backlog` → `In Progress` | empieza el trabajo, en una rama propia |
| `In Progress` → `In Review` | **hay un pull request abierto** con el CI en verde |
| `In Review` → `Done` | **el pull request está mergeado** en `main` |

Por eso `main` no recibe commits directos: cada historia entra por un pull request, y su tarjeta no
llega a `Done` hasta que ese PR se mergea. El historial del repo y el tablero cuentan la misma cosa.

## Arquitectura

Modular por feature. Cada módulo es autocontenido y expone su propio router:

```
src/
├── server.js                       # entrypoint: listen() + handlers de proceso
├── app.js                          # arma la app: middleware compartido + routers, sin listen()
├── modules/
│   └── files/
│       ├── index.js                # barril: declara la API pública del módulo (sólo el router)
│       ├── files.routes.js         # exporta filesRouter
│       ├── files.controller.js     # única capa que toca req/res
│       ├── files.validators.js     # función pura: valida el query param
│       ├── files.service.js        # orquesta: lista, descarga en paralelo, formatea, cuenta
│       ├── files.repository.js     # aísla el API externo: listFiles + downloadFile
│       └── files.parser.js         # función pura: CSV crudo -> líneas válidas + descartadas
└── shared/
    ├── config.js                   # configuración, valores hardcodeados
    ├── logger.js                   # pino: una línea de log por request
    ├── appError.js                 # errores tipados + catálogo de códigos
    ├── processErrors.js            # uncaughtException / unhandledRejection
    └── http/
        ├── cors.js                 # Access-Control-Allow-Origin
        ├── errors.js               # notFound + errorHandler: la cola de la cadena
        └── httpClient.js           # cliente axios del API externo, respuestas como texto crudo
```

Camino de un `GET /files/data`:

```
routes → controller → service ─┬→ repository → httpClient → API externo
                               └→ parser (puro, sin I/O)
```

**Reglas de capa.** Cada capa conoce sólo a la de abajo y sólo por su firma. El controller es el único
que toca `req`/`res`; el service devuelve datos planos `{ data, stats }` y no sabe que existe HTTP ni
que existe el logging. El repository es el único que conoce la forma del API externo —traduce el
envoltorio `{ "files": [...] }` al array de nombres que usa el dominio— y el parser es una función pura
que no hace I/O.

**Encapsulación.** Un módulo declara su API pública en `index.js` y expone sólo su router. `app.js`
nunca importa un archivo interno de una feature. Dentro del módulo las capas se cablean con imports
directos; un módulo sólo puede importar de sí mismo o de `shared/`, nunca de otro módulo.

**Programación funcional, sin clases.** La inyección de dependencias se reserva para lo que los tests
necesitan intercambiar de verdad (el destino del log, el `process` de los handlers, las funciones del
repositorio en el service), expuesta como parámetro con default. Un parámetro de cableado que ningún
test usa es ceremonia.

Agregar una feature = una carpeta nueva en `src/modules/` más una línea en `app.js`.

## Logging

Siguiendo la idea de [loggingsucks.com](https://loggingsucks.com/), **cada request produce una sola
línea JSON** con todo su contexto, en vez de varias líneas sueltas que hay que correlacionar después.
El transporte es **pino**.

```json
{"level":30,"time":1787956133922,"service":"toolbox-challenge-backend","version":"1.0.0",
 "request_id":"249206ac1c6b2d562da704a9b21170cb","method":"GET","path":"/files/health",
 "status_code":200,"duration_ms":3}
```

Cualquier punto del camino de la request puede sumarle atributos:

```js
req.logger.add({ files_failed: 2, lines_discarded: 40 })
```

Se acumulan en memoria y se escriben una sola vez, al terminar la respuesta. El acumulador vive en
`req` y no en el módulo, para que dos requests concurrentes no mezclen sus atributos; se descartó
`AsyncLocalStorage` por agregar indirección sin resolver nada más.

Campos que agrega `GET /files/list`:

| Campo | Significado |
|---|---|
| `files_listed` | Archivos que devolvió el listado |

Campos que agrega `GET /files/data`:

| Campo | Significado |
|---|---|
| `filter_file_name` | Nombre pedido en `?fileName=`. Ausente cuando no hay filtro |
| `files_listed` | Archivos que devolvió el listado |
| `files_succeeded` | Archivos descargados y formateados |
| `files_failed` | Archivos cuya descarga falló |
| `files_failed_names` | Nombres de esos archivos |
| `lines_valid` | Líneas que viajaron en la respuesta |
| `lines_discarded` | Líneas descartadas por formato inválido |

Un error agrega además un objeto `error` con `type`, `code`, `message` y `retriable`:

```json
{"level":30,"time":1787956133930,"service":"toolbox-challenge-backend","version":"1.0.0",
 "request_id":"acaac820d04ee692573ab7c7702c44ac","method":"GET","path":"/unknown",
 "error":{"type":"AppError","code":"ROUTE_NOT_FOUND","message":"Route not found: GET /unknown","retriable":false},
 "status_code":404,"duration_ms":1}
```

El `request_id` se toma del header `x-request-id` si viene, y si no se genera. Los eventos que no
pertenecen a ninguna request —el arranque del servidor, un `uncaughtException`— salen con un campo
`event` en vez de `method`/`path`.

## Configuración

Todos los valores viven en `src/shared/config.js`. No se leen variables de entorno: el challenge
prohíbe depender de ellas.

| Setting | Valor | Descripción |
|---|---|---|
| `port` | `3000` | Puerto del servidor |
| `service.name` / `service.version` | `toolbox-challenge-backend` / `1.0.0` | Campos constantes de la línea de log |
| `externalApi.baseUrl` | `https://echo-serv.tbxnet.com/v1/secret` | Base del API externo |
| `externalApi.token` | `aSuperSecretKey` | Se manda como `authorization: Bearer <token>` |
| `externalApi.timeoutMs` | `10000` | Timeout de las llamadas salientes |

Para levantar el API en otro puerto se cambia `port` en ese archivo; es un objeto congelado con
`Object.freeze`, así que nada lo modifica en caliente.

## Tests

**Mocha + Chai**, con `supertest` para las rutas, `nock` para el API externo y `sinon` para los espías.

```bash
npm test                 # 135 tests
npm run test:unit        # 57
npm run test:integration # 69
```

```
test/
├── setup.js          # root hooks: nock bloquea toda la red salvo loopback
├── fixtures/         # CSVs de ejemplo: válido, malformado, vacío, sólo cabecera, CRLF
├── unit/             # funciones puras y piezas aisladas, sin Express
│   ├── errors.test.js          # notFound y errorHandler contra req/res falsos
│   ├── files.parser.test.js    # cada regla de descarte, una por test
│   ├── files.service.test.js   # fallas parciales, paralelismo, contadores, filtro
│   └── processErrors.test.js   # handlers de proceso sobre un target inyectado
└── integration/      # supertest contra buildApp(), con el API externo stubbeado
    ├── errors.test.js           # un error no controlado sale como JSON 500 sin stack
    ├── files.data.test.js       # el contrato de GET /files/data punta a punta
    ├── files.data.filter.test.js # el filtro ?fileName=: 200/400/404 y una sola descarga
    ├── files.list.test.js       # el contrato de GET /files/list punta a punta
    ├── files.repository.test.js # el envoltorio del API externo y sus fallas
    ├── files.routes.test.js     # health, 404, CORS, buildApp
    ├── httpClient.test.js       # timeouts y traducción de errores de axios
    ├── processErrors.test.js    # el proceso sobrevive de verdad, en un hijo real
    └── testEnvironment.test.js  # la suite no toca la red ni depende del entorno
```

**La suite corre sin red real.** `test/setup.js` instala root hooks que bloquean todo el tráfico
saliente salvo loopback: cualquier request que se escape de un stub falla ruidosamente en vez de salir
a internet. Los archivos del API externo se sirven con `nock`; la app se construye con `buildApp()`,
que devuelve la app sin llamar a `listen()` y acepta un destino de log que los tests leen para afirmar
sobre la línea emitida.

Dos tests cuidan reglas transversales en vez de una feature: `testEnvironment.test.js` verifica que la
suite no dependa de ninguna variable de entorno ni alcance la red, y `processErrors.test.js` levanta un
proceso hijo real para comprobar que un `uncaughtException` no lo mata — afirmarlo con un doble sólo
probaría el doble.

## CI y git hooks

En cada push a `main` y en cada pull request, GitHub Actions corre la suite sobre **NodeJS 14**
(`.github/workflows/ci.yml`), que es el runtime que exige el challenge:

| Check | Corre |
|---|---|
| `unit tests on NodeJS 14` | `npm run test:unit` |
| `integration tests on NodeJS 14` | `npm run test:integration` |
| `npm test on NodeJS 14` | `npm test` con el entorno vaciado: `env -i "PATH=$PATH" "HOME=$HOME"` |
| `npm run lint on NodeJS 14` | `npm run lint` — [StandardJS](#estilo-de-código) |

Unit e integration reportan checks separados —y ninguno cancela al otro— para que se vea cuál falló sin
abrir el log. El tercero es el comando exacto que corre el evaluador, sobre un entorno sin variables:
verificar eso desde adentro de la suite sólo probaría la suite. El runner está fijado a `ubuntu-22.04`
porque NodeJS 14 no está compilado contra la glibc de `ubuntu-24.04`.

`npm install` instala los hooks vía husky (script `prepare`):

| Hook | Qué corre | Bloquea si |
|---|---|---|
| `pre-commit` | `npm run test:unit` | algún test unitario falla |
| `commit-msg` | `commitlint` | el mensaje no sigue [Conventional Commits](https://www.conventionalcommits.org/) |

El pre-commit corre sólo la suite unitaria: son milisegundos y no toca la red. La de integración queda
para el CI.

```
feat: add the files repository
fix: discard CSV lines with a non-numeric number
docs: document the response contracts
```

Types válidos: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`,
`test`. Para saltear los hooks en una emergencia: `git commit --no-verify`.

## Puntos opcionales

Tres de los cuatro están implementados. El alcance obligatorio está completo.

| Punto opcional | Estado | Tarjeta |
|---|---|---|
| [`GET /files/list`](#get-fileslist) | **implementado** | `TASK-009` |
| [Filtro `GET /files/data?fileName=`](#filtro-opcional-filename) | **implementado** | `TASK-010` |
| [StandardJS](#estilo-de-código) | **implementado** | `TASK-011` |
| Docker | **implementado** | `TASK-012` |

Fuera de la lista del enunciado, sí se agregaron: **CI en GitHub Actions sobre NodeJS 14**, **git hooks**
con husky y commitlint, **una línea de log estructurada por request**, y un **endpoint de health**.

## Docker: cómo está hecha la imagen

```bash
docker build -t toolbox-api .
docker run --rm -p 3000:3000 toolbox-api
```

**La imagen publica varias arquitecturas**, así que el contenedor corre NodeJS 14 nativo en cualquier
máquina, sin emulación:

```
$ docker run --rm toolbox-api node -v
v14.21.3
```

La imagen instala sólo dependencias de producción y con `--ignore-scripts`, porque el hook `prepare`
de husky no tiene repositorio git donde instalarse ni sentido dentro de una imagen. El `CMD` invoca
`node` directamente y no `npm start`: npm quedaría entre las señales y el proceso, y el contenedor no
se podría detener limpiamente.

O con Compose:

```bash
docker compose up --build      # API en http://localhost:3000
```

### Las dos apps juntas

**Cada repo tiene su propio `docker-compose.yml` con un solo servicio**, así que ninguno depende de
dónde esté clonado el otro. Para levantar todo, un `docker compose up` en cada uno, en dos terminales:

```bash
cd toolbox-challenge-backend  && docker compose up --build   # API en :3000
cd toolbox-challenge-frontend && docker compose up --build   # app en :8080
```

El cliente es un bundle estático: su JavaScript corre en el navegador, no en el contenedor, así que
alcanza el API en `localhost:3000` de la máquina anfitriona. Por eso alcanza con que cada servicio
publique su puerto y no hace falta una red compartida de Compose.

## Decisiones de diseño

Donde el enunciado dejaba una puerta abierta, ésta es la que se eligió y por qué.

### Formato de los datos

- **Una línea es válida con exactamente cuatro columnas no vacías**, la tercera numérica y la cuarta de
  32 caracteres hexadecimales. Todo lo demás se descarta.
- **`hex` se valida entero**, `/^[0-9a-f]{32}$/i`: el enunciado pide "32 dígitos", no un string
  cualquiera. Descarta 5 filas reales con 30 caracteres.
- **`number` con `Number.isFinite(Number(x))`**, la lectura literal de "numérico" — acepta `1e5`. Si se
  esperan sólo enteros, es un regex en `files.parser.js`.
- **Más de cuatro columnas también se descarta.** Es la única regla por encima de los criterios: el CSV
  no usa comillas, así que una coma de más es dato corrupto, y aceptarla obligaría a elegir
  arbitrariamente cuáles cuatro columnas valen.
- **La cabecera se descarta por posición**, no por su texto: una cabecera inesperada inflaría
  `lines_discarded`, que mide datos corruptos.
- **Las líneas en blanco no cuentan como descartadas.** Evita que un salto final o un `\r\n` invente
  descartes.
- **`file` sale del nombre pedido**, no de la primera columna: es el único que el cliente puede
  correlacionar con el listado.
- **Un archivo sin líneas válidas se incluye con `"lines": []`.** Omitirlo haría indistinguibles tres
  cosas distintas: no traía nada usable, no existe, o no se pudo descargar.

### El filtro `?fileName=`

- **Filtra antes de descargar.** Recortar el resultado daría la misma respuesta gastando N−1 descargas,
  que es justo lo que el punto opcional evita: contra el API real son 1 descarga en vez de 9.
- **Un nombre que no está en el listado responde `404`**, no `200` con `[]`. `[]` ya significa "no traía
  nada usable"; usarlo también para "no existe" mezcla un dato con un nombre mal escrito.
- **Reutiliza `EXTERNAL_API_FILE_NOT_FOUND`** en vez de un código nuevo: para el cliente significa lo
  mismo, y *cómo* se enteró el API es detalle de implementación.
- **Un `fileName` vacío o repetido es `400`.** Tratarlo como ausente sería adivinar la intención de quien
  pidió filtrar sin decir por qué archivo.
- **No cambia el contrato:** mismo array pelado, y una descarga fallida sigue degradando a `200` con `[]`.

### Resiliencia

- **El parser descarta, no lanza.** Cuenta las líneas inválidas y el controller las publica como
  `lines_discarded`; un archivo con basura no rompe la respuesta de los demás.
- **Descargas en paralelo con `Promise.allSettled`**, que es lo que hace parcial a una falla parcial: una
  rechazada no cancela las otras y el orden permite reasociar cada fallo con su archivo.
- **La falla del listado sí propaga**, con `502`. Sin listado no hay nada parcial que devolver, y un
  `200` con `[]` mentiría diciendo que el API externo no tiene archivos.
- **Un `uncaughtException` no reinicia el proceso: se loguea y el servidor sigue.** Es lo contrario de la
  práctica habitual, y es deliberado: acá `npm start` es todo el deploy, no hay supervisor que levante
  otro, y siendo un proxy de sólo lectura sin estado entre requests la siguiente request se sirve igual.

### HTTP

- **Un solo header CORS**, `Access-Control-Allow-Origin: *`. El API es de sólo lectura, sin credenciales
  ni headers custom, así que sus `GET` son *simple requests* y nunca disparan un preflight.
- **`notFound` y `errorHandler` en un archivo.** No pueden ser la misma función —Express los distingue
  por aridad— pero son las dos puntas de la misma cadena.
- **Los errores son una factory sobre `Error`**, no subclases: conserva el stack sin introducir clases.
- **El stack nunca sale al cliente.** Un error no tipado se reporta como `Internal server error` y la
  causa real queda en la línea de log.

### Plataforma

- **ESM nativo** en vez de CommonJS: obliga a extensiones `.js` explícitas, pero es JavaScript moderno
  sin transpilar — y el enunciado prohíbe Babel en el API.
- **Sin variables de entorno**, como pide el enunciado. Hardcodear en `src/shared/config.js` evita además
  parseo de strings y defaults duplicados.
- **Versiones fijadas por Node 14**: `pino@8`, `chai@4`, `mocha@10`, `sinon@15`, `standard@17`. Las
  siguientes majors exigen Node 18+.
- **Todo el código en inglés**; la documentación, en español.

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

## Historias de usuario

El backlog completo del proyecto —las 12 historias con criterios de aceptación en Gherkin, estimación
y chequeo INVEST— está en [`docs/user-stories.md`](docs/user-stories.md).
