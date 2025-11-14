# 🏗️ Arquitectura Detallada - Sistema de Deployment ImpugnaINE

Esta guía explica en detalle cómo funciona internamente todo el sistema de deployment.

## 📐 Arquitectura General

```
┌─────────────────────────────────────────────────────────┐
│                    DOCKER COMPOSE                        │
├──────────────────────┬──────────────────────────────────┤
│   Container 1        │      Container 2                 │
│   Nginx              │      Node.js Server              │
│   (Puerto 8080)      │      (Puerto 3000)               │
│                      │                                   │
│   - Proxy reverso    │   - API REST                     │
│   - Sirve app activa │   - Gestión de builds            │
│   - Sirve dashboard  │   - Upload de ZIPs               │
└──────────────────────┴──────────────────────────────────┘
```

## 📁 Estructura de Directorios Completa

```
contenedor-subir-builds/
│
├── server/                    # Backend (Node.js + Express)
│   ├── server.js             # Servidor principal con API
│   └── package.json          # Dependencias (express, multer, etc.)
│
├── web/                      # Frontend (Dashboard)
│   ├── index.html           # Interfaz web del dashboard
│   └── app.js               # Lógica del dashboard (fetch API)
│
├── nginx/
│   └── nginx.conf           # Configuración del proxy reverso
│
├── docker-compose.yml       # Orquestación de contenedores
├── Dockerfile               # Imagen del servidor Node.js
│
└── (Directorios de datos - se crean automáticamente)
    ├── uploads/             # ZIPs subidos temporalmente
    ├── builds/              # Builds almacenados permanentemente
    │   ├── build_123456/    # Cada build en su carpeta única
    │   │   ├── app.zip      # Archivo ZIP del build
    │   │   └── BUILD_INFO.txt
    │   ├── build_789012/
    │   │   └── ...
    │   └── metadata.json    # Índice global de todos los builds
    │
    └── active-build/        # Build actualmente desplegado
        ├── index.html       # Aplicación Angular extraída
        ├── main.js
        ├── styles.css
        └── assets/
```

## 🔄 Flujo de Trabajo Completo

### 1️⃣ Inicio del Sistema

**Comando:**
```bash
docker-compose up -d
```

**Proceso interno:**

1. **Docker construye la imagen** (Dockerfile):
   ```dockerfile
   FROM node:18-alpine          # Imagen base ligera
   RUN apk add --no-cache unzip # Instala unzip para ZIPs
   WORKDIR /app
   COPY server/package.json ./
   RUN npm install --production # Instala dependencias
   COPY server/ ./
   RUN mkdir -p /app/uploads /app/builds /app/active-build
   EXPOSE 3000
   CMD ["node", "server.js"]
   ```

2. **Docker levanta 2 contenedores** (docker-compose.yml):

   **Container 1: deployment-server**
   - Ejecuta: `node server.js`
   - Puerto interno: 3000
   - Volúmenes montados:
     - `./uploads:/app/uploads`
     - `./builds:/app/builds`
     - `./active-build:/app/active-build`
   - Variables de entorno:
     - `ADMIN_USER=admin`
     - `ADMIN_PASSWORD=impugnaINE2024`

   **Container 2: nginx**
   - Ejecuta: nginx
   - Puerto expuesto: 8080 → 80 (interno)
   - Volúmenes montados:
     - `./nginx/nginx.conf:/etc/nginx/nginx.conf`
     - `./active-build:/usr/share/nginx/html/active-build`

