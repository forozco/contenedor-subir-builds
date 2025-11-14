# 🏗️ Arquitectura del Sistema de Deployment

## Vista General del Sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MÁQUINA DE DESARROLLO                           │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  npm run build:package (create-build-package.js)                 │ │
│  │                                                                   │ │
│  │  1. ¿Tipo de build?                                              │ │
│  │     • PRODUCCIÓN (sin logs, optimizado)                          │ │
│  │     • DESARROLLO (con logs, debugging)                           │ │
│  │                                                                   │ │
│  │  2. ¿Subir a Google Drive?                                       │ │
│  │     • Sí → rclone copy + link                                    │ │
│  │     • No → solo local                                            │ │
│  │                                                                   │ │
│  │  3. ¿Desplegar automáticamente?                                  │ │
│  │     • Sí → POST /api/upload                                      │ │
│  │     • No → solo ZIP local                                        │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Salida:                                                                │
│  • builds/impugnaINE_v*.zip                                            │
│  • builds/CORREO_v*.txt                                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
        ┌────────────────┐  ┌───────────────┐  ┌─────────────────┐
        │ ALMACENAMIENTO │  │ GOOGLE DRIVE  │  │ DEPLOYMENT      │
        │ LOCAL          │  │               │  │ SERVER          │
        └────────────────┘  └───────────────┘  └─────────────────┘
                                    │                     │
                                    │                     │
                                    ↓                     ↓
                            ┌───────────────┐    ┌────────────────────┐
                            │ ImpugnaINE-   │    │  Docker Container  │
                            │ Builds/       │    │                    │
                            │  *.zip        │    │  ┌──────────────┐  │
                            │               │    │  │ Node.js      │  │
                            │ + Links       │    │  │ Express      │  │
                            │   compartibles│    │  │ API REST     │  │
                            └───────────────┘    │  └──────────────┘  │
                                                 │         ↕          │
                                                 │  ┌──────────────┐  │
                                                 │  │ Nginx        │  │
                                                 │  │ Web Server   │  │
                                                 │  └──────────────┘  │
                                                 │         ↕          │
                                                 │  ┌──────────────┐  │
                                                 │  │ Dashboard    │  │
                                                 │  │ Web UI       │  │
                                                 │  └──────────────┘  │
                                                 └────────────────────┘
                                                          │
                                                          ↓
                                                 ┌────────────────────┐
                                                 │ Volúmenes Docker   │
                                                 │ • uploads/         │
                                                 │ • builds/          │
                                                 │ • active-build/    │
                                                 └────────────────────┘
```

## Componentes Detallados

### 1. Script de Build (`create-build-package.js`)

**Responsabilidades**:
- Compilar código Angular
- Empaquetar en ZIP con metadata
- Integración con rclone (Google Drive)
- Upload vía API al servidor
- Generación de templates

**Flujo**:
```
Inicio
  ↓
Pregunta: ¿Tipo de build?
  ↓
Ejecuta: ng build [--configuration=dev]
  ↓
Crea: BUILD_INFO.txt
  ↓
Empaqueta: ZIP con versión + tipo
  ↓
Pregunta: ¿Google Drive?
  ├─ Sí → rclone copy → Google Drive
  └─ No → continuar
  ↓
Pregunta: ¿Deployment automático?
  ├─ Sí → curl POST /api/upload → Servidor
  └─ No → fin
  ↓
Genera: CORREO_*.txt
  ↓
Fin
```

### 2. Google Drive Integration (rclone)

**Tecnología**: rclone CLI

**Configuración**:
```
~/.config/rclone/rclone.conf
  ├─ [gdrive-impugnaINE]
  ├─ type = drive
  ├─ scope = drive
  └─ token = {...}
```

**Operaciones**:
- `rclone mkdir` → Crear carpeta
- `rclone copy` → Subir archivo
- `rclone link` → Generar link compartible

**Estructura en Drive**:
```
Google Drive/
└── ImpugnaINE-Builds/
    ├── impugnaINE_v0.0.3_PROD.zip
    ├── impugnaINE_v0.0.3_DEV.zip
    ├── impugnaINE_v0.0.4_PROD.zip
    └── ...
```

### 3. Servidor de Deployment (Docker)

#### 3.1 Arquitectura de Contenedores

```
Docker Network: impugna-network
  │
  ├─ Container: impugna-deployment-server (Node.js)
  │    Port: 3000 (interno)
  │    Volumes:
  │      • ./uploads → /app/uploads
  │      • ./builds → /app/builds
  │      • ./active-build → /app/active-build
  │      • ./web → /app/web (read-only)
  │    
  └─ Container: impugna-nginx (Nginx)
       Port: 8080 → 80 (público)
       Volumes:
         • ./nginx/nginx.conf → /etc/nginx/nginx.conf (read-only)
         • ./active-build → /usr/share/nginx/html/active-build (read-only)
         • nginx-logs → /var/log/nginx
