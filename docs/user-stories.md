# Historias de Usuario — Backend (API Node + Express)

**Challenge:** Toolbox — JavaScript Full Stack Code Challenge
**Componente:** API REST intermediaria que consume el API Externo (`https://echo-serv.tbxnet.com`), formatea el contenido de los CSV y lo expone como JSON.
**Repositorio destino:** `toolbox-challenge-backend`
**Fecha de elaboración:** 2026-08-27

> **Estado: las 12 historias están entregadas** — las 8 obligatorias y los 4 puntos opcionales.
> Este documento es el backlog de planificación: los criterios de aceptación son el contrato, y las
> *Notas técnicas* reflejan las decisiones tomadas durante la implementación.

---

## Contexto técnico (aplica a todas las HUs)

| Ítem | Valor |
|---|---|
| Runtime | NodeJS 14 |
| Lenguaje | JavaScript ES6+ (prohibido Babel, TypeScript, Dart, Elm) |
| Framework HTTP | ExpressJS |
| Testing | Mocha + Chai |
| Scripts obligatorios | `npm start` (levanta el API) y `npm test` (corre los tests) |
| API Externo | `https://echo-serv.tbxnet.com/v1/secret/*` |
| Autenticación externa | Header `authorization: Bearer aSuperSecretKey` |
| Content-Type de salida | `application/json` |
| Restricción | Sin dependencias globales, sin variables de entorno obligatorias, sin configuración de un SO específico |

### Flujo objetivo (diagrama de secuencia)

```
Frontend React        API                     API Externo
     |  GET /files/data |                          |
     |----------------->|                          |
     |                  | GET /v1/secret/files     |
     |                  |------------------------->|
     |                  |<-------------------------|
     |                  |     lista de archivos    |
     |                  |                          |
     |          loop [para cada archivo]           |
     |                  | GET /v1/secret/file/{f}  |
     |                  |------------------------->|
     |                  |<-------------------------|
     |                  |  contenido del archivo   |
     |                  |__                        |
     |                  |  | formateo del contenido|
     |                  |<-'                       |
     |<-----------------|                          |
     |  respuesta con la información formateada    |
```

### Contrato de respuesta de `GET /files/data`

```json
[
  {
    "file": "file1.csv",
    "lines": [
      { "text": "RgTya", "number": 64075909, "hex": "70ad29aacf0b690b0467fe2b2767f765" }
    ]
  }
]
```

### Definition of Ready (global)

- La HU tiene criterios de aceptación verificables.
- Las dependencias con otras HUs están identificadas y resueltas o mockeadas.
- Se conoce el contrato de entrada/salida involucrado.

### Definition of Done (global)

- Código en JavaScript ES6+, corriendo sobre NodeJS 14 sin transpilación.
- Tests automatizados verdes con `npm test`.
- `npm start` levanta el API sin pasos manuales adicionales.
- README actualizado si la HU cambia instrucciones de uso.
- Código commiteado y pusheado al repositorio público.

---

## Mapa de dependencias y orden sugerido

```
HU-BE-01 (base) ──┬── HU-BE-02 (listar archivos externos) ──┐
                  ├── HU-BE-03 (descargar archivo) ─────────┼── HU-BE-05 (GET /files/data)
                  └── HU-BE-04 (parser CSV) ────────────────┘        │
                                                                     ├── HU-BE-06 (resiliencia y errores)
                                                                     ├── HU-BE-07 (tests Mocha + Chai)
                                                                     └── HU-BE-08 (documentación)

Opcionales: HU-BE-09 (/files/list) · HU-BE-10 (?fileName=) · HU-BE-11 (StandardJS) · HU-BE-12 (Docker)
```

---

# HUs obligatorias

## HU-BE-01 — Esqueleto del API ejecutable

**Como** evaluador del challenge
**Quiero** poder clonar el repositorio y levantar el API con un único comando
**Para** validar el ejercicio sin configurar nada de mi entorno

### Criterios de aceptación

- **Dado** el repositorio recién clonado, **Cuando** ejecuto `npm install && npm start`, **Entonces** el servidor Express queda escuchando y lo indica por consola.
- **Dado** el servidor levantado, **Cuando** consulto una ruta inexistente, **Entonces** recibo `404` con cuerpo `application/json`.
- **Dado** NodeJS 14 como runtime, **Cuando** se ejecuta el proyecto, **Entonces** no se requiere Babel ni ningún transpilador.
- **Dado** que no defino ninguna variable de entorno, **Cuando** ejecuto `npm start`, **Entonces** el API arranca con valores por defecto (puerto configurable pero con default).
- **Dado** el `package.json`, **Cuando** lo inspecciono, **Entonces** declara `engines.node` compatible con 14 y ninguna dependencia global.

