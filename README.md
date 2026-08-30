# toolbox-challenge-backend

API REST que consume el API externo de Toolbox (`https://echo-serv.tbxnet.com`), formatea el contenido
de sus archivos CSV descartando las líneas inválidas, y lo expone como JSON en `GET /files/data`.

> **Estado:** el alcance obligatorio del challenge está completo (`BACKEND - TASK-001` a `TASK-008`),
> más el punto opcional `GET /files/list` (`TASK-009`). El detalle de los opcionales que faltan está
> en [Puntos opcionales](#puntos-opcionales).

**Índice:** [Requisitos](#requisitos) · [Instalación y uso](#instalación-y-uso) ·
[Endpoints](#endpoints) · [Contra el API externo real](#contra-el-api-externo-real) ·
[Decisiones de diseño](#decisiones-de-diseño) · [Puntos opcionales](#puntos-opcionales) ·
[Arquitectura](#arquitectura) · [Logging](#logging) · [Configuración](#configuración) ·
[Tests](#tests) · [CI y git hooks](#ci-y-git-hooks)

---

## Requisitos

| Ítem | Valor |
|---|---|
| Runtime | **NodeJS 14** (probado en `v14.21.3`, npm `6.14.18`) |
| Dependencias globales | ninguna — todo sale de `package.json` |
| Variables de entorno | ninguna, ni obligatoria ni opcional |
| Puerto por defecto | **3000** |

El repo incluye `.nvmrc`, así que alcanza con:

```bash
nvm use     # lee .nvmrc -> 14
node -v     # debe imprimir v14.21.3
```

### Apple Silicon (macOS con chip M1/M2/M3): leer antes de instalar

**NodeJS 14 no tiene build para macOS arm64.** Es anterior al soporte oficial de Apple Silicon, así
que `nvm install 14` en una terminal arm64 falla o instala algo que no arranca. Hay que instalar la
build **x64** y correrla bajo **Rosetta 2**, desde un shell x86_64:

```bash
arch -x86_64 zsh          # abre un shell x86_64 (Rosetta)
nvm install 14            # ahora instala la build x64
nvm use                   # lee .nvmrc -> 14
node -v                   # v14.21.3
node -p "process.arch"    # x64
```

**Todos** los comandos del proyecto —`npm install`, `npm start`, `npm test`— van desde ese mismo
shell. Si `node -v` no dice `v14.x`, lo que estés verificando no vale: Node 16+ tiene APIs que Node 14
no (`fetch`, `crypto.randomUUID`, `String.prototype.replaceAll`), y algo que "anda" ahí puede romper
en el runtime que exige el challenge.

Si Rosetta 2 no está instalado: `softwareupdate --install-rosetta`.

## Instalación y uso

```bash
npm install              # instalar dependencias
npm start                # levantar el API en http://localhost:3000
npm test                 # correr toda la suite (Mocha + Chai)
npm run test:unit        # sólo los tests unitarios
npm run test:integration # sólo los tests de integración
```

`npm start` escribe una línea y queda escuchando:

```json
{"level":30,"time":1787956126291,"service":"toolbox-challenge-backend","version":"1.0.0","event":"server_started","port":3000}
```

Un clon limpio arranca con `npm install && npm start`: **no hay nada que configurar**. Todos los
valores —incluidos la URL y el token del API externo— viven en `src/shared/config.js`; ver
[Configuración](#configuración).

## Endpoints

Todas las respuestas, incluidas las de error, salen en `application/json`.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/files/data` | Lista, descarga y formatea todos los archivos del API externo |
| `GET` | `/files/list` | Devuelve el listado de archivos tal cual lo expone el API externo |
| `GET` | `/files/health` | Verifica que la aplicación está en pie |

### `GET /files/data`

```bash
curl -s http://localhost:3000/files/data
```

El cuerpo es un **array pelado, sin envoltorio**, tal como lo fija el enunciado. Cada elemento es un
archivo; cada línea válida, un `{ text, number, hex }`:

```json
[
  {
    "file": "test1.csv",
    "lines": []
  },
  {
    "file": "test3.csv",
    "lines": [
      { "text": "g", "number": 101382507, "hex": "65badd1f29e6235199261cd3026a97f5" },
      { "text": "mwmBQxoeKkxMm", "number": 57685292, "hex": "cb6dfa6422d170d2ae99aaf3f99665e4" },
      { "text": "clnburZYpPQgBiveSSeq", "number": 527447, "hex": "b57c543e4d1f0dab7d4353f9dd0db302" }
    ]
  }
]
```

> Respuesta real recortada a dos archivos. La corrida completa del 2026-08-28 devolvió 7 archivos;
> ver [Contra el API externo real](#contra-el-api-externo-real).

| Campo | Tipo | Origen |
|---|---|---|
| `file` | `string` | Nombre del archivo procesado, **no** la primera columna del CSV |
| `lines[].text` | `string` | Segunda columna |
| `lines[].number` | `number` | Tercera columna, ya convertida a número |
| `lines[].hex` | `string` | Cuarta columna, 32 caracteres hexadecimales |

**Comportamiento ante fallas** (el detalle del *por qué* está en [Decisiones de diseño](#decisiones-de-diseño)):

| Situación | Respuesta |
|---|---|
| Falla la descarga de un archivo | `200`. Ese archivo se omite, los demás se devuelven igual |
| Fallan **todas** las descargas | `200` con `[]` |
| Archivo vacío, sólo cabecera, o sin ninguna línea válida | `200`. Se incluye con `"lines": []` |
| Falla el **listado** | `502` con un error JSON: no hay nada parcial que devolver |

Nada de esto se pierde: los archivos que fallaron y las líneas descartadas quedan contados en la
línea de log de la request. Ver [Logging](#logging).

### `GET /files/list`

```bash
curl -s http://localhost:3000/files/list
```

Devuelve el listado **tal cual lo expone el API externo**, con su envoltorio `{ "files": [...] }` y sin
reformateo: mismos nombres, mismo orden. Corrida real del **2026-08-30**, byte a byte idéntica a la del
API externo:

```json
{
  "files": [
    "test1.csv", "test2.csv", "test3.csv", "test18.csv", "test4.csv",
    "test5.csv", "test6.csv", "test9.csv", "test15.csv"
  ]
}
```

Es el opuesto deliberado de `/files/data`, que va como array pelado: **las dos formas las fija el
enunciado**, así que ninguna se envuelve ni se desenvuelve por gusto. Internamente el repositorio
traduce el envoltorio al array de nombres que usa el dominio, y el controller de este endpoint lo
vuelve a poner al salir.

Este endpoint **no descarga ningún archivo**: es una sola llamada al listado del API externo. Si ese
listado falla, la respuesta es el mismo `502` con error JSON que devuelve `/files/data`; acá no hay
nada parcial que entregar.

### `GET /files/health`

```bash
curl -s http://localhost:3000/files/health
```

```json
{ "status": "ok" }
```

### Errores

Toda respuesta de error sale en `application/json`, nunca en HTML, y **nunca incluye el stack trace**.
La forma es siempre la misma:

```bash
curl -s http://localhost:3000/unknown
```

```json
{ "error": { "code": "ROUTE_NOT_FOUND", "message": "Route not found: GET /unknown" } }
```

Con el API externo caído:

```json
{ "error": { "code": "EXTERNAL_API_UNAVAILABLE", "message": "External API request failed: /files" } }
```

| Código | HTTP | Cuándo |
|---|---|---|
| `ROUTE_NOT_FOUND` | `404` | La ruta pedida no existe |
| `EXTERNAL_API_UNAVAILABLE` | `502` | El listado del API externo falló, expiró el timeout, o devolvió un cuerpo que no sigue la forma `{ "files": [...] }` |
| `INTERNAL` | `500` | Cualquier error no tipado que llegue al handler terminal. El mensaje al cliente es genérico (`Internal server error`); el real queda en el log |

Dos códigos más existen en `src/shared/appError.js` y hoy no llegan al cliente, pero se documentan
porque sí aparecen en los logs o están reservados:

- **`EXTERNAL_API_FILE_NOT_FOUND`** — lo produce el cliente HTTP cuando el API externo responde `404`
  a la descarga de un archivo. No sale al cliente: una descarga fallida es una falla parcial y se
  reporta en `files_failed_names`, no como error de la request.
- **`INVALID_QUERY_PARAM`** — reservado para el filtro opcional `?fileName=` (`TASK-010`), sin uso hoy.

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

## Decisiones de diseño

### Formato y validación de los datos

- **Una línea es válida cuando tiene exactamente cuatro columnas no vacías**, la tercera numérica y la
  cuarta de 32 caracteres hexadecimales. Cualquier otra cosa se descarta.
- **`hex` se valida con `/^[0-9a-f]{32}$/i`.** El enunciado pide un "hexadecimal de 32 dígitos", así
  que se validan las 32 posiciones en vez de aceptar cualquier string; las mayúsculas se aceptan. En
  la corrida medida esto descartó 5 filas con `hex` de 30 caracteres, que de otro modo pasarían.
- **`number` se valida con `Number.isFinite(Number(x))`.** Acepta cualquier literal numérico de
  JavaScript, incluidos `1e5` o `-3.5`. Es la lectura literal de "numérico". Si la expectativa fuera
  sólo enteros decimales, es cambiar esa línea de `files.parser.js` por un `/^\d+$/`.
- **También se descartan las líneas con *más* de cuatro columnas.** La historia de usuario sólo hablaba
  de "menos de 4"; ésta es la única regla que va por encima de los criterios. El razonamiento: el CSV
  no usa comillas, así que una coma de más no puede ser un campo con coma adentro — es dato corrupto,
  y admitirlo significaría elegir arbitrariamente cuáles cuatro columnas son las buenas. Descarta 3
  filas reales.
- **La cabecera se descarta por posición**, no comparando su texto. Una cabecera inesperada contaría
  como línea inválida e inflaría `lines_discarded`, que es una métrica de datos corruptos.
- **Las líneas en blanco se ignoran y no se cuentan como descartadas**, incluida la final. Es lo que
  evita que un salto de línea al cierre o los finales `\r\n` inventen descartes.
- **El campo `file` sale del nombre del archivo procesado**, no de la primera columna del CSV: es el
  nombre con el que se pidió el archivo y el único que el cliente puede correlacionar con el listado.
- **Un archivo sin líneas válidas se incluye con `"lines": []`**, no se omite. Omitirlo haría
  indistinguible "el archivo existe pero no traía nada usable" de "el archivo no existe" o "no se pudo
  descargar", que son tres cosas distintas. En las corridas reales es el caso de la mayoría de los
  archivos.

### Resiliencia

- **El parser descarta, no falla.** `files.parser.js` es una función pura que nunca lanza por datos
  corruptos: cuenta las líneas inválidas en `discarded` y el controller las publica como
  `lines_discarded`. Un archivo con basura no rompe la respuesta de los demás.
- **Las descargas van en paralelo con `Promise.allSettled`**, que es lo que hace que una falla parcial
  sea parcial: una descarga rechazada no cancela a las otras, y los resultados conservan el orden del
  listado, así que cada fallo se puede reasociar con su archivo.
- **La falla del listado sí propaga.** No tiene nada de parcial: sin listado no hay nada que devolver,
  así que sale un `502` en vez de un `200` con `[]`, que mentiría diciendo que el API externo no tiene
  archivos.
- **Un `uncaughtException` no reinicia el proceso: se loguea y el servidor sigue en pie.** Es lo
  contrario de la práctica habitual —loguear y salir, para que un supervisor levante un proceso limpio—
  y es deliberado. Acá `npm start` es todo el deploy: no hay supervisor que reinicie nada, así que
  salir deja al evaluador sin API. Y el riesgo que justifica salir, un proceso con estado corrupto, no
  aplica: este API es un proxy de sólo lectura que no guarda nada entre requests, así que la siguiente
  se sirve igual de bien. En un deploy con supervisor la decisión se revierte.

### HTTP

- **Las dos formas de respuesta las fija el enunciado, y ninguna se toca.** `/files/data` va como array
  pelado y `/files/list` con el envoltorio `{ "files": [...] }` del API externo. Son contrarias entre sí
  y así se dejan: uniformarlas —o agregarles un envelope `{ meta, data }`— rompería lo único que el
  evaluador verifica copiando el curl del enunciado. La traducción vive en los bordes: el repositorio
  desenvuelve el listado para el dominio, y el controller de `/files/list` lo vuelve a envolver al salir.
- **CORS: se responde `Access-Control-Allow-Origin: *`.** El frontend se sirve desde otro puerto, así
  que sin ese header el browser bloquea la respuesta. Es el **único** header CORS que se manda: el API
  es de sólo lectura, no recibe credenciales ni headers custom, así que sus `GET` son *simple requests*
  y nunca disparan un preflight `OPTIONS`. Agregar `Allow-Methods` o `Allow-Headers` sería ruido.
- **`notFound` y `errorHandler` viven en el mismo archivo.** No pueden ser la misma función —Express
  los distingue por aridad, 3 parámetros contra 4— pero son las dos puntas de la misma cadena.
- **Los errores son una factory sobre `Error`**, no subclases: conserva el stack trace sin introducir
  clases.
- **El stack trace nunca sale al cliente**, y un error no tipado se reporta como `Internal server
  error`. El detalle real queda en la línea de log.

### Plataforma

- **ESM nativo** (`"type": "module"`) en vez de CommonJS. Obliga a extensiones `.js` explícitas en los
  imports relativos, pero es JavaScript moderno sin transpilar — y el challenge prohíbe Babel.
- **Sin variables de entorno.** El challenge las prohíbe como requisito; hardcodear en
  `src/shared/config.js` evita además el parseo de strings y los defaults duplicados.
- **Versiones fijadas por Node 14**: `pino@8` (la 9 exige Node 18+), `chai@4` (la 5 es ESM-only y exige
  Node 18+), `mocha@10`, `sinon@15`. El detalle está en `.claude/skills/node14-constraints/`.
- **Todo el código fuente en inglés** —identificadores, comentarios, mensajes de error, nombres de
  tests—. La documentación queda en español.

## Puntos opcionales

Uno de los cuatro está implementado. El alcance obligatorio está completo.

| Punto opcional | Estado | Tarjeta |
|---|---|---|
| [`GET /files/list`](#get-fileslist) | **implementado** | `TASK-009` |
| Filtro `GET /files/data?fileName=` | pendiente | `TASK-010` |
| StandardJS | pendiente | `TASK-011` |
| Docker | pendiente | `TASK-012` |

El código ya está preparado para el filtro: el repositorio expone `listFiles` y `downloadFile` por
separado, y el código de error `INVALID_QUERY_PARAM` está declarado a la espera de su validación.

Fuera de la lista del enunciado, sí se agregaron: **CI en GitHub Actions sobre NodeJS 14**, **git hooks**
con husky y commitlint, **una línea de log estructurada por request**, y un **endpoint de health**.

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
npm test                 # 105 tests
npm run test:unit        # 50
npm run test:integration # 55
```

```
test/
├── setup.js          # root hooks: nock bloquea toda la red salvo loopback
├── fixtures/         # CSVs de ejemplo: válido, malformado, vacío, sólo cabecera, CRLF
├── unit/             # funciones puras y piezas aisladas, sin Express
│   ├── errors.test.js          # notFound y errorHandler contra req/res falsos
│   ├── files.parser.test.js    # cada regla de descarte, una por test
│   ├── files.service.test.js   # fallas parciales, paralelismo, contadores
│   └── processErrors.test.js   # handlers de proceso sobre un target inyectado
└── integration/      # supertest contra buildApp(), con el API externo stubbeado
    ├── errors.test.js           # un error no controlado sale como JSON 500 sin stack
    ├── files.data.test.js       # el contrato de GET /files/data punta a punta
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