```

#### 3.2 Servidor Node.js (Express)

**Endpoints**:

```
GET  /api/health
     └─ Health check del servidor

GET  /api/builds [auth required]
     └─ Lista todos los builds con metadata

POST /api/upload [auth required]
     ├─ Recibe multipart/form-data
     ├─ Valida archivo ZIP
     ├─ Guarda en uploads/
     ├─ Mueve a builds/{buildId}/
     ├─ Extrae BUILD_INFO.txt
     └─ Actualiza metadata.json

POST /api/deploy/:buildId [auth required]
     ├─ Valida que build existe
     ├─ Limpia active-build/
     ├─ Extrae ZIP a active-build/
     ├─ Actualiza metadata (activo)
     └─ Recarga nginx (opcional)

DELETE /api/builds/:buildId [auth required]
       ├─ Valida que NO esté activo
       ├─ Elimina builds/{buildId}/
       └─ Actualiza metadata.json

GET /api/builds/:buildId/info [auth required]
     └─ Retorna BUILD_INFO.txt

GET /api/active
     └─ Info del build actualmente desplegado
```

**Autenticación**:
```
HTTP Basic Auth
Header: Authorization: Basic base64(username:password)
```

**Metadata Storage** (`builds/metadata.json`):
```json
{
  "builds": [
    {
      "id": "build_1234567890",
      "filename": "impugnaINE_v0.0.3_PROD.zip",
      "uploadedAt": "2025-01-13T12:00:00.000Z",
      "size": "4.04 MB",
      "sizeBytes": 4237824,
      "buildInfo": "...",
      "deployed": true,
      "uploadedBy": "admin"
    }
  ],
  "activeId": "build_1234567890",
  "lastDeployment": "2025-01-13T12:05:00.000Z"
}
```

#### 3.3 Nginx

**Configuración**:

```nginx
# Servidor principal
server {
  listen 80;
  root /usr/share/nginx/html/active-build;
  index index.html;

  # Aplicación Angular
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Proxy a API Node.js
  location /api/ {
    proxy_pass http://deployment-server:3000;
  }

  # Proxy a Dashboard
  location /dashboard/ {
    proxy_pass http://deployment-server:3000;
  }

  # Cache de assets
  location ~* \.(js|css|png|jpg|svg|woff|woff2)$ {
    expires 1y;
  }
}
```

**Funciones**:
- Servir aplicación Angular desplegada
- Proxy reverso a API
- Cache de assets estáticos
- Compresión gzip
- Logs de acceso

#### 3.4 Dashboard Web

**Tecnología**: HTML + Vanilla JS (sin frameworks)

**Arquitectura**:

```
index.html
  │
  ├─ Estructura HTML
  │    ├─ Header (título, descripción)
  │    ├─ Stats (total, activo, último)
  │    ├─ Upload Zone (drag & drop)
  │    └─ Builds List (cards)
  │
  └─ app.js
       │
       ├─ Estado Global
       │    ├─ builds: []
       │    └─ activeId: null
       │
       ├─ Funciones de UI
       │    ├─ renderBuilds()
       │    ├─ updateStats()
       │    └─ showAlert()
       │
       ├─ Funciones de API
       │    ├─ loadBuilds()
       │    ├─ deployBuild()
       │    ├─ deleteBuild()
       │    └─ uploadFile()
       │
       └─ Event Handlers
            ├─ Drag & Drop
            ├─ File Input
            └─ Modal
```

**Comunicación con API**:

```javascript
const API_BASE = window.location.origin;
const AUTH = btoa('admin:impugnaINE2024');

fetch(`${API_BASE}/api/builds`, {
  headers: {
    'Authorization': `Basic ${AUTH}`
  }
})
```

## Flujo de Datos

### Flujo de Upload

```
Usuario ejecuta: npm run build:package
  ↓
Script pregunta opciones
  ↓
Script genera ZIP + BUILD_INFO.txt
  ↓
[Si Google Drive = Sí]
  ↓
rclone copy → Google Drive
  ↓
rclone link → URL compartible
  ↓
[Si Deployment = Sí]
  ↓
curl POST /api/upload
  ├─ Headers: Authorization
  └─ Body: multipart/form-data
  ↓
Servidor Node.js
  ├─ Valida autenticación
  ├─ Valida archivo (.zip)
  ├─ Genera buildId único
  ├─ Mueve archivo a builds/{buildId}/
  ├─ Extrae BUILD_INFO.txt
  └─ Actualiza metadata.json
  ↓