### Notas técnicas

- Estructura por capas sugerida: `routes/` → `controllers/` → `services/` → `clients/`.
- Puerto por defecto `3000`, sobreescribible por `process.env.PORT` (opcional, nunca obligatorio).
- Middleware de JSON y manejador de errores centralizado registrados desde el inicio.

### INVEST

- **I (Independiente):** no depende de ninguna otra HU; es la base del backlog.
- **N (Negociable):** la estructura de carpetas y el puerto son negociables.
- **V (Valiosa):** habilita que cualquier evaluador ejecute el proyecto.
- **E (Estimable):** alcance acotado y conocido. Estimación: **2 pts**.
- **S (Pequeña):** se completa en menos de media jornada.
- **T (Testeable):** verificable levantando el servidor y golpeando una ruta.

---

## HU-BE-02 — Obtener el listado de archivos del API Externo

**Como** API intermediaria
**Quiero** consultar `GET /v1/secret/files` del API Externo con la API Key
**Para** saber qué archivos debo descargar y procesar

### Criterios de aceptación

- **Dado** el API Externo disponible, **Cuando** el cliente invoca el listado, **Entonces** envía el header `authorization: Bearer aSuperSecretKey`.
- **Dado** una respuesta exitosa `{ "files": ["file1.csv", ...] }`, **Cuando** se procesa, **Entonces** el servicio devuelve un array de nombres de archivo.
- **Dado** que el API Externo responde `200` con la lista vacía, **Cuando** se procesa, **Entonces** el servicio devuelve un array vacío sin lanzar excepción.
- **Dado** que el API Externo responde un código de error (`4xx`/`5xx`) o hay timeout, **Cuando** se invoca, **Entonces** se lanza un error tipado y descriptivo que la capa superior puede manejar.
- **Dado** el cliente HTTP, **Cuando** se ejecuta una petición, **Entonces** aplica un timeout explícito para no colgar la respuesta indefinidamente.

### Notas técnicas

- Encapsular en un módulo `externalApiClient` con la baseURL y el token centralizados.
- La API Key vive en `src/shared/config.js` con valor por defecto (no puede ser una variable de entorno obligatoria).

### INVEST

- **I:** depende sólo de HU-BE-01; es independiente de la descarga y del parseo.
- **N:** la librería HTTP (axios, node-fetch, http nativo) es negociable.
- **V:** sin el listado no hay nada que procesar.
- **E:** una sola llamada con contrato conocido. Estimación: **2 pts**.
- **S:** un módulo y su test unitario.
- **T:** testeable con el API Externo stubbeado (nock o doble de prueba).

---

## HU-BE-03 — Descargar el contenido de un archivo del API Externo

**Como** API intermediaria
**Quiero** descargar el contenido crudo de cada archivo vía `GET /v1/secret/file/{file}`
**Para** disponer del CSV que luego será formateado

### Criterios de aceptación

- **Dado** un nombre de archivo válido, **Cuando** se solicita su descarga, **Entonces** se obtiene el contenido como texto plano usando el header de autorización.
- **Dado** un archivo que el API Externo no puede entregar (`404`, `500`, timeout), **Cuando** se solicita, **Entonces** el error se propaga identificando el archivo afectado, sin interrumpir el procesamiento de los demás.
- **Dado** un archivo vacío, **Cuando** se descarga, **Entonces** se devuelve una cadena vacía y no se considera un error.
- **Dado** un nombre de archivo con caracteres especiales, **Cuando** se construye la URL, **Entonces** el nombre se codifica correctamente.

### Notas técnicas

- La descarga debe devolver texto crudo, no parseado: el formateo es responsabilidad de HU-BE-04.
- Las descargas de los distintos archivos se resuelven en paralelo (`Promise.allSettled`) para acotar el tiempo total.

### INVEST

- **I:** no depende de HU-BE-02 (recibe el nombre por parámetro).
- **N:** la estrategia de paralelismo/concurrencia es negociable.
- **V:** es el insumo del formateo.
- **E:** contrato conocido. Estimación: **2 pts**.
- **S:** un método del cliente HTTP.
- **T:** testeable con respuestas stubbeadas de éxito, error y vacío.

