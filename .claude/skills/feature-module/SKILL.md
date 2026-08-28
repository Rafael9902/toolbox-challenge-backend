---
name: feature-module
description: Reglas de la arquitectura modular por feature de este API (routes → controller → service → repository, encapsulación del módulo, reglas de import). Usar SIEMPRE al crear o modificar cualquier archivo dentro de src/modules/ o src/shared/, al agregar un endpoint, al mover lógica entre capas, o al decidir dónde va una pieza de código nueva.
---

# Arquitectura modular por feature

Cada feature es una carpeta autocontenida en `src/modules/<feature>/`.

**Todo el código va en inglés** —nombres, comentarios, mensajes de error—. Ver la skill `clean-code-solid`.

## Anatomía de un módulo

```
src/modules/<feature>/
├── index.js                  # barril: declara la API pública del módulo
├── <feature>.routes.js       # exporta <feature>Router
├── <feature>.controller.js   # handlers: tocan req/res
├── <feature>.service.js      # lógica de dominio, datos planos
├── <feature>.repository.js   # I/O contra el API externo      sólo si hay I/O
└── <feature>.parser.js       # transformaciones PURAS          sólo si hay que parsear
```

Convención de nombres de archivo: `<feature>.<capa>.js`, siempre en singular para la capa.

**No agregues capas que no tengan trabajo real.** Si la feature no hace I/O, no lleva repository; si
no transforma texto, no lleva parser. Una capa que sólo reenvía la llamada a la de abajo es
indirección, no arquitectura.

## Encapsulación: el barril es la única puerta

Un módulo expone **su router y nada más**, y lo declara en su `index.js`. El service, el controller y
el repository son privados de la feature.

```js
// src/modules/files/index.js — la API pública, en un solo lugar
export { filesRouter } from './files.routes.js'

// src/app.js — importa del barril, nunca de un archivo interno
import { filesRouter } from './modules/files/index.js'
app.use('/files', filesRouter)
```

El barril no acorta el path: **ESM no resuelve directorios**, así que hay que escribir `index.js`
explícito o se rompe con `ERR_UNSUPPORTED_DIR_IMPORT`. Lo que compra es desacoplar a los consumidores
del layout interno —renombrar o partir `<feature>.routes.js` no toca `app.js`— y dejar la superficie
pública declarada en un archivo, no implícita.

Reglas del barril:

- **Sólo reexporta.** Cero lógica, cero cableado, cero imports que no sean reexports.
- **Sólo el router.** Si aparece la tentación de exportar el service, lo que falla es el límite del módulo.

`app.js` **nunca** importa un archivo interno de una feature. Si necesita hacerlo, la abstracción del
módulo está rota.

## Reglas de import

Un archivo de `src/modules/<feature>/` puede importar de:

1. **su propio módulo** — las capas se cablean entre sí con imports directos;
2. **`src/shared/`** — infraestructura transversal.

Y de ningún otro lado. **Un módulo nunca importa de otro módulo.** Si dos features necesitan lo
mismo, eso va a `shared/`; si una necesita datos de la otra, el diseño de los límites está mal.

El cableado es import directo, con namespace import para que se lea de dónde viene cada cosa:

```js
// files.controller.js
import * as filesService from './files.service.js'

export const getHealth = async (req, res, next) => {
  const { data, stats } = await filesService.getHealth()
  // ...
}
```

Sin factories y sin parámetros de cableado: el `index.js` es un barril, no un composition root.

## Reglas de capa — esto es lo que no se negocia

| Capa | Puede | NUNCA |
|---|---|---|
| `routes` | Mapear verbo + path → handler del controller | Lógica, validación, `try/catch` |
| `controller` | Tocar `req`/`res`, validar y extraer input, mapear resultado → status + JSON, plegar las `stats` del service en la línea de log | Llamar al repository, parsear, hablar con el API externo |
| `service` | Orquestar el dominio, devolver `{ data, stats }` con datos planos | Ver `req`/`res`, conocer códigos HTTP, tocar el log |
| `repository` | I/O contra el API externo, lanzar `AppError` tipado | Parsear, conocer Express, dar forma a la respuesta HTTP |
| `parser` | Transformar texto → datos. **Función pura** | I/O, logging, lanzar excepciones por datos inválidos |

