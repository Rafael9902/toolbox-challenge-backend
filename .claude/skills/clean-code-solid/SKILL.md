---
name: clean-code-solid
description: Principios de diseño de este proyecto — simplicidad primero, clean code, SOLID traducido a programación funcional, y la lista explícita de patrones descartados. Usar SIEMPRE antes de introducir una abstracción, una capa, un patrón de diseño o una dependencia nueva; y al revisar o refactorizar código existente.
---

# Simple primero — clean code, patrones y SOLID

**La simplicidad es el criterio de desempate.** Ante dos diseños que resuelven el problema, gana el que tiene menos piezas. Un patrón de diseño se introduce cuando resuelve un problema que ya existe, nunca uno que podría existir.

## SOLID en programación funcional

Sin clases, los principios siguen aplicando — cambia la forma:

- **SRP** — un archivo, una responsabilidad. El parser sólo parsea. El repository sólo hace I/O. Si el nombre del archivo necesita un "y", partilo.
- **OCP** — una feature nueva es una carpeta nueva en `src/modules/` más una línea en `app.js`. Si agregar algo obliga a editar módulos existentes, el diseño no está cerrado a modificación.
- **Encapsulación** — un módulo declara su API pública en `index.js` y expone sólo su router. `app.js` nunca importa un archivo interno de una feature.
- **LSP** — cualquier fake que respete la firma de una dependencia inyectada tiene que funcionar en su lugar. Es lo que hace posible testear con objetos literales.
- **ISP** — cuando inyectes, pasá funciones concretas, no módulos enteros. `{ random }`, no `{ utils }`.
- **DIP** — se aplica en el borde: la infraestructura de `shared/` se expone como factory para que los tests puedan intercambiarla. Dentro de un módulo las capas se importan directo; ver `feature-module`.

## Clean code — reglas concretas

- Funciones cortas, un nivel de abstracción por función.
- **Sin parámetros booleanos de control.** `getFiles({ fileName })` en vez de `getFiles(name, true)`. Si un flag cambia el comportamiento, son dos funciones.
- Nombres del dominio **en inglés**: `discardedLines`, no `lineasDescartadas` ni `cnt2`.
- Early return en vez de `else` anidado.
- Sin código muerto, sin `TODO` sin dueño, sin variables sin usar.
- Inmutabilidad por default: `map`/`filter`/`reduce` en vez de mutar acumuladores. Config congelada con `Object.freeze`.
- Errores tipados con `createAppError`, nunca `throw new Error('algo falló')`.

## Idioma del código: inglés

**Todo lo que vive dentro de `src/`, `test/` y `scripts/` se escribe en inglés.** Sin excepciones:

| Elemento | Regla |
|---|---|
| Identificadores (variables, funciones, archivos) | inglés |
| Comentarios y JSDoc | inglés |
| Descripciones de tests (`describe` / `it`) | inglés |
| Mensajes de error y códigos | inglés |
| Campos de la línea de log | inglés, `snake_case` |
| Salida de los scripts de `scripts/` | inglés |

La documentación (`README.md`, estas skills, las HUs) sí va en español: es para el equipo, no para
el runtime.

## Documentación: JSDoc, y nada más

Las funciones exportadas llevan **JSDoc**: una línea de descripción, y los `@param` / `@returns` /
`@throws` que apliquen. Es la única documentación que va en el código.

```js
/**
 * Creates a typed application error.
 *
 * @param {Object}  params
 * @param {string}  params.code               One of {@link ERROR_CODES}.
 * @param {string}  params.message            Description safe to send to the client.
 * @param {number}  [params.status=500]       HTTP status to respond with.
 * @param {boolean} [params.retriable=false]  Whether retrying may succeed.
 * @returns {Error} Error with `name` set to `AppError` plus the fields above.
 */
```

Usá `@typedef` cuando una forma se repite (`ServiceResult`, el cliente HTTP) en vez de describirla
dos veces.

**Lo que NO va en el código:**

- ❌ Prosa explicando por qué se eligió un diseño. Eso vive en estas skills y en el README.
- ❌ Comentarios que repiten lo que la línea siguiente ya dice.
- ❌ Historia del proyecto, alternativas descartadas, referencias a tarjetas.

Comentarios sueltos `//` sólo para directivas (`eslint-disable-next-line`) o para advertir de algo
que rompería el código si se toca —por ejemplo, que Express detecta el handler de errores por su
aridad de 4 parámetros, así que `next` no se puede borrar aunque no se use—. Una línea, no un párrafo.

## Patrones que se ganan el lugar acá

- **Factory function** → sólo en `shared/`, y sólo donde un test necesita intercambiar la dependencia
  de verdad (`createRequestLogger`, `createHttpClient`).
- **Repository** → aísla el API externo detrás de un contrato propio.
- **Adapter** → el repository traduce la forma del API externo a la del dominio.

Tres. No hacen falta más.

**Contraejemplo deliberado:** las capas de un módulo (`routes` → `controller` → `service`) se cablean
con imports directos, no con factories. Un parámetro de cableado que ningún test usa no es inversión
de dependencias: es ceremonia. Y meter el cableado del módulo en `app.js` filtraba sus internas al
root global, que es peor que el problema que resolvía.

## Descartados a propósito — no los reintroduzcas

Esta lista existe para que una sesión futura no "mejore" el diseño agregando complejidad. Si creés que alguno hace falta, justificá con un problema **real y presente**, no hipotético.

| Descartado | Por qué |
|---|---|
| Contenedor de DI (awilix, inversify) | Casi nada se inyecta: las capas de un módulo se importan directo. Un contenedor agrega magia y una dependencia. |
| Clases y herencia | No hay estado que encapsular ni jerarquía real. Las factories cubren el caso. |
| Tipo `Result` / `Either` | `Promise.allSettled` ya modela la falla parcial, que es el único caso que lo pedía. |
| `AsyncLocalStorage` para el contexto de log | El acumulador vive en `req` y el controller lo llena: más simple, más testeable y sin acoplar el dominio al logging. |
| Capa de "use cases" separada del service | Duplicaría el service sin agregar nada en un API de este tamaño. |
| Event emitters / pub-sub interno | No hay asincronía desacoplada que lo justifique. |
| ORM o capa de persistencia | No hay base de datos. El repository habla HTTP. |
| Validador de esquemas (joi, zod) | Hay un solo query param. Una validación explícita alcanza. |
| Envelope de respuesta (`{ meta, data }`) | El enunciado fija textualmente la forma de `/files/data` y `/files/list`. Envolverlas rompe el único contrato verificable copiando el curl del enunciado. Ver `feature-module`. |

## Antes de agregar una abstracción, preguntate

1. ¿Qué problema **concreto y actual** resuelve?
2. ¿Cuántos lugares del código la usarían hoy? Si es uno, no es una abstracción: es indirección.
3. ¿Alguien que lee el código por primera vez la entiende sin explicación?

Si alguna respuesta flaquea, escribí la versión simple.