---

## HU-BE-04 — Formatear el contenido CSV descartando líneas inválidas

**Como** consumidor del API
**Quiero** que el contenido CSV se transforme en objetos JSON limpios
**Para** no tener que parsear texto plano ni lidiar con datos corruptos

### Criterios de aceptación

- **Dado** un CSV con la cabecera `file,text,number,hex`, **Cuando** se formatea, **Entonces** cada línea válida produce `{ text, number, hex }` y la cabecera se descarta.
- **Dado** una línea con menos de 4 columnas, **Cuando** se formatea, **Entonces** la línea se descarta y el resto del archivo se procesa igual.
- **Dado** una línea con algún campo vacío, **Cuando** se formatea, **Entonces** la línea se descarta.
- **Dado** una línea cuyo campo `number` no es numérico, **Cuando** se formatea, **Entonces** la línea se descarta.
- **Dado** una línea válida, **Cuando** se formatea, **Entonces** `number` se expone como tipo `Number` y `text`/`hex` como `String`.
- **Dado** un `hex` que no tiene 32 caracteres hexadecimales, **Cuando** se formatea, **Entonces** la línea se descarta.
- **Dado** un archivo vacío o que sólo tiene cabecera, **Cuando** se formatea, **Entonces** se devuelve `lines: []` sin lanzar error.
- **Dado** un archivo con saltos de línea `\r\n` o una línea final vacía, **Cuando** se formatea, **Entonces** no se generan entradas espurias.

### Notas técnicas

- Función pura sin dependencia de red: recibe `(fileName, rawContent)` y devuelve `{ file, lines }`.
- El campo `file` de la salida se toma del nombre del archivo procesado, no de la primera columna del CSV.
- Documentar en el README el criterio de validación de `hex` como decisión tomada.

### INVEST

- **I:** función pura, aislada de la red y de Express.
- **N:** el rigor de la validación de `hex` es negociable con el evaluador.
- **V:** es el corazón del challenge ("formateo del contenido" en el diagrama).
- **E:** reglas explícitas en el enunciado. Estimación: **3 pts**.
- **S:** un módulo con su suite de tests.
- **T:** altamente testeable con fixtures de CSV en memoria.

---

## HU-BE-05 — Exponer el endpoint `GET /files/data`

**Como** cliente frontend
**Quiero** consumir un único endpoint que me devuelva todos los archivos ya formateados
**Para** renderizar la información sin conocer el API Externo ni su API Key

### Criterios de aceptación

- **Dado** el API levantado, **Cuando** hago `GET /files/data` con `accept: application/json`, **Entonces** recibo `200` y `Content-Type: application/json; charset=utf-8`.
- **Dado** que el API Externo devuelve N archivos, **Cuando** consumo el endpoint, **Entonces** la respuesta es un array donde cada elemento tiene la forma `{ "file": "<nombre>", "lines": [ { text, number, hex } ] }`.
- **Dado** un archivo cuya descarga falló, **Cuando** consumo el endpoint, **Entonces** ese archivo se omite de la respuesta y los demás se devuelven correctamente.
- **Dado** un archivo vacío o sin líneas válidas, **Cuando** consumo el endpoint, **Entonces** el archivo aparece con `lines: []` (decisión documentada) y nunca rompe la respuesta.
- **Dado** que ningún archivo pudo procesarse, **Cuando** consumo el endpoint, **Entonces** recibo `200` con un array vacío.
- **Dado** el flujo completo, **Cuando** se ejecuta, **Entonces** respeta el orden del diagrama: listar → descargar cada archivo → formatear → responder.

### Notas técnicas

- El controlador orquesta HU-BE-02, HU-BE-03 y HU-BE-04; no contiene lógica de parseo.
- Confirmar con el evaluador si los archivos sin líneas válidas deben incluirse con `lines: []` u omitirse; dejar la decisión asentada en el README.

### INVEST

- **I:** depende de HU-BE-02/03/04, pero puede desarrollarse contra dobles de prueba.
- **N:** el manejo de archivos vacíos es negociable.
- **V:** es el entregable principal del punto 1 del challenge.
- **E:** orquestación acotada. Estimación: **3 pts**.
- **S:** una ruta y un controlador.
- **T:** testeable end-to-end con supertest + stubs del API Externo.

---

## HU-BE-06 — Resiliencia y manejo consistente de errores

**Como** operador del API
**Quiero** que las fallas del API Externo no derriben la respuesta ni expongan detalles internos
**Para** ofrecer un servicio estable y con errores interpretables

