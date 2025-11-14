# ⚡ Guía Rápida - Deployment Server

## 🚀 Setup Inicial (5 minutos)

### 1. Iniciar el Servidor

```bash
cd deployment-server
docker-compose up -d
```

**¡Listo!** Servidor corriendo en: http://localhost:8080

### 2. Configurar Cliente

```bash
# Volver al directorio raíz del proyecto
cd ..

# Copiar configuración
mkdir -p deployment-server/config
cp deployment-server/config/client.json.example deployment-server/config/client.json
```

### 3. Hacer tu Primer Deployment

```bash
npm run build:package
```

**Preguntas que aparecerán**:
1. **Tipo de build**: `1` (Producción) o `2` (Desarrollo)
2. **¿Subir a Google Drive?**: `n` (No) o `s` (Sí)
3. **¿Desplegar automáticamente?**: `s` (¡SÍ!)
4. **¿Desplegar inmediatamente?**: `s` (¡SÍ!)

**¡Tu aplicación ya está desplegada!** 🎉

Abre: http://localhost:8080

---

## 📊 Dashboard Web

**URL**: http://localhost:8080/dashboard

**Login**:
- Usuario: `admin`
- Password: `impugnaINE2024`

**Funciones**:
- ✅ Drag & drop de ZIPs
- ✅ Ver historial de builds
- ✅ Desplegar cualquier versión
- ✅ Ver BUILD_INFO.txt
- ✅ Eliminar builds antiguos
- ✅ Rollback instantáneo

---

## 🔄 Flujos de Trabajo

### Flujo 1: Deployment Automático

```
npm run build:package
   ↓
Elige tipo de build
   ↓
Elige "s" en Google Drive (opcional)
   ↓
Elige "s" en deployment automático
   ↓
Elige "s" para desplegar inmediatamente
   ↓
✅ ¡Aplicación actualizada!
```

### Flujo 2: Manual desde Dashboard

```
Genera build local
   ↓
Abre http://localhost:8080/dashboard
   ↓
Arrastra ZIP a la zona de upload
   ↓
Click "Desplegar"
   ↓
✅ ¡Aplicación actualizada!
```

### Flujo 3: Deployment Diferido

```
npm run build:package
   ↓
Elige "s" en deployment automático
   ↓
Elige "n" en desplegar inmediatamente
   ↓
Más tarde: Abre dashboard
   ↓
Click "Desplegar" en el build subido
   ↓
✅ ¡Aplicación actualizada!
```

---

## 🎯 Casos de Uso Comunes

### Actualizar a Nueva Versión

```bash
# 1. Actualizar versión en package.json
npm version patch  # o minor, o major

# 2. Generar y desplegar
npm run build:package
# Responde "s" a deployment automático
```

### Rollback a Versión Anterior

```
1. Abre http://localhost:8080/dashboard
2. Busca la versión anterior en la lista
3. Click "Desplegar"
4. ¡Listo! Vuelta a versión anterior
```

### Ver Qué Está Desplegado

```
1. Abre http://localhost:8080/dashboard
2. El build con badge verde "ACTIVO" es el desplegado
3. Click "Ver Info" para ver detalles del BUILD_INFO.txt
```

### Comparar Versiones

```
1. Abre http://localhost:8080/dashboard
2. Click "Ver Info" en cada build
3. Compara commits, fechas, y cambios
```

---

## 🛠️ Comandos Esenciales

### Servidor

```bash
# Iniciar
docker-compose up -d

# Detener
docker-compose down

# Reiniciar
docker-compose restart

# Ver logs
docker-compose logs -f

# Ver estado
docker-compose ps
```

### Build & Deploy

```bash
# Build completo con deployment
npm run build:package

# Solo build (sin preguntas)
npm run build

# Build de producción
npm run build:prod
```

---

## 🔍 Verificación Rápida

### ¿El servidor está corriendo?

```bash
curl http://localhost:8080/api/health
```

Debe responder: `{"status":"ok",...}`

### ¿Qué build está activo?

```bash
curl http://localhost:8080/api/active
```

### ¿Cuántos builds hay?

```bash
curl -u admin:impugnaINE2024 http://localhost:8080/api/builds
```

---

## ⚠️ Troubleshooting Express

### Error: "Puerto 8080 en uso"

```bash
# Opción 1: Detener el proceso que usa el puerto
sudo lsof -ti:8080 | xargs kill -9

# Opción 2: Cambiar puerto en docker-compose.yml
# Edita la línea "8080:80" a "9090:80"
```

### Error: "No se pudo conectar al servidor"

```bash
# Verificar que contenedores estén corriendo
docker-compose ps

# Si no están corriendo, iniciar
docker-compose up -d

# Ver qué salió mal
docker-compose logs
```

### Error: "Credenciales incorrectas"

Verifica en `deployment-server/config/client.json`:
```json
{
  "serverUrl": "http://localhost:8080",
  "username": "admin",
  "password": "impugnaINE2024"
}
```

### Dashboard no carga

```bash
# 1. Verificar que nginx esté corriendo
docker-compose ps nginx

# 2. Verificar logs
docker-compose logs nginx

# 3. Reiniciar nginx
docker-compose restart nginx
```

---

## 🎓 Tips Pro

1. **Usa nombres descriptivos**: El nombre del archivo incluye versión y tipo (PROD/DEV)

2. **Mantén historial**: El dashboard guarda todos los builds para rollback rápido

3. **Aprovecha BUILD_INFO.txt**: Contiene commits, fecha exacta, y configuración del build

4. **Deployment diferido**: Sube durante el día, despliega en la noche

5. **Múltiples versiones**: Puedes tener PROD y DEV al mismo tiempo (diferentes sufijos)

6. **Integra con Google Drive**: Combinable - sube a Drive Y al servidor

---

## 📱 Acceso desde Móvil

1. Encuentra la IP de tu máquina:
   ```bash
   # macOS/Linux
   ifconfig | grep inet

   # Windows
   ipconfig
   ```

2. Abre en el móvil:
   ```
   http://TU_IP:8080/dashboard
   ```

3. Puedes desplegar builds desde tu teléfono 📱

---

## 🌐 Deployment en Servidor Remoto

### Configurar servidor

```bash
# En el servidor (SSH)
cd /opt
git clone <repo> impugna
cd impugna/deployment-server
docker-compose up -d
```

### Configurar cliente local

Edita `deployment-server/config/client.json`:
```json
{
  "serverUrl": "http://IP_SERVIDOR:8080",
  "username": "admin",
  "password": "impugnaINE2024"
}
```

### Desplegar desde tu máquina

```bash
npm run build:package
# Responde "s" a deployment automático
# ¡El build va directo al servidor remoto!
```

---

## 📊 Estadísticas del Dashboard

El dashboard muestra:
- **Total Builds**: Cantidad de builds disponibles
- **Build Activo**: Versión actualmente desplegada
- **Último Deployment**: Cuándo fue el último deployment

---

## ✅ Checklist de Primer Uso

- [ ] Servidor corriendo (`docker-compose ps`)
- [ ] Dashboard accesible (http://localhost:8080/dashboard)
- [ ] Archivo `client.json` configurado
- [ ] Primer build generado (`npm run build:package`)
- [ ] Build desplegado exitosamente
- [ ] Aplicación visible en http://localhost:8080

---

**¿Necesitas más ayuda?** Consulta el [README.md](README.md) completo.