3. **Nginx actúa como Proxy Reverso** (nginx.conf):
   ```
   ┌─────────────────────────────────────────────┐
   │  Cliente (navegador/curl)                   │
   └──────────────┬──────────────────────────────┘
                  │
                  ↓
   ┌─────────────────────────────────────────────┐
   │  Nginx (Puerto 8080)                        │
   ├─────────────────────────────────────────────┤
   │  • http://localhost:8080/                   │
   │    → /usr/share/nginx/html/active-build/    │
   │    (Sirve app Angular directamente)         │
   │                                              │
   │  • http://localhost:8080/dashboard/         │
   │    → http://deployment-server:3000/dashboard│
   │    (Proxy a Node.js)                        │
   │                                              │
   │  • http://localhost:8080/api/*              │
   │    → http://deployment-server:3000/api/*    │
   │    (Proxy a Node.js)                        │
   └─────────────────────────────────────────────┘
   ```

### 2️⃣ Subir un Build (Upload)

**Flujo completo desde el Dashboard:**

```
Usuario arrastra ZIP
        ↓
   Dashboard HTML
   (web/index.html)
        ↓
   JavaScript captura evento
   (web/app.js)
        ↓
   Crea FormData con el archivo
        ↓
   fetch('/api/upload', {
     method: 'POST',
     headers: {
       Authorization: 'Basic YWRtaW46aW1wdWduYUlORTIwMjQ='
     },
     body: formData
   })
        ↓
   Nginx proxy → Node.js
        ↓
   Express recibe petición
   (server/server.js)
        ↓
   Middleware: express-basic-auth
   valida credenciales
        ↓
   Middleware: multer
   guarda archivo en uploads/
        ↓
   Handler /api/upload:
   1. Crea ID único: build_1699999999
   2. Crea carpeta: builds/build_1699999999/
   3. Mueve ZIP a esa carpeta
   4. Extrae BUILD_INFO.txt del ZIP
   5. Guarda BUILD_INFO.txt como archivo separado
   6. Crea objeto de metadata
   7. Lee metadata.json actual
   8. Agrega nuevo build al array
   9. Guarda metadata.json actualizado
        ↓
   Responde JSON:
   {
     "success": true,
     "build": { ... }
   }
        ↓
   Dashboard recibe respuesta
        ↓
   Actualiza UI mostrando nuevo build
```

**Código relevante en server.js:**

```javascript
// server.js líneas 164-219
app.post('/api/upload', auth, upload.single('build'), async (req, res) => {
  // 1. Verificar archivo
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo' });
  }

  // 2. Crear ID y directorio
  const buildId = `build_${Date.now()}`;
  const buildDir = path.join(BUILDS_DIR, buildId);
  await fs.mkdir(buildDir, { recursive: true });

  // 3. Mover archivo
  const zipDestination = path.join(buildDir, req.file.originalname);
  await fs.copyFile(req.file.path, zipDestination);
  await fs.unlink(req.file.path);

  // 4. Extraer BUILD_INFO
  const buildInfo = await extractBuildInfo(zipDestination);
  await fs.writeFile(path.join(buildDir, 'BUILD_INFO.txt'), buildInfo);

  // 5. Crear metadata
  const buildMetadata = {
    id: buildId,
    filename: req.file.originalname,
    uploadedAt: new Date().toISOString(),
    size: getFileSize(zipDestination),
    buildInfo: buildInfo,
    deployed: false
  };

  // 6. Actualizar metadata.json
  const metadata = await readMetadata();
  metadata.builds.unshift(buildMetadata);
  await saveMetadata(metadata);

  res.json({ success: true, build: buildMetadata });
});
```

**Resultado en el sistema de archivos:**

```
builds/
├── build_1699999999/
│   ├── impugna-1.2.3-PROD.zip  (archivo original)
│   └── BUILD_INFO.txt           (extraído del ZIP)
└── metadata.json                (índice actualizado)
```

**Contenido de metadata.json:**

```json
{
  "builds": [
    {
      "id": "build_1699999999",
      "filename": "impugna-1.2.3-PROD.zip",
      "uploadedAt": "2025-11-14T04:00:00.000Z",
      "size": "5.2 MB",
      "sizeBytes": 5452288,
      "buildInfo": "=== BUILD INFORMATION ===\nVersion: 1.2.3\n...",
      "deployed": false,
      "uploadedBy": "admin"
    }
  ],
  "activeId": null,
  "lastDeployment": null
}
```