### Criterios de aceptación

- **Dado** que el listado del API Externo falla, **Cuando** consumo `GET /files/data`, **Entonces** recibo `502` (o `503`) con cuerpo JSON `{ "error": { "message": "...", "code": "..." } }`.
- **Dado** cualquier error no controlado, **Cuando** ocurre, **Entonces** el middleware de errores responde en JSON y nunca devuelve HTML ni el stack trace al cliente.
- **Dado** un fallo en la descarga de un archivo puntual, **Cuando** ocurre, **Entonces** queda registrado en el log del servidor con el nombre del archivo y la respuesta sigue siendo `200`.
- **Dado** un error en cualquier capa, **Cuando** se propaga, **Entonces** el proceso Node no se cae.

### Notas técnicas

- Middleware de error como último `app.use`, con firma `(err, req, res, next)`.
- Logging por consola, sin dependencia de servicios externos.

### INVEST

- **I:** transversal, pero implementable después de HU-BE-05 sin bloquearla.
- **N:** los códigos HTTP exactos son negociables.
- **V:** diferencia una entrega prolija de una frágil.
- **E:** alcance chico. Estimación: **2 pts**.
- **S:** un middleware y ajustes puntuales.
- **T:** testeable forzando fallas en los stubs del API Externo.

---

## HU-BE-07 — Suite de tests con Mocha + Chai

**Como** evaluador del challenge
**Quiero** correr `npm test` y ver la validación automática del API
**Para** confirmar que el comportamiento pedido está cubierto

### Criterios de aceptación

- **Dado** el repositorio, **Cuando** ejecuto `npm test`, **Entonces** corre la suite de Mocha con aserciones de Chai y termina con exit code `0` si todo pasa.
- **Dado** que los tests corren, **Cuando** se ejecutan, **Entonces** no realizan llamadas reales al API Externo (usan stubs/mocks).
- **Dado** la suite, **Cuando** la reviso, **Entonces** cubre: listado exitoso, error de listado, descarga exitosa, error de descarga, archivo vacío, línea con columnas faltantes, línea con `number` inválido y la forma del contrato de `GET /files/data`.
- **Dado** un entorno limpio sin variables de entorno, **Cuando** ejecuto `npm test`, **Entonces** la suite corre igual.

### Notas técnicas

- Tests de integración HTTP con `supertest` sobre la app de Express exportada sin `listen()`.
- Fixtures de CSV (válido, vacío, con líneas corruptas) en `test/fixtures/`.

### INVEST

- **I:** puede escribirse en paralelo a la implementación (TDD).
- **N:** el nivel de cobertura es negociable.
- **V:** es un requisito técnico explícito del challenge.
- **E:** escenarios enumerados. Estimación: **3 pts**.
- **S:** una suite acotada por módulo.
- **T:** es la HU de testeo en sí misma.

---

## HU-BE-08 — Documentación e instrucciones de ejecución

**Como** evaluador del challenge
**Quiero** un README claro y prolijo
**Para** instalar, ejecutar, testear y entender las decisiones en pocos minutos

### Criterios de aceptación

- **Dado** el README, **Cuando** lo leo, **Entonces** encuentro: requisitos previos (NodeJS 14), instalación, `npm start`, `npm test` y el puerto por defecto.
- **Dado** el README, **Cuando** lo leo, **Entonces** encuentro la documentación de cada endpoint con ejemplo de `curl` y de respuesta JSON.
- **Dado** el README, **Cuando** lo leo, **Entonces** encuentro las decisiones de diseño asumidas (criterio de descarte de líneas, tratamiento de archivos vacíos, códigos de error).
- **Dado** el README, **Cuando** lo leo, **Entonces** indica qué puntos opcionales fueron implementados.
- **Dado** un desarrollador sin contexto, **Cuando** sigue el README paso a paso, **Entonces** levanta el API sin ayuda adicional.

### INVEST

- **I:** independiente del código, se completa al cierre.
- **N:** el formato y la extensión son negociables.
- **V:** el enunciado evalúa explícitamente la prolijidad de la documentación.
- **E:** trabajo acotado. Estimación: **1 pt**.
- **S:** un solo archivo.
- **T:** verificable ejecutando las instrucciones desde cero.

---

# HUs opcionales (suman, no restan)

## HU-BE-09 (Opcional) — Endpoint `GET /files/list`

