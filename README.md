# 🚀 Servidor de Deployment - ImpugnaINE

Sistema completo de gestión y deployment automático para builds de ImpugnaINE.

## 📋 Características

- ✅ **Interfaz web** moderna y responsive para gestión de builds
- ✅ **API REST** completa para integración con scripts
- ✅ **Deployment automático** desde tu máquina local
- ✅ **Historial de builds** con información detallada
- ✅ **Rollback instantáneo** entre versiones
- ✅ **Nginx** configurado para servir aplicación Angular
- ✅ **Docker & Docker Compose** para fácil deployment
- ✅ **Autenticación básica** con usuario/contraseña
- ✅ **Logs y monitoreo** de deployments

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Container                      │
├──────────────────────┬──────────────────────────────────┤
│   Nginx (Puerto 80)  │  Node.js Server (Puerto 3000)   │
│                      │                                  │
│  • Sirve app Angular │  • API REST                      │
│  • Proxy a API       │  • Manejo de uploads             │
│  • Proxy a Dashboard │  • Despliegue de builds          │
│  • Cache estático    │  • Gestión de versiones          │
└──────────────────────┴──────────────────────────────────┘
                             ↓
              ┌──────────────────────────────┐
              │   Volúmenes Persistentes     │
              ├──────────────────────────────┤
              │  • uploads/    (ZIPs)        │
              │  • builds/     (Historial)   │
              │  • active-build/ (Desplegado)│
              └──────────────────────────────┘
```

## 🚀 Inicio Rápido

### 1. Configurar el Servidor (Primera vez)

```bash
cd deployment-server

# Copiar archivo de ejemplo de variables de entorno
cp .env.example .env

# Editar credenciales si lo deseas (opcional)
nano .env

# Construir e iniciar contenedores
docker-compose up -d
```

**¡Listo!** El servidor estará disponible en:
- **Aplicación Angular**: http://localhost:8080
- **Dashboard**: http://localhost:8080/dashboard
- **API**: http://localhost:8080/api

**Credenciales por defecto**:
- Usuario: `admin`
- Contraseña: `impugnaINE2024`

### 2. Configurar Cliente (Tu máquina de desarrollo)

```bash
# Desde el directorio raíz del proyecto (no deployment-server)
cd ..

# Crear archivo de configuración
mkdir -p deployment-server/config
cp deployment-server/config/client.json.example deployment-server/config/client.json

# Editar configuración (si el servidor está en otra máquina)
nano deployment-server/config/client.json
```

**Contenido de `client.json`**:
```json
{
  "serverUrl": "http://localhost:8080",
  "username": "admin",
  "password": "impugnaINE2024"
}
```

> **Nota**: Si el servidor está en otra máquina, cambia `localhost` por la IP del servidor.

### 3. Usar el Sistema

Hay **3 formas** de usar el sistema:

#### Opción A: Deployment Automático (Recomendado)

```bash
npm run build:package
```

El script te preguntará:
1. Tipo de build (Producción/Desarrollo)
2. ¿Subir a Google Drive? (s/n)
3. **¿Desplegar automáticamente al servidor?** (s/n)
   - Si respondes **"s"**:
     - Sube el build al servidor
     - Te pregunta si deseas desplegarlo inmediatamente
     - Si aceptas, la aplicación se actualiza al instante

#### Opción B: Dashboard Web

1. Abre tu navegador: http://localhost:8080/dashboard
2. Inicia sesión con las credenciales
3. Arrastra un archivo ZIP a la zona de subida
4. Click en "Desplegar" en el build que desees

#### Opción C: API REST (Para scripts/CI-CD)

```bash
# Subir build
curl -X POST http://localhost:8080/api/upload \
  -H "Authorization: Basic $(echo -n 'admin:impugnaINE2024' | base64)" \
  -F "build=@builds/impugnaINE_v0.0.3_PROD.zip"

# Listar builds
curl -X GET http://localhost:8080/api/builds \
  -H "Authorization: Basic $(echo -n 'admin:impugnaINE2024' | base64)"

# Desplegar build
curl -X POST http://localhost:8080/api/deploy/build_1234567890 \
  -H "Authorization: Basic $(echo -n 'admin:impugnaINE2024' | base64)"
