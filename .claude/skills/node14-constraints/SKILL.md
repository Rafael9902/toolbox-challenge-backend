---
name: node14-constraints
description: Guardarraíles del runtime NodeJS 14 + ESM nativo de este proyecto. Usar SIEMPRE antes de escribir o modificar cualquier archivo .js, de agregar una dependencia a package.json, o de usar una API de Node/JavaScript. La máquina de desarrollo corre Node 22, así que el código que "funciona" localmente puede romper en el runtime objetivo.
---

# NodeJS 14 + ESM — lo que rompe y lo que no

El challenge exige **NodeJS 14**. La máquina de desarrollo corre **Node 22**. Todo lo que se escriba por reflejo moderno puede romper en producción sin que se note localmente. Verificá siempre en el runtime real (ver el final).

## ESM en Node 14 — cuatro diferencias que muerden

El proyecto usa `"type": "module"`. Esto implica:

**1. Extensión `.js` obligatoria en imports relativos.**
```js
import * as filesService from './files.service.js'   // ✅
import * as filesService from './files.service'      // ❌ ERR_MODULE_NOT_FOUND
```

**2. No existen `__dirname` ni `__filename`.**
```js
import { fileURLToPath } from 'url'
import { dirname } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
```

**3. No se puede importar JSON.** Requiere flag experimental en Node 14.
```js
import pkg from '../package.json'                         // ❌ ERR_IMPORT_ASSERTION_TYPE_MISSING
// ✅ el workaround canónico:
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pkg = require('../package.json')
```

**4. Los imports ESM no se pueden stubear.** No hay equivalente a `proxyquire`. Por eso toda dependencia se inyecta por parámetro — ver la skill `feature-module`.

## APIs que NO existen en Node 14

| No usar | Usar en su lugar |
|---|---|
| `fetch` global | `axios` (ya es dependencia) |
| `AbortController` global | la opción `timeout` de axios |
| `crypto.randomUUID()` | `crypto.randomBytes(16).toString('hex')` — `randomUUID` recién llega en 14.17 |
| `String.prototype.replaceAll` | `.split(x).join(y)` o `.replace(/x/g, y)` |
| `Object.hasOwn` | `Object.prototype.hasOwnProperty.call(obj, key)` |
| `\|\|=` `&&=` `??=` | asignación explícita — llegan en Node 15 |
| `structuredClone` | spread o `JSON.parse(JSON.stringify())` |
| `Array.prototype.at` | indexado clásico, `arr[arr.length - 1]` |
| top-level `await` | sólo desde 14.8 — envolvé en una función async |

## Sí disponibles y recomendados

`?.` · `??` · `Promise.allSettled` · `flatMap` · `Object.fromEntries` · `Array.prototype.includes` · spread/rest · destructuring · async/await · `String.matchAll` · `globalThis`

## Dependencias — versiones máximas compatibles

Varias librerías actuales exigen Node 18+. Al agregar o actualizar cualquier paquete, verificá su campo `engines`.

| Paquete | Versión | Por qué no la última |
|---|---|---|
| `express` | 4.x | 5.x no estable |
| `axios` | 1.x | Node 14 no tiene `fetch` |
| `pino` | **8.x** | **9.x exige Node 18+** |
| `mocha` | 10.x | **11.x exige Node 18+** |
| `chai` | **4.x** | **5.x es ESM-only y exige Node 18+** |
| `sinon` | 15.x | **16+ exige Node 18+** |
| `supertest` | 6.x | |
| `nock` | 13.x | |
| `standard` | 17.x | sirve, pero su piso es **14.17** (`^12.22.0 \|\| ^14.17.0 \|\| >=16.0.0`, igual que `eslint@8`). El `.nvmrc` resuelve a 14.21.3. |

`chai@4` es CommonJS. Desde ESM importalo por default y desestructurá:
```js
import chai from 'chai'
const { expect } = chai
```

## Reglas del challenge que son restricciones de código

- **Sin Babel, TypeScript, Dart ni Elm.** JavaScript plano.
- **Sin dependencias instaladas globalmente.** Todo en `package.json`.
- **Sin variables de entorno obligatorias.** Toda la config está hardcodeada en `src/shared/config.js`; `npm start` funciona en un clon limpio sin configurar nada.
- **Sin configuración de un SO específico.** Nada de paths absolutos ni comandos de shell en los scripts.

## Correr en el runtime real

**El runtime del proyecto es NodeJS 14, no el que trae la máquina.** El repo tiene `.nvmrc`, así que
antes de cualquier `npm install`, `npm start` o `npm test`:

```bash
nvm use          # lee .nvmrc -> 14
```

En **Apple Silicon** hay una vuelta más: NodeJS 14 es anterior al soporte oficial de macOS arm64, así
que la build instalada es la x64 y necesita Rosetta 2. Todos los comandos van desde un shell x86_64:

```bash
arch -x86_64 zsh
nvm use 14
```

Consecuencia práctica: si `node -v` no dice `v14.x`, lo que estés verificando no vale.
Node 14 trae **npm 6**, que sólo entiende `package-lock.json` v1 — no regeneres el lock con un npm
más nuevo.