**Como** cliente frontend
**Quiero** obtener la lista de archivos disponibles
**Para** poder ofrecer un filtro por nombre de archivo al usuario

### Criterios de aceptación

- **Dado** el API levantado, **Cuando** hago `GET /files/list`, **Entonces** recibo `200` con la lista tal cual la expone el API Externo (`{ "files": [...] }`) y `Content-Type: application/json`.
- **Dado** que el API Externo falla, **Cuando** consumo el endpoint, **Entonces** recibo un error JSON coherente con HU-BE-06.
- **Dado** la respuesta, **Cuando** la comparo con la del API Externo, **Entonces** la estructura es idéntica, sin reformateo.

### INVEST

- **I:** reutiliza HU-BE-02 pero no bloquea ninguna HU obligatoria.
- **N:** opcional por definición.
- **V:** habilita el filtro del frontend (HU-FE-07).
- **E:** trivial sobre lo ya construido. Estimación: **1 pt**.
- **S:** una ruta.
- **T:** testeable con supertest.

---

## HU-BE-10 (Opcional) — Filtro `GET /files/data?fileName=`

**Como** cliente frontend
**Quiero** pedir los datos de un archivo puntual
**Para** no descargar y procesar todos los archivos cuando sólo me interesa uno

### Criterios de aceptación

- **Dado** `GET /files/data?fileName=file1.csv` con un archivo existente, **Cuando** lo consumo, **Entonces** recibo un array con un único elemento correspondiente a ese archivo.
- **Dado** un `fileName` que no existe en el listado del API Externo, **Cuando** lo consumo, **Entonces** recibo `404` con un error JSON descriptivo (decisión documentada).
- **Dado** el query param ausente, **Cuando** consumo el endpoint, **Entonces** el comportamiento es idéntico al de HU-BE-05 (todos los archivos).
- **Dado** un `fileName` presente pero vacío, **Cuando** lo consumo, **Entonces** recibo `400` con un error JSON.
- **Dado** el filtro activo, **Cuando** se ejecuta, **Entonces** sólo se descarga el archivo solicitado, no todos.

### INVEST

- **I:** extiende HU-BE-05 sin modificar su contrato por defecto.
- **N:** el código de error para archivo inexistente es negociable (`404` vs. array vacío).
- **V:** mejora la performance y habilita el filtro del frontend.
- **E:** cambio localizado. Estimación: **2 pts**.
- **S:** un query param y su validación.
- **T:** testeable con casos existente/inexistente/vacío.

---

## HU-BE-11 (Opcional) — Estilo de código StandardJS

**Como** equipo de desarrollo
**Quiero** que el código respete JavaScript Standard Style
**Para** mantener un estilo consistente y verificable automáticamente

### Criterios de aceptación

- **Dado** el repositorio, **Cuando** ejecuto el linter (`npm run lint`), **Entonces** no se reportan errores de estilo.
- **Dado** el `package.json`, **Cuando** lo inspecciono, **Entonces** `standard` figura como devDependency con su script asociado.
- **Dado** los archivos de test, **Cuando** se lintean, **Entonces** también cumplen el estándar (globals de Mocha declarados).

### INVEST

- **I:** aplicable en cualquier momento sin bloquear otras HUs.
- **N:** opcional.
- **V:** suma puntaje explícito en el challenge.
- **E:** instalación y corrección de estilo. Estimación: **1 pt**.
- **S:** configuración más un pase de corrección.
- **T:** verificable por la salida del linter.

---

## HU-BE-12 (Opcional) — Ejecución con Docker

**Como** evaluador del challenge
**Quiero** levantar el API con Docker sin instalar NodeJS localmente
**Para** reproducir el entorno de forma idéntica y sin fricción

### Criterios de aceptación

- **Dado** el `Dockerfile`, **Cuando** construyo la imagen, **Entonces** usa una imagen base de NodeJS 14 y la build finaliza sin errores.
- **Dado** la imagen construida, **Cuando** ejecuto el contenedor, **Entonces** el API responde en el puerto publicado.
- **Dado** el `docker-compose.yml`, **Cuando** ejecuto `docker compose up`, **Entonces** se levantan el API y el frontend, y el frontend consume correctamente al API.
- **Dado** el README, **Cuando** lo leo, **Entonces** documenta los comandos de build y run.
- **Dado** el contenedor, **Cuando** arranca, **Entonces** no requiere variables de entorno definidas por el evaluador.

### Notas técnicas