### 3️⃣ Desplegar un Build (Deploy)

**Flujo completo:**

```
Usuario hace click "Desplegar"
        ↓
   JavaScript en Dashboard
   (web/app.js)
        ↓
   fetch('/api/deploy/build_1699999999', {
     method: 'POST',
     headers: {
       Authorization: 'Basic ...'
     }
   })
        ↓
   Nginx proxy → Node.js
        ↓
   Express recibe petición
        ↓
   Middleware: express-basic-auth
   valida credenciales
        ↓
   Handler /api/deploy/:buildId:
   1. Busca build en metadata.json
   2. Verifica que existe el ZIP
   3. LIMPIA active-build/ completamente
      (borra todos los archivos)
   4. Extrae ZIP a active-build/
   5. Marca build anterior como deployed: false
   6. Marca build actual como deployed: true
   7. Actualiza activeId en metadata.json
   8. Guarda timestamp de deployment
   9. Intenta recargar nginx (opcional)
        ↓
   Responde JSON:
   {
     "success": true,
     "buildId": "build_1699999999",
     "deployedAt": "2025-11-14T04:10:00.000Z"
   }
        ↓
   Dashboard recibe respuesta
        ↓
   Actualiza UI:
   - Build anterior quita badge "ACTIVO"
   - Build nuevo muestra badge "ACTIVO"
   - Actualiza estadísticas
```

**Código relevante:**

```javascript
// server.js líneas 224-282
app.post('/api/deploy/:buildId', auth, async (req, res) => {
  const { buildId } = req.params;
  const buildDir = path.join(BUILDS_DIR, buildId);

  // 1. Verificar que existe
  const metadata = await readMetadata();
  const build = metadata.builds.find(b => b.id === buildId);
  if (!build) {
    return res.status(404).json({ error: 'Build no encontrado' });
  }

  const zipPath = path.join(buildDir, build.filename);

  // 2. Limpiar active-build/
  const files = await fs.readdir(ACTIVE_BUILD_DIR);
  for (const file of files) {
    await fs.rm(path.join(ACTIVE_BUILD_DIR, file), {
      recursive: true,
      force: true
    });
  }

  // 3. Extraer ZIP
  await extract(zipPath, { dir: ACTIVE_BUILD_DIR });

  // 4. Actualizar metadata
  metadata.builds.forEach(b => {
    b.deployed = b.id === buildId;
  });
  metadata.activeId = buildId;
  metadata.lastDeployment = new Date().toISOString();
  await saveMetadata(metadata);

  res.json({
    success: true,
    buildId: buildId,
    deployedAt: metadata.lastDeployment
  });
});
```

**Resultado:**

```
active-build/
├── index.html           # Tu aplicación Angular
├── main.js
├── polyfills.js
├── runtime.js
├── styles.css
├── favicon.ico
└── assets/
    ├── images/
    └── fonts/
```

### 4️⃣ Acceso a la Aplicación

**Usuario navega a http://localhost:8080/**

```
Browser → http://localhost:8080/
        ↓
   Request a Nginx
        ↓
   nginx.conf: location /
   {
     root /usr/share/nginx/html/active-build;
     try_files $uri $uri/ /index.html;
   }
        ↓
   Nginx lee: /usr/share/nginx/html/active-build/index.html
        ↓
   Sirve archivo al browser
        ↓
   Browser carga Angular app
        ↓
   Angular hace peticiones a sus assets:
   - /main.js → active-build/main.js
   - /styles.css → active-build/styles.css
   - etc.
        ↓
   Nginx sirve cada archivo directamente
   (sin pasar por Node.js)
        ↓
   App Angular funciona normalmente
```

## 🔌 Endpoints de la API - Detalles Técnicos

### GET /api/health

**Propósito:** Health check del servidor

**Autenticación:** ❌ No requerida

