FROM node:18-alpine

# Instalar herramientas necesarias
RUN apk add --no-cache unzip

# Crear directorios
WORKDIR /app

# Copiar package.json
COPY server/package.json ./

# Instalar dependencias
RUN npm install --production

# Copiar código del servidor
COPY server/ ./

# Crear directorios de datos
RUN mkdir -p /app/uploads /app/builds /app/active-build

# Exponer puerto
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000
ENV ADMIN_USER=admin
ENV ADMIN_PASSWORD=impugnaINE2024

# Comando de inicio
CMD ["node", "server.js"]
