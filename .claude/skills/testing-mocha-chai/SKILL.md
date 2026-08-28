---
name: testing-mocha-chai
description: Cómo se escriben y corren los tests de este API con Mocha + Chai + supertest sobre ESM en Node 14. Usar SIEMPRE al crear o modificar archivos en test/, al agregar cobertura para una feature nueva, al elegir qué mockear, o cuando un test falle por razones de módulos/imports.
---

# Testing — Mocha + Chai + supertest

| Comando | Corre |
|---|---|
| `npm test` | todo — es el que exige el challenge |
| `npm run test:unit` | `test/unit/` — funciones puras y piezas aisladas, sin Express |
| `npm run test:integration` | `test/integration/` — `supertest` contra `buildApp()` |

Todo debe terminar en verde con exit code `0`, **sin red real y sin variables de entorno definidas**.

**El spec va en el script, no en `.mocharc.json`.** Mocha *fusiona* el spec del archivo de config con
el argumento del CLI en vez de reemplazarlo: si `.mocharc.json` declara `spec`, `npm run test:unit`
corre igual la suite completa y parece que funciona. `.mocharc.json` sólo lleva `timeout`.

## Import de chai en ESM

`chai@4` es CommonJS. Desde ESM hay que importarlo por default y desestructurar:

```js
import chai from 'chai'
const { expect } = chai
```

`import { expect } from 'chai'` puede fallar según el interop. Usá siempre la forma de arriba.

## Qué se mockea en cada nivel

En ESM **no se pueden stubear imports**: `sinon` lanza `TypeError: ES Modules cannot be stubbed`.
No busques `proxyquire` ni `rewiremock` — no existen para ESM. La estrategia es testear cada cosa por
donde realmente se puede: las funciones puras directo, y lo demás por los bordes inyectables o a
través de la app.

| Qué testeás | Cómo |
|---|---|
| `parser` | Directo. Es una función pura: entrada → salida. Sin mocks. |
| `service` | Directo mientras no tenga I/O. Cuando TASK-002 le agregue el repository, ahí se le abre una costura por parámetro y se le inyecta un fake. |
| `controller` | Se cubre por el test de integración. |
| `repository` | `nock` interceptando el API externo. Es la única capa que toca la red. |
| rutas completas | `supertest` contra `buildApp({ logDestination })`. |
| middleware de `shared/` | Unitario, con dobles mínimos de `req`/`res` (ver `test/unit/errorHandler.test.js`). |

Un fake es un objeto literal. No hace falta una librería para esto:

```js
const repository = {
  listFiles: async () => ['file1.csv'],
  downloadFile: async () => 'file,text,number,hex\nfile1.csv,a,1,' + 'a'.repeat(32)
}
```

## Tests de integración con supertest

`buildApp()` devuelve la app **sin llamar a `listen()`**. Supertest la levanta en un puerto efímero:

```js
import request from 'supertest'
import { buildApp } from '../../src/app.js'

const app = buildApp({ logDestination })
const res = await request(app).get('/files/data').expect(200)
expect(res.body).to.be.an('array')
```

El único override de `buildApp` es `logDestination`, para capturar las líneas de log. **No agregues
uno por capa** para poder inyectar un doble; si un test necesita eso, testeá esa capa como unidad.

## Escenarios obligatorios (BACKEND - TASK-007)

La suite tiene que cubrir, como mínimo:

1. Listado de archivos exitoso.
2. Error al listar (el API externo responde 5xx).
3. Descarga de archivo exitosa.
4. Error al descargar un archivo puntual → **los demás archivos siguen devolviéndose**.
5. Archivo vacío → `lines: []`, sin excepción.
6. Línea con columnas faltantes → se descarta, el resto del archivo se procesa.
7. Línea con `number` no numérico → se descarta.
8. Forma del contrato de `GET /files/data`: array de `{ file, lines: [{ text, number, hex }] }`, con `number` de tipo `Number`.

Y para la observabilidad:

9. Una request exitosa emite **exactamente un** evento, con `outcome: "success"` y `duration_ms`.
10. Una request con error emite un evento con `outcome: "error"` y el objeto `error`.

## Fixtures

Los CSV de prueba viven en `test/fixtures/`. Recordá que en ESM no hay `__dirname`:

```js
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => readFileSync(join(__dirname, '../fixtures', name), 'utf8')
```

## Reglas

- **Cero red real.** Ni siquiera en los tests del repository (para eso está `nock`).
- **Cero dependencia del entorno.** Los tests corren sin ninguna variable definida.
- **Cero `listen()`.** Si un test abre un puerto, Mocha queda colgado.
- Un `describe` por unidad, nombres de test que describen el comportamiento, no la implementación.
- **Los nombres de los tests van en inglés**, como el resto del código: `it('drops malformed lines')`, no `it('descarta las líneas malformadas')`.
- Si testear algo requiere mockear un import, primero preguntate si esa pieza puede probarse como unidad pura o a través de la app. Sólo si no, abrile una costura por parámetro — y justificala con el test que la pide.