**Código:**
```javascript
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});
```

**Ejemplo:**
```bash
curl http://localhost:8080/api/health
```

**Respuesta:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-14T04:11:35.937Z",
  "version": "1.0.0"
}
```

---

### GET /api/builds

**Propósito:** Obtener lista completa de builds

**Autenticación:** ✅ HTTP Basic Auth requerida

**Flujo:**
1. Express recibe request
2. Middleware `auth` valida `Authorization` header
3. Lee `builds/metadata.json`
4. Retorna JSON completo

**Código:**
```javascript
app.get('/api/builds', auth, async (req, res) => {
  const metadata = await readMetadata();
  res.json(metadata);
});
```

**Ejemplo:**
```bash
curl -u admin:impugnaINE2024 http://localhost:8080/api/builds
```

**Respuesta:**
```json
{
  "builds": [
    {
      "id": "build_1699999999",
      "filename": "impugna-1.2.3-PROD.zip",
      "uploadedAt": "2025-11-14T04:00:00.000Z",
      "size": "5.2 MB",
      "sizeBytes": 5452288,
      "buildInfo": "=== BUILD INFORMATION ===...",
      "deployed": true,
      "uploadedBy": "admin"
    },
    {
      "id": "build_1699999888",
      "filename": "impugna-1.2.2-PROD.zip",
      "uploadedAt": "2025-11-13T10:00:00.000Z",
      "size": "5.1 MB",
      "deployed": false,
      "uploadedBy": "admin"
    }
  ],
  "activeId": "build_1699999999",
  "lastDeployment": "2025-11-14T04:10:00.000Z"
}
```

---

### GET /api/active

**Propósito:** Obtener solo el build actualmente desplegado

**Autenticación:** ❌ No requerida (info pública)

**Código:**
```javascript
app.get('/api/active', async (req, res) => {
  const metadata = await readMetadata();
  const activeBuild = metadata.builds.find(b => b.id === metadata.activeId);

  if (!activeBuild) {
    return res.json({ active: false, build: null });
  }

  res.json({
    active: true,
    build: activeBuild,
    deployedAt: metadata.lastDeployment
  });
});
```

---

### POST /api/upload

**Propósito:** Subir un nuevo build

**Autenticación:** ✅ HTTP Basic Auth requerida

**Content-Type:** `multipart/form-data`

**Campo:** `build` (archivo ZIP)

**Validaciones:**
- Solo acepta archivos .zip
- Tamaño máximo: 100 MB
- Requiere autenticación

**Proceso:**
1. Multer guarda archivo temporalmente en `uploads/`
2. Valida extensión .zip
3. Crea ID único con timestamp
4. Crea directorio `builds/build_TIMESTAMP/`
5. Mueve archivo a directorio del build
6. Extrae BUILD_INFO.txt
7. Actualiza metadata.json
8. Retorna información del build

---

### POST /api/deploy/:buildId

**Propósito:** Desplegar un build específico

**Autenticación:** ✅ HTTP Basic Auth requerida

**Parámetro:** `buildId` (ej: build_1699999999)

**Validaciones:**
- Build debe existir en metadata
- ZIP debe existir físicamente

**Proceso:**
1. Busca build en metadata
2. Verifica que ZIP existe
3. Limpia `active-build/` completamente
4. Extrae ZIP a `active-build/`
5. Actualiza flags de deployment
6. Actualiza timestamp
7. Retorna confirmación

---

### DELETE /api/builds/:buildId

**Propósito:** Eliminar un build

**Autenticación:** ✅ HTTP Basic Auth requerida

**Restricciones:**
- ❌ NO se puede eliminar el build activo

**Proceso:**
1. Busca build en metadata
2. Verifica que NO esté desplegado
3. Elimina directorio `builds/buildId/`
4. Actualiza metadata.json
5. Retorna confirmación

---

### GET /api/builds/:buildId/info

**Propósito:** Leer BUILD_INFO.txt de un build

**Autenticación:** ✅ HTTP Basic Auth requerida

**Content-Type:** `text/plain`

**Código:**
```javascript
app.get('/api/builds/:buildId/info', auth, async (req, res) => {
  const { buildId } = req.params;
  const buildInfoPath = path.join(BUILDS_DIR, buildId, 'BUILD_INFO.txt');

  const buildInfo = await fs.readFile(buildInfoPath, 'utf8');
  res.type('text/plain').send(buildInfo);
});
```

## 🔐 Sistema de Autenticación

### Arquitectura de Seguridad

```
┌─────────────────────────────────────────────┐
│  Frontend (web/app.js)                      │
│  - Credenciales HARDCODEADAS               │
│  - const AUTH = btoa('admin:impugnaINE2024')│
└──────────────┬──────────────────────────────┘
               │
               ↓ Cada request incluye header:
               │ Authorization: Basic YWRtaW46aW1wdWduYUlORTIwMjQ=
               │