Respuesta JSON con buildId
  ↓
[Si desplegar inmediatamente = Sí]
  ↓
curl POST /api/deploy/{buildId}
  ↓
Servidor Node.js
  ├─ Limpia active-build/
  ├─ Extrae ZIP completo a active-build/
  ├─ Marca build como deployed en metadata
  └─ Responde success
  ↓
Nginx sirve archivos de active-build/
  ↓
Aplicación disponible en http://localhost:8080
```

### Flujo desde Dashboard

```
Usuario abre: http://localhost:8080/dashboard
  ↓
Navegador carga: index.html + app.js
  ↓
JavaScript ejecuta: loadBuilds()
  ↓
GET /api/builds
  ↓
Servidor responde con metadata.json
  ↓
renderBuilds() actualiza UI
  ↓
Usuario arrastra archivo ZIP
  ↓
Event: drop
  ↓
uploadFile(file)
  ├─ Validación local (.zip, <100MB)
  └─ FormData con archivo
  ↓
POST /api/upload
  ↓
(Mismo flujo que antes)
  ↓
Actualización automática de UI
```

### Flujo de Deployment

```
Usuario hace click: "Desplegar"
  ↓
deployBuild(buildId)
  ├─ Confirmación
  └─ POST /api/deploy/{buildId}
  ↓
Servidor Node.js
  ├─ Busca build en metadata
  ├─ Valida que existe
  ├─ rm -rf active-build/*
  ├─ unzip builds/{buildId}/*.zip → active-build/
  ├─ metadata.activeId = buildId
  ├─ metadata.builds[].deployed = false (todos)
  ├─ metadata.builds[buildId].deployed = true
  └─ Guarda metadata.json
  ↓
Nginx detecta cambios en active-build/
  ↓
Sirve nuevos archivos
  ↓
Aplicación actualizada disponible
  ↓
Dashboard actualiza UI
  ↓
Badge "ACTIVO" en build desplegado
```

## Seguridad

### Capas de Seguridad

```
1. Autenticación
   ├─ HTTP Basic Auth en todos los endpoints sensibles
   ├─ Credenciales en .env (no commiteadas)
   └─ Base64 encoding en cliente

2. Validación
   ├─ Tipo de archivo (.zip únicamente)
   ├─ Tamaño máximo (100 MB)
   └─ Sanitización de nombres de archivo

3. Aislamiento
   ├─ Docker containers separados
   ├─ Network privada entre containers
   └─ Volúmenes aislados

4. CORS
   ├─ Configurado en Express
   └─ Permitir solo orígenes confiables

5. Headers de Seguridad (Nginx)
   ├─ X-Frame-Options: SAMEORIGIN
   ├─ X-Content-Type-Options: nosniff
   └─ X-XSS-Protection: 1; mode=block
```

## Escalabilidad

### Optimizaciones Actuales

```
1. Cache de Assets (Nginx)
   ├─ JS/CSS: 1 año
   ├─ Imágenes: 1 año
   └─ index.html: no-cache

2. Compresión (Nginx)
   ├─ gzip habilitado
   └─ Tipos: text/*, application/json, application/javascript

3. Persistencia
   ├─ Volúmenes Docker
   └─ Metadata en JSON (rápido acceso)

4. Health Checks
   ├─ Docker Compose health checks
   └─ Endpoints /api/health y /health
```

### Posibles Mejoras Futuras

```
1. Base de Datos
   ├─ PostgreSQL para metadata
   └─ Mejor búsqueda y filtrado

2. Object Storage
   ├─ S3 / MinIO para builds
   └─ Escalabilidad ilimitada

3. CDN
   ├─ CloudFront / CloudFlare
   └─ Distribución global

4. Multiple Instances
   ├─ Load balancer
   └─ Shared storage

5. Autenticación Avanzada
   ├─ JWT tokens
   ├─ OAuth2
   └─ RBAC (roles)
```

## Monitoreo y Observabilidad

### Logs Disponibles

```
1. Servidor Node.js
   • docker-compose logs deployment-server
   • console.log() en server.js

2. Nginx
   • /var/log/nginx/access.log
   • /var/log/nginx/error.log
   • /var/log/nginx/app.access.log
   • /var/log/nginx/app.error.log

3. Docker
   • docker-compose logs
   • docker stats
```

### Métricas

```
Actualmente disponibles:
  • Total de builds (UI)
  • Build activo (UI)
  • Último deployment (UI)
  • Uso de CPU/Memoria (docker stats)

Potenciales:
  • Tiempo de deployment
  • Tamaño promedio de builds
  • Frecuencia de rollbacks
  • Errores en API
```

---

**Versión**: 1.0.0
**Última actualización**: Enero 2025