```

## 📁 Estructura de Directorios

```
deployment-server/
├── server/               # Código del servidor Node.js
│   ├── server.js        # Servidor Express + API
│   └── package.json     # Dependencias
├── web/                 # Dashboard web
│   ├── index.html       # Interfaz
│   └── app.js          # Lógica del dashboard
├── nginx/               # Configuración de Nginx
│   └── nginx.conf      # Configuración principal
├── config/              # Configuración
│   └── client.json.example  # Ejemplo de config del cliente
├── uploads/             # ZIPs subidos (temporal)
├── builds/              # Historial de builds
├── active-build/        # Build actualmente desplegado
├── Dockerfile          # Imagen del servidor
├── docker-compose.yml  # Orquestación
├── .env.example        # Variables de entorno
└── README.md           # Esta documentación
```

## 🔧 Configuración Avanzada

### Cambiar Puerto

Edita `docker-compose.yml`:

```yaml
services:
  nginx:
    ports:
      - "8080:80"  # Cambia 8080 por el puerto que desees
```

### Cambiar Credenciales

Edita `.env`:

```bash
ADMIN_USER=tu_usuario
ADMIN_PASSWORD=tu_password_seguro
```

Luego reinicia:

```bash
docker-compose down
docker-compose up -d
```

### Deployment en Servidor Remoto

1. **En el servidor**:
```bash
# Instalar Docker y Docker Compose
sudo apt-get update
sudo apt-get install docker.io docker-compose

# Clonar el código o copiar la carpeta deployment-server
cd /opt/
git clone <tu-repo> impugna-deployment

# Configurar y arrancar
cd impugna-deployment/deployment-server
cp .env.example .env
nano .env  # Ajustar credenciales
docker-compose up -d

# Configurar firewall
sudo ufw allow 8080/tcp
```

2. **En tu máquina local**:

Edita `deployment-server/config/client.json`:
```json
{
  "serverUrl": "http://IP_DEL_SERVIDOR:8080",
  "username": "admin",
  "password": "tu_password"
}
```

## 📊 API Reference

### Endpoints Principales

#### `GET /api/health`
Health check del servidor

**Respuesta**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-13T00:00:00.000Z",
  "version": "1.0.0"
}
```

#### `GET /api/builds`
Listar todos los builds

**Headers**: `Authorization: Basic <base64>`

**Respuesta**:
```json
{
  "builds": [
    {
      "id": "build_1234567890",
      "filename": "impugnaINE_v0.0.3_PROD.zip",
      "uploadedAt": "2025-01-13T00:00:00.000Z",
      "size": "4.04 MB",
      "deployed": true
    }
  ],
  "activeId": "build_1234567890"
}
```

#### `POST /api/upload`
Subir nuevo build

**Headers**: `Authorization: Basic <base64>`

**Body**: `multipart/form-data` con campo `build`

**Respuesta**:
```json
{
  "success": true,
  "message": "Build subido exitosamente",
  "build": {
    "id": "build_1234567890",
    "filename": "impugnaINE_v0.0.3_PROD.zip"
  }
}
```

#### `POST /api/deploy/:buildId`
Desplegar un build específico

**Headers**: `Authorization: Basic <base64>`

**Respuesta**:
```json
{
  "success": true,
  "message": "Build desplegado exitosamente",
  "buildId": "build_1234567890",
  "deployedAt": "2025-01-13T00:00:00.000Z"
}
```

#### `DELETE /api/builds/:buildId`
Eliminar un build (no se puede eliminar el activo)

**Headers**: `Authorization: Basic <base64>`

**Respuesta**:
```json
{
  "success": true,
  "message": "Build eliminado exitosamente"
}
```

#### `GET /api/builds/:buildId/info`
Obtener BUILD_INFO.txt de un build

**Headers**: `Authorization: Basic <base64>`

**Respuesta**: Texto plano con el contenido del BUILD_INFO.txt

## 🔍 Logs y Monitoreo

### Ver logs del servidor

```bash
# Logs en tiempo real
docker-compose logs -f

# Logs solo del servidor Node.js
docker-compose logs -f deployment-server

# Logs solo de Nginx
docker-compose logs -f nginx
```

### Ver logs de Nginx dentro del contenedor

```bash
docker exec -it impugna-nginx tail -f /var/log/nginx/access.log
docker exec -it impugna-nginx tail -f /var/log/nginx/error.log
```

### Health Checks