┌──────────────┴──────────────────────────────┐
│  Backend (server.js)                        │
│  - express-basic-auth middleware            │
│  - Valida contra env vars                   │
│  - ADMIN_USER=admin                         │
│  - ADMIN_PASSWORD=impugnaINE2024            │
└─────────────────────────────────────────────┘
```

### Configuración de HTTP Basic Auth

**Backend (server.js líneas 58-64):**

```javascript
const auth = basicAuth({
  users: {
    [process.env.ADMIN_USER || 'admin']:
      process.env.ADMIN_PASSWORD || 'impugnaINE2024'
  },
  challenge: true,  // Envía WWW-Authenticate header
  realm: 'ImpugnaINE Deployment Server'
});
```

### Endpoints Protegidos vs No Protegidos

**✅ Con Autenticación:**
- `POST /api/upload`
- `GET /api/builds`
- `POST /api/deploy/:id`
- `DELETE /api/builds/:id`
- `GET /api/builds/:id/info`

**❌ Sin Autenticación:**
- `GET /api/health`
- `GET /api/active`
- `GET /dashboard/*` (archivos estáticos)

### Frontend - Credenciales Hardcodeadas

**web/app.js línea 3:**

```javascript
const AUTH = btoa('admin:impugnaINE2024');
// btoa() convierte a Base64:
// 'admin:impugnaINE2024' → 'YWRtaW46aW1wdWduYUlORTIwMjQ='
```

**Uso en fetch:**

```javascript
fetch('/api/builds', {
  headers: {
    'Authorization': `Basic ${AUTH}`
  }
})
```

**⚠️ Importante para POC:**
- Las credenciales están visibles en el código fuente del navegador
- Cualquiera puede ver el código JS y extraer las credenciales
- Para producción, se requeriría un sistema de login real

## 📊 Persistencia de Datos

### Volúmenes de Docker

**Configuración en docker-compose.yml:**

```yaml
services:
  deployment-server:
    volumes:
      # Host:Container
      - ./uploads:/app/uploads
      - ./builds:/app/builds
      - ./active-build:/app/active-build
      - ./web:/app/web:ro  # :ro = read-only
```

**Qué significa:**

| Directorio Host | Directorio Container | Propósito |
|----------------|---------------------|-----------|
| `./uploads/` | `/app/uploads/` | ZIPs temporales durante upload |
| `./builds/` | `/app/builds/` | Builds almacenados + metadata.json |
| `./active-build/` | `/app/active-build/` | App desplegada actualmente |
| `./web/` | `/app/web/` | Dashboard (solo lectura) |

### ¿Qué se persiste?

✅ **Persiste (sobrevive a docker-compose down):**
- Todos los ZIPs en `builds/`
- `metadata.json`
- Build activo en `active-build/`
- ZIPs temporales en `uploads/`

❌ **NO persiste (se pierde):**
- Logs del contenedor (a menos que uses `docker-compose logs`)
- Estado en memoria del servidor Node.js

### Compartir entre Nginx y Node.js

**active-build/ está montado en AMBOS contenedores:**

```yaml
# Contenedor Node.js
deployment-server:
  volumes:
    - ./active-build:/app/active-build

# Contenedor Nginx
nginx:
  volumes:
    - ./active-build:/usr/share/nginx/html/active-build:ro
```

**Flujo:**
1. Node.js extrae ZIP → `/app/active-build/`
2. En el host aparece en → `./active-build/`
3. Nginx lee desde → `/usr/share/nginx/html/active-build/`
4. Todo es el mismo directorio compartido

## 🎯 Casos de Uso Técnicos

### Rollback a Versión Anterior

**Escenario:** La versión 1.2.3 tiene un bug crítico, necesitas volver a 1.2.2

**Proceso:**
1. Usuario abre dashboard
2. Ve historial de builds:
   - ✅ build_999 (v1.2.3) - ACTIVO
   - build_888 (v1.2.2) - Disponible
3. Click "Desplegar" en build_888

**Qué pasa internamente:**
```javascript
// 1. Request
POST /api/deploy/build_888

// 2. Backend
- Lee: builds/build_888/impugna-1.2.2-PROD.zip
- Borra: active-build/* (elimina v1.2.3)
- Extrae: build_888 ZIP → active-build/
- Actualiza: metadata.json
  {
    builds: [
      { id: "build_999", deployed: false },  // ← cambió
      { id: "build_888", deployed: true }    // ← cambió
    ],
    activeId: "build_888"                    // ← cambió
  }

// 3. Usuarios
- http://localhost:8080/ ahora sirve v1.2.2
- Cambio es instantáneo (sin rebuild)
```

**Tiempo total:** < 5 segundos

### Comparar Versiones

**Escenario:** Quieres saber qué commits hay entre v1.2.2 y v1.2.3

**Proceso:**

1. **Via Dashboard:**
   - Click "Ver Info" en build v1.2.3
   - Click "Ver Info" en build v1.2.2
   - Compara manualmente los commits mostrados

2. **Via API:**
   ```bash
   # Ver info de build 1
   curl -u admin:impugnaINE2024 \
     http://localhost:8080/api/builds/build_999/info

   # Ver info de build 2
   curl -u admin:impugnaINE2024 \
     http://localhost:8080/api/builds/build_888/info

   # Comparar con diff
   diff <(curl -u admin:impugnaINE2024 \
     http://localhost:8080/api/builds/build_999/info) \
        <(curl -u admin:impugnaINE2024 \
     http://localhost:8080/api/builds/build_888/info)
   ```

### Deployment Programático (CI/CD)

**Escenario:** GitHub Actions hace deploy automático al hacer tag

**GitHub Actions workflow:**

```yaml
name: Auto Deploy

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build
        run: npm run build

      - name: Package
        run: zip -r build.zip dist/

      - name: Upload to server
        run: |
          BUILD_ID=$(curl -X POST \
            -u ${{ secrets.DEPLOY_USER }}:${{ secrets.DEPLOY_PASSWORD }} \
            -F "build=@build.zip" \
            ${{ secrets.DEPLOY_SERVER }}/api/upload \
            | jq -r '.build.id')

          echo "Build ID: $BUILD_ID"

      - name: Deploy
        run: |
          curl -X POST \
            -u ${{ secrets.DEPLOY_USER }}:${{ secrets.DEPLOY_PASSWORD }} \
            ${{ secrets.DEPLOY_SERVER }}/api/deploy/$BUILD_ID
```

## 🔧 Componentes Técnicos

### Backend Stack

**Dependencias (server/package.json):**

```json
{
  "dependencies": {
    "express": "^4.18.0",          // Framework web
    "multer": "^1.4.5",             // Upload de archivos multipart
    "express-basic-auth": "^1.2.1", // Autenticación HTTP Basic
    "cors": "^2.8.5",               // Cross-Origin Resource Sharing
    "extract-zip": "^2.0.1",        // Descomprimir ZIPs
    "dotenv": "^16.0.3"             // Variables de entorno
  }
}
```

**Funcionalidad de cada una:**

1. **express:** Framework web minimalista
   - Manejo de rutas
   - Middlewares
   - HTTP helpers

2. **multer:** Procesamiento de `multipart/form-data`
   - Valida tipo de archivo
   - Limita tamaño
   - Guarda en disco

3. **express-basic-auth:** Autenticación HTTP Basic
   - Lee header `Authorization`
   - Valida contra usuarios configurados
   - Envía challenge `WWW-Authenticate`

4. **cors:** Permite requests desde otros dominios
   - Necesario para desarrollo local
   - Permite fetch desde diferentes puertos

5. **extract-zip:** Descomprimir archivos ZIP
   - Usa streams (eficiente con archivos grandes)
   - Manejo de errores

### Frontend Stack

**Tecnologías:**
- HTML5
- CSS3 (Vanilla, sin frameworks)
- JavaScript ES6+ (Vanilla, sin frameworks)
- Fetch API (requests HTTP)
- FormData API (upload de archivos)
- Drag & Drop API (HTML5)

**¿Por qué sin frameworks?**
- Dashboard es simple
- No justifica React/Vue
- Carga más rápida
- Sin dependencias
- Fácil de mantener

### Nginx Configuration

**Características clave:**

```nginx
# 1. Límite de upload
client_max_body_size 100M;

# 2. Compression
gzip on;
gzip_types text/plain text/css application/json application/javascript;

# 3. Upstream (backend)
upstream deployment_server {
  server deployment-server:3000;
}

# 4. Proxy para API
location /api/ {
  proxy_pass http://deployment_server;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}

# 5. Proxy para Dashboard
location /dashboard/ {
  proxy_pass http://deployment_server;
}

# 6. Aplicación Angular
location / {
  root /usr/share/nginx/html/active-build;
  try_files $uri $uri/ /index.html;  # SPA routing
}

# 7. Cache headers
location ~* \.(js|css)$ {
  add_header Cache-Control "public, max-age=3600";
  expires 1h;
}

location ~* \.(png|jpg|svg|woff)$ {
  expires 1y;
  add_header Cache-Control "public, immutable";
}
```

## 🚀 Optimizaciones y Best Practices

### Performance

1. **Nginx sirve archivos estáticos directamente**
   - No pasa por Node.js
   - Mucho más rápido
   - Node.js solo maneja API

2. **Gzip compression**
   - Reduce tamaño de transferencia
   - Habilitado para JS, CSS, JSON

3. **Cache headers**
   - Assets se cachean en browser
   - Reduce requests

### Seguridad

1. **HTTP Basic Auth** en endpoints críticos
2. **Validación de tipos de archivo** (solo .zip)
3. **Límite de tamaño** (100MB)
4. **No se puede eliminar build activo**
5. **Headers de seguridad** en Nginx:
   ```nginx
   add_header X-Frame-Options "SAMEORIGIN";
   add_header X-Content-Type-Options "nosniff";
   add_header X-XSS-Protection "1; mode=block";
   ```

### Reliability

1. **Health checks** en Docker Compose
   ```yaml
   healthcheck:
     test: ["CMD", "wget", "--spider", "http://localhost:3000/api/health"]
     interval: 30s
     timeout: 10s
     retries: 3
   ```

2. **Restart policy**
   ```yaml
   restart: unless-stopped
   ```

3. **Volúmenes persistentes** para datos

## 📈 Monitoreo y Debugging

### Logs del Sistema

**Ver logs en tiempo real:**
```bash
docker-compose logs -f
```

**Ver logs de un servicio específico:**
```bash
docker-compose logs -f deployment-server
docker-compose logs -f nginx
```

**Ver logs de Nginx dentro del contenedor:**
```bash
docker exec -it impugna-nginx tail -f /var/log/nginx/access.log
docker exec -it impugna-nginx tail -f /var/log/nginx/error.log
```

### Inspeccionar Estado

**Ver contenedores:**
```bash
docker-compose ps
```

**Ver metadata de builds:**
```bash
cat builds/metadata.json | jq .
```

**Ver qué está desplegado:**
```bash
ls -la active-build/
```

**Ver uso de espacio:**
```bash
du -sh builds/ uploads/ active-build/
```

### Debugging del Backend

**Entrar al contenedor:**
```bash
docker exec -it impugna-deployment-server sh
```

**Dentro del contenedor:**
```bash
# Ver archivos
ls -la /app/

# Ver builds
ls -la /app/builds/

# Ver metadata
cat /app/builds/metadata.json

# Ver logs de Node.js
# (los logs van a stdout, verlos con docker-compose logs)
```

### Debugging del Frontend

**Abrir DevTools del navegador (F12):**

1. **Console:** Ver errores de JavaScript
2. **Network:** Ver requests al API
3. **Application > Storage:** Ver si hay datos en localStorage
4. **Sources:** Ver código fuente de app.js

**Verificar credenciales:**
```javascript
// En la consola del navegador:
console.log(btoa('admin:impugnaINE2024'));
// Debe dar: YWRtaW46aW1wdWduYUlORTIwMjQ=
```

## 🎓 Conceptos Avanzados

### ¿Por qué dos contenedores?

**Ventajas de separar Nginx y Node.js:**

1. **Especialización:**
   - Nginx: experto en servir archivos estáticos
   - Node.js: experto en lógica de negocio

2. **Performance:**
   - Nginx maneja miles de conexiones concurrentes
   - Node.js solo procesa API (menos carga)

3. **Escalabilidad:**
   - Puedes escalar solo el backend si necesitas
   - Nginx puede hacer load balancing a múltiples backends

4. **Seguridad:**
   - Nginx actúa como primer filtro
   - Node.js no está expuesto directamente

### ¿Por qué metadata.json?

**Alternativas consideradas:**

1. **Base de datos SQL:**
   - ❌ Overkill para pocos builds
   - ❌ Requiere otro contenedor
   - ❌ Más complejo

2. **Base de datos NoSQL (MongoDB):**
   - ❌ Similar al anterior
   - ❌ No justifica la complejidad

3. **Archivo JSON:**
   - ✅ Simple
   - ✅ Human-readable
   - ✅ Fácil de backup
   - ✅ Sin dependencias

**Limitaciones:**
- No escala a miles de builds
- No tiene transacciones atómicas
- Para >100 builds, considerar DB real

### ¿Por qué extraer BUILD_INFO.txt?

**Razón:** Performance y UX

1. **Sin extracción:**
   - Para mostrar info, hay que descomprimir TODO el ZIP
   - 100 MB descomprimidos solo para leer 1 KB
   - Lento

2. **Con extracción:**
   - Se extrae una vez al subir
   - Se guarda como archivo separado
   - Leer info es instantáneo

**Código de extracción (server.js líneas 93-117):**

```javascript
async function extractBuildInfo(zipPath) {
  const tempDir = path.join(UPLOADS_DIR, 'temp_' + Date.now());

  await fs.mkdir(tempDir, { recursive: true });
  await extract(zipPath, { dir: tempDir });  // Descomprime todo

  const buildInfoPath = path.join(tempDir, 'BUILD_INFO.txt');
  let buildInfo = 'No disponible';

  try {
    buildInfo = await fs.readFile(buildInfoPath, 'utf8');  // Lee el archivo
  } catch (err) {
    // BUILD_INFO.txt no existe en el ZIP
  }

  await fs.rm(tempDir, { recursive: true, force: true });  // Limpia temp

  return buildInfo;
}
```

---

**Última actualización:** Noviembre 2025
**Versión:** 1.0.0