Regla mnemotécnica: **cada capa sólo conoce a la de abajo.**
Si un archivo importa algo que salta una capa, está mal.

## Contratos de respuesta: no los envuelvas

El enunciado del challenge **fija textualmente** la forma de dos respuestas, con ejemplo de curl. Son
contrato, no decisión de diseño:

```jsonc
// GET /files/data  -> array pelado, sin envoltorio
[ { "file": "file1.csv", "lines": [ { "text": "RgTya", "number": 64075909, "hex": "70ad…" } ] } ]

// GET /files/list  -> espejo exacto del API externo
{ "files": ["file1.csv", "file2.csv"] }
```

**No agregues un envelope** tipo `{ meta, data }`, ni `{ success, payload }`, ni renombres campos, ni
metas paginación. Es una mejora que suena razonable y rompe lo único que el evaluador puede verificar
copiando y pegando el curl del enunciado.

El controller responde con el dato tal cual se lo dio el service:

```js
const { data, stats } = await filesService.getFilesData({ fileName })
req.logger.add(stats)
res.status(200).json(data)     // sin envolver
```

Los endpoints propios que el enunciado no especifica (`/files/health`) son libres, pero por
consistencia siguen la misma regla: cuerpo plano.

Las respuestas de error sí tienen forma propia, definida en `src/shared/http/errors.js`:
`{ "error": { "code", "message" } }`.

## Dónde sí se inyectan dependencias por parámetro

La inyección se reserva para la infraestructura de `src/shared/` que los tests necesitan intercambiar
de verdad, y se expone como factory:

| Factory | Se inyecta | Para qué |
|---|---|---|
| `createRequestLogger()` / `buildApp({ logDestination })` | `logDestination` | capturar las líneas de log en un array en vez de stdout |
| `createHttpClient({ baseUrl, token, timeoutMs })` | config | apuntar a otro host, acortar timeouts |

**No la apliques por reflejo a las capas de un módulo.** Un parámetro de cableado que ningún test usa
es ceremonia. Si más adelante una capa necesita una costura real —el caso probable es el `service`,
para probar fallas parciales con un repository falso—, se le agrega ahí y sólo ahí, con la
justificación del test concreto que lo pide.

## Consecuencia para los tests

En ESM los imports **no se pueden stubear** (`sinon` lanza `TypeError: ES Modules cannot be stubbed`).
Con imports directos, la estrategia de test es:

- **parser** y funciones puras → directo, entrada → salida.
- **service** → directo mientras no tenga I/O.
- **rutas completas** → `supertest` contra `buildApp()`.
- **middleware de `shared/`** → unitario, con dobles mínimos de `req`/`res`.

Ver la skill `testing-mocha-chai`.

## Checklist para agregar una feature

1. Crear `src/modules/<feature>/` con las capas que la feature realmente necesite.
2. Escribir la lógica pura primero (`parser`), después el `service`, después el `controller`.
3. Exportar el router desde `<feature>.routes.js`, reexportarlo en `index.js`, y montarlo en `src/app.js` con una línea.
4. Devolver las dimensiones de dominio en `stats` para que el controller las pliegue en la línea de
   log — ver la skill `logging`.
5. Test unitario de la lógica pura + test de integración de la ruta — ver la skill `testing-mocha-chai`.

## Módulo `shared`

`src/shared/` es para lo genuinamente transversal: config, errores, cliente HTTP, observabilidad.
**No es un cajón de utilidades.** Antes de poner algo ahí: si lo usa un solo módulo, va dentro de ese
módulo.
