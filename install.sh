#!/bin/bash

# Script de instalación rápida del servidor de deployment
# Uso: ./install.sh

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  INSTALACIÓN DEL SERVIDOR DE DEPLOYMENT - IMPUGNA INE"
echo "═══════════════════════════════════════════════════════"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Este script debe ejecutarse desde el directorio deployment-server/"
    echo "   Uso: cd deployment-server && ./install.sh"
    exit 1
fi

# Verificar Docker
echo "Verificando requisitos..."
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker no está instalado"
    echo "   Instala Docker desde: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: Docker Compose no está instalado"
    echo "   Instala Docker Compose desde: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✓ Docker instalado"
echo "✓ Docker Compose instalado"
echo ""

# Crear archivo .env si no existe
if [ ! -f ".env" ]; then
    echo "Creando archivo de configuración..."
    cp .env.example .env
    echo "✓ Archivo .env creado"
    echo ""
    echo "Credenciales por defecto:"
    echo "  Usuario: admin"
    echo "  Password: impugnaINE2024"
    echo ""
    read -p "¿Deseas cambiar las credenciales? (s/n): " cambiar
    if [[ $cambiar =~ ^[sS]$ ]]; then
        read -p "Nuevo usuario: " nuevo_usuario
        read -sp "Nueva contraseña: " nueva_password
        echo ""
        sed -i.bak "s/ADMIN_USER=admin/ADMIN_USER=$nuevo_usuario/" .env
        sed -i.bak "s/ADMIN_PASSWORD=impugnaINE2024/ADMIN_PASSWORD=$nueva_password/" .env
        rm -f .env.bak
        echo "✓ Credenciales actualizadas"
    fi
else
    echo "✓ Archivo .env ya existe"
fi
echo ""

# Crear directorios necesarios
echo "Creando directorios..."
mkdir -p uploads builds active-build config
echo "✓ Directorios creados"
echo ""

# Crear archivo de configuración del cliente
if [ ! -f "config/client.json" ]; then
    echo "Creando configuración del cliente..."
    cp config/client.json.example config/client.json
    echo "✓ Archivo config/client.json creado"
else
    echo "✓ Archivo config/client.json ya existe"
fi
echo ""

# Construir e iniciar contenedores
echo "═══════════════════════════════════════════════════════"
echo "  INICIANDO SERVIDOR"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Construyendo imágenes de Docker..."
docker-compose build

echo ""
echo "Iniciando contenedores..."
docker-compose up -d

echo ""
echo "Esperando a que los servicios estén listos..."
sleep 5

# Verificar que los contenedores estén corriendo
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  ✓ ¡INSTALACIÓN COMPLETADA!"
    echo "═══════════════════════════════════════════════════════"
    echo ""
    echo "Servidor disponible en:"
    echo "  🌐 Aplicación: http://localhost:8080"
    echo "  📊 Dashboard:  http://localhost:8080/dashboard"
    echo "  🔌 API:        http://localhost:8080/api"
    echo ""

    # Leer credenciales del .env
    usuario=$(grep ADMIN_USER .env | cut -d '=' -f2)
    password=$(grep ADMIN_PASSWORD .env | cut -d '=' -f2)

    echo "Credenciales de acceso:"
    echo "  Usuario:   $usuario"
    echo "  Password:  $password"
    echo ""
    echo "Próximos pasos:"
    echo "  1. Configura el cliente: cd .. && cp deployment-server/config/client.json.example deployment-server/config/client.json"
    echo "  2. Genera un build: npm run build:package"
    echo "  3. Responde 's' a deployment automático"
    echo ""
    echo "Comandos útiles:"
    echo "  docker-compose logs -f    # Ver logs"
    echo "  docker-compose ps         # Ver estado"
    echo "  docker-compose down       # Detener servidor"
    echo "  docker-compose restart    # Reiniciar servidor"
    echo ""
    echo "Documentación:"
    echo "  README.md       - Documentación completa"
    echo "  QUICK_START.md  - Guía rápida"
    echo ""
else
    echo ""
    echo "❌ Error: Los contenedores no se iniciaron correctamente"
    echo "   Ver logs: docker-compose logs"
    exit 1
fi