- `.dockerignore` excluyendo `node_modules` y `.git`.
- El `docker-compose.yml` puede vivir en el repositorio del backend o en uno de orquestación; documentar dónde.

### INVEST

- **I:** no altera el código de la aplicación.
- **N:** Docker solo vs. Docker Compose es negociable.
- **V:** punto opcional global del challenge.
- **E:** dos archivos de infraestructura. Estimación: **2 pts**.
- **S:** acotada.
- **T:** verificable levantando los contenedores.

---

# HUs globales (transversales a ambos repositorios)

## HU-GL-01 — Entrega en repositorio git público

**Como** evaluador del challenge
**Quiero** acceder al código en un repositorio git público
**Para** revisar la solución y su historial

### Criterios de aceptación

- **Dado** el repositorio del backend, **Cuando** lo abro con la URL enviada, **Entonces** es accesible públicamente (o con las credenciales informadas).
- **Dado** el historial, **Cuando** lo reviso, **Entonces** hay commits incrementales con mensajes descriptivos, no un único commit masivo.
- **Dado** el repositorio, **Cuando** lo clono, **Entonces** no contiene `node_modules` ni archivos generados (`.gitignore` correcto).
- **Dado** la entrega, **Cuando** se envía, **Entonces** el mensaje incluye la URL del repositorio y los datos de acceso necesarios.

### INVEST

- **I:** independiente del contenido de las demás HUs.
- **N:** el proveedor git es negociable.
- **V:** sin esto no hay entrega.
- **E:** trivial. Estimación: **1 pt**.
- **S:** acotada.
- **T:** verificable abriendo la URL en una sesión anónima.

---

## Resumen de estimación

| HU | Título | Prioridad | Pts |
|---|---|---|---|
| HU-BE-01 | Esqueleto del API ejecutable | Obligatoria | 2 |
| HU-BE-02 | Listado de archivos del API Externo | Obligatoria | 2 |
| HU-BE-03 | Descarga de contenido de archivo | Obligatoria | 2 |
| HU-BE-04 | Formateo de CSV con descarte de líneas | Obligatoria | 3 |
| HU-BE-05 | Endpoint `GET /files/data` | Obligatoria | 3 |
| HU-BE-06 | Resiliencia y manejo de errores | Obligatoria | 2 |
| HU-BE-07 | Suite de tests Mocha + Chai | Obligatoria | 3 |
| HU-BE-08 | Documentación e instrucciones | Obligatoria | 1 |
| HU-BE-09 | Endpoint `GET /files/list` | Opcional | 1 |
| HU-BE-10 | Filtro `?fileName=` | Opcional | 2 |
| HU-BE-11 | StandardJS | Opcional | 1 |
| HU-BE-12 | Docker / Docker Compose | Opcional | 2 |
| HU-GL-01 | Entrega en repositorio público | Global | 1 |
| | **Total obligatorio** | | **18** |
| | **Total con opcionales** | | **25** |

---

## Ambigüedades del enunciado, y cómo se resolvieron

El enunciado dejaba varias puertas abiertas. Cada una se resolvió durante la implementación y la
decisión quedó documentada en el README, no en el código a escondidas.

| Ambigüedad | Resolución |
|---|---|
| Un archivo sin líneas válidas, ¿se incluye con `lines: []` o se omite? | **Se incluye.** Omitirlo haría indistinguibles tres cosas: no traía nada usable, no existe, o no se pudo descargar |
| ¿`hex` se valida entero o alcanza con que la columna esté? | **Entero**, `/^[0-9a-f]{32}$/i`: el enunciado pide "32 dígitos". Descarta 5 filas reales de 30 caracteres |
| Un `fileName` inexistente, ¿`404` o `200` con `[]`? | **`404`.** `[]` ya significa "no traía nada usable"; usarlo también para "no existe" mezcla un dato con un nombre mal escrito |
| ¿La API Key hardcodeada, si las variables de entorno están prohibidas? | **Hardcodeada** en `src/shared/config.js`, como el resto de la configuración |
| ¿Dónde vive el `docker-compose.yml`? | **Uno por repositorio, con un solo servicio.** Un compose que construyera el otro repo dependería de dónde esté clonado |

Una regla se agregó por encima de los criterios y también quedó documentada: **las líneas con *más* de
cuatro columnas también se descartan**. El CSV no usa comillas, así que una coma de más es dato
corrupto, y aceptarla obligaría a elegir arbitrariamente cuáles cuatro columnas valen.
