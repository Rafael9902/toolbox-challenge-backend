---
name: logging
description: Contrato de logging de este API — una sola línea por request con pino, que se enriquece con req.logger.add() a lo largo del camino. Usar SIEMPRE al agregar logging, al instrumentar una capa, al manejar un error, al agregar un endpoint, o cuando aparezca la tentación de escribir console.log.
---

# Una línea de log por request

El proyecto sigue la idea de [loggingsucks.com](https://loggingsucks.com/): en vez de desparramar
líneas por el stack, **cada request produce una sola línea JSON**, ancha, con todo el contexto
necesario para entender qué pasó.

El transporte es **pino**. Todo vive en `src/shared/logger.js`.

## La regla

**Una request produce exactamente una línea.** Ni cero, ni tres.

`console.log` está prohibido en todo el proyecto. Si querés registrar algo, sumalo a la línea de la
request:

```bash
# chequeo de control: no debe devolver nada
grep -rn "console\." src --include='*.js'
```

## Cómo enriquecer

El middleware cuelga un acumulador de `req`. Desde cualquier punto del camino de la request:

```js
req.logger.add({ files_failed: 2, lines_discarded: 37 })
```

Se acumula en memoria y se escribe **una sola vez**, cuando la respuesta termina.

**El acumulador vive en `req`, no en el módulo.** Un `logger.add()` global mezclaría los atributos de
requests concurrentes: es un bug de concurrencia, no una cuestión de estilo.

## Quién enriquece

Sólo dos lugares: **el middleware y el controller**. El service no sabe que el logging existe — devuelve
`{ data, stats }` y el controller pliega las `stats`:

```js
// service — cero acoplamiento con el logging
getFilesData: async ({ fileName }) => ({
  data: files,
  stats: { files_listed: 12, files_failed: 2, lines_discarded: 37 }
})

// controller — tiene req, es el único que toca la línea
const { data, stats } = await filesService.getFilesData({ fileName })
req.logger.add(stats)
res.status(200).json(data)
```

El `errorHandler` de `shared/http/` también agrega el objeto `error`. Usa `req.logger?.add(...)`:
si el handler de errores explota, el proceso se cae.

## Campos

**Constantes** — los pone pino vía `base`: `service`, `version`.
**Automáticos de pino**: `level`, `time`.
**Del middleware**: `request_id`, `method`, `path`, `status_code`, `duration_ms`.
**De dominio**, vía `req.logger.add()`:

```
filter_file_name          nombre pedido por ?fileName=, si vino
files_listed              cuántos archivos devolvió el API externo
files_succeeded           cuántos se descargaron y parsearon bien
files_failed              cuántos fallaron
files_failed_names        nombres de los que fallaron
lines_valid               líneas que sobrevivieron al parseo
lines_discarded           líneas descartadas por formato inválido
error                     { type, code, message, retriable }
```

Convención: `snake_case`, agrupados por prefijo de dominio, valores planos y agregables. Sin PII y
**nunca el token del API externo**.

Estos campos no son decorativos: el dominio de este challenge son las **fallas parciales**, y una
línea que dice `files_failed_names: ["file2.csv"], lines_discarded: 37` cuenta toda la historia de la
request de un vistazo.

## Testear el logging

`createRequestLogger(destination)` acepta cualquier objeto con `write`. `buildApp({ logDestination })`
lo expone:

```js
const lines = []
const logDestination = { write: (line) => lines.push(JSON.parse(line)) }
const app = buildApp({ logDestination })

await request(app).get('/files/health').expect(200)
expect(lines).to.have.lengthOf(1)
```

## Anti-patrones

- ❌ Varias líneas por request.
- ❌ `console.log` de debug que queda en el código.
- ❌ Un acumulador a nivel de módulo (`logger.add()` sin `req`).
- ❌ Loguear el objeto `req` o `res` entero.
- ❌ Confundir "logging estructurado" con esto: 20 líneas JSON por request siguen siendo 20 líneas.

## Nota de versión

**pino 8**, no 9: la 9 exige Node 18+. Ver la skill `node14-constraints`.