```bash
# Check del servidor Node.js
curl http://localhost:8080/api/health

# Check de Nginx
curl http://localhost:8080/health

# Ver estado de contenedores
docker-compose ps
```

## 🛠️ Troubleshooting

### El servidor no inicia

```bash
# Ver logs de errores
docker-compose logs

# Verificar puertos en uso
sudo lsof -i :8080
sudo lsof -i :3000

# Reiniciar contenedores
docker-compose restart
```

### No puedo subir archivos

1. Verificar credenciales en `client.json`
2. Verificar que el servidor esté corriendo: `docker-compose ps`
3. Verificar conectividad: `curl http://localhost:8080/api/health`
4. Ver logs: `docker-compose logs deployment-server`

### Build no se despliega

1. Verificar que el archivo ZIP sea válido
2. Ver logs: `docker-compose logs -f`
3. Verificar permisos: `docker exec -it impugna-deployment-server ls -la /app/active-build`

### Dashboard no carga

1. Verificar que Nginx esté corriendo: `docker-compose ps nginx`
2. Abrir consola del navegador (F12) para ver errores
3. Verificar credenciales de login

## 🔐 Seguridad

### Recomendaciones para Producción

1. **Cambiar credenciales por defecto**:
   - Edita `.env` y usa contraseñas fuertes
   - Reinicia: `docker-compose restart`

2. **Usar HTTPS**:
   - Configura un reverse proxy (nginx/traefik) con Let's Encrypt
   - O usa un balanceador de carga con SSL

3. **Firewall**:
   ```bash
   # Solo permitir acceso desde IPs específicas
   sudo ufw allow from TU_IP to any port 8080
   ```

4. **Variables de entorno**:
   - Nunca subas `.env` a git
   - El archivo `.env.example` no contiene credenciales reales

5. **Backups**:
   ```bash
   # Respaldar builds y metadata
   tar -czf backup.tar.gz builds/ uploads/
   ```

## 🚨 Comandos Útiles

```bash
# Iniciar servidor
docker-compose up -d

# Detener servidor
docker-compose down

# Reiniciar servidor
docker-compose restart

# Ver logs en tiempo real
docker-compose logs -f

# Reconstruir imágenes
docker-compose build --no-cache

# Limpiar todo (¡CUIDADO! Elimina todos los datos)
docker-compose down -v
rm -rf builds/ uploads/ active-build/

# Ver espacio usado
du -sh builds/ uploads/ active-build/

# Entrar al contenedor
docker exec -it impugna-deployment-server sh
docker exec -it impugna-nginx sh

# Ver procesos
docker-compose ps

# Ver uso de recursos
docker stats
```

## 📚 Integraciones

### GitHub Actions

```yaml
name: Deploy to ImpugnaINE Server

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build and Package
        run: npm run build:package

      - name: Upload to Deployment Server
        run: |
          curl -X POST ${{ secrets.DEPLOY_SERVER_URL }}/api/upload \
            -H "Authorization: Basic $(echo -n '${{ secrets.DEPLOY_USER }}:${{ secrets.DEPLOY_PASSWORD }}' | base64)" \
            -F "build=@builds/impugnaINE_v*.zip"
```

### GitLab CI

```yaml
deploy:
  stage: deploy
  script:
    - npm run build:package
    - |
      curl -X POST ${DEPLOY_SERVER_URL}/api/upload \
        -H "Authorization: Basic $(echo -n '${DEPLOY_USER}:${DEPLOY_PASSWORD}' | base64)" \
        -F "build=@builds/impugnaINE_v*.zip"
  only:
    - tags
```

## 🎯 Próximas Características (Roadmap)

- [ ] Notificaciones por email/Slack al subir nuevo build
- [ ] Múltiples ambientes (staging, producción)
- [ ] Comparación visual entre builds
- [ ] Métricas y analytics de deployments
- [ ] Webhook triggers para CI/CD
- [ ] Autenticación con OAuth/SSO
- [ ] Logs de aplicación en tiempo real
- [ ] Backups automáticos a S3/Google Cloud

## 📞 Soporte

Si encuentras problemas o tienes sugerencias:
1. Revisa esta documentación
2. Consulta los logs: `docker-compose logs -f`
3. Abre un issue en el repositorio del proyecto

---

**Versión**: 1.0.0
**Última actualización**: Enero 2025
**Desarrollado para**: ImpugnaINE
