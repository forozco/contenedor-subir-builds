const express = require('express');
const multer = require('multer');
const basicAuth = require('express-basic-auth');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const extract = require('extract-zip');
const { execSync } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Directorios
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const BUILDS_DIR = path.join(__dirname, 'builds');
const ACTIVE_BUILD_DIR = path.join(__dirname, 'active-build');
const METADATA_FILE = path.join(__dirname, 'builds/metadata.json');

// Crear directorios si no existen
[UPLOADS_DIR, BUILDS_DIR, ACTIVE_BUILD_DIR].forEach(dir => {
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
});

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    cb(null, `${timestamp}_${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.zip') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos ZIP'));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max
  }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Autenticación básica (opcional)
const auth = basicAuth({
  users: {
    [process.env.ADMIN_USER || 'admin']: process.env.ADMIN_PASSWORD || 'impugnaINE2024'
  },
  challenge: true,
  realm: 'ImpugnaINE Deployment Server'
});

// Servir interfaz web
app.use('/dashboard', express.static(path.join(__dirname, 'web')));

// === FUNCIONES AUXILIARES ===

/**
 * Leer metadatos de builds
 */
async function readMetadata() {
  try {
    const data = await fs.readFile(METADATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { builds: [], activeId: null };
  }
}

/**
 * Guardar metadatos de builds
 */
async function saveMetadata(metadata) {
  await fs.writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2));
}

/**
 * Extraer BUILD_INFO.txt de un ZIP
 */
async function extractBuildInfo(zipPath) {
  const tempDir = path.join(UPLOADS_DIR, 'temp_' + Date.now());

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await extract(zipPath, { dir: tempDir });

    const buildInfoPath = path.join(tempDir, 'BUILD_INFO.txt');
    let buildInfo = 'No disponible';

    try {
      buildInfo = await fs.readFile(buildInfoPath, 'utf8');
    } catch (err) {
      // BUILD_INFO.txt no existe
    }

    // Limpiar directorio temporal
    await fs.rm(tempDir, { recursive: true, force: true });

    return buildInfo;
  } catch (error) {
    console.error('Error extrayendo BUILD_INFO:', error);
    return 'Error al leer BUILD_INFO.txt';
  }
}

/**
 * Obtener tamaño de archivo formateado
 */
function getFileSize(filePath) {
  const stats = fsSync.statSync(filePath);
  const bytes = stats.size;

  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// === ENDPOINTS DE API ===

/**
 * GET /api/health - Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/**
 * GET /api/builds - Listar todos los builds
 */
app.get('/api/builds', auth, async (req, res) => {
  try {
    const metadata = await readMetadata();
    res.json(metadata);
  } catch (error) {
    console.error('Error listando builds:', error);
    res.status(500).json({ error: 'Error al listar builds' });
  }
});

/**
 * POST /api/upload - Subir un nuevo build
 */
app.post('/api/upload', auth, upload.single('build'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    const uploadedFile = req.file;
    const buildId = `build_${Date.now()}`;
    const buildDir = path.join(BUILDS_DIR, buildId);

    // Crear directorio para el build
    await fs.mkdir(buildDir, { recursive: true });

    // Mover archivo ZIP al directorio del build
    const zipDestination = path.join(buildDir, uploadedFile.originalname);
    // Usar copyFile + unlink en vez de rename para cross-device compatibility
    await fs.copyFile(uploadedFile.path, zipDestination);
    await fs.unlink(uploadedFile.path);

    // Extraer BUILD_INFO.txt
    const buildInfo = await extractBuildInfo(zipDestination);

    // Guardar BUILD_INFO como archivo separado
    await fs.writeFile(path.join(buildDir, 'BUILD_INFO.txt'), buildInfo);

    // Crear metadata del build
    const buildMetadata = {
      id: buildId,
      filename: uploadedFile.originalname,
      uploadedAt: new Date().toISOString(),
      size: getFileSize(zipDestination),
      sizeBytes: uploadedFile.size,
      buildInfo: buildInfo,
      deployed: false,
      uploadedBy: req.auth?.user || 'unknown'
    };

    // Actualizar metadata global
    const metadata = await readMetadata();
    metadata.builds.unshift(buildMetadata);
    await saveMetadata(metadata);

    res.json({
      success: true,
      message: 'Build subido exitosamente',
      build: buildMetadata
    });

  } catch (error) {
    console.error('Error subiendo build:', error);
    res.status(500).json({
      error: 'Error al subir el build',
      details: error.message
    });
  }
});

/**
 * POST /api/deploy/:buildId - Desplegar un build específico
 */
app.post('/api/deploy/:buildId', auth, async (req, res) => {
  try {
    const { buildId } = req.params;
    const buildDir = path.join(BUILDS_DIR, buildId);

    // Verificar que el build existe
    const metadata = await readMetadata();
    const build = metadata.builds.find(b => b.id === buildId);

    if (!build) {
      return res.status(404).json({ error: 'Build no encontrado' });
    }

    const zipPath = path.join(buildDir, build.filename);

    // Limpiar contenido del directorio de build activo (sin eliminar el directorio mismo)
    try {
      const files = await fs.readdir(ACTIVE_BUILD_DIR);
      for (const file of files) {
        await fs.rm(path.join(ACTIVE_BUILD_DIR, file), { recursive: true, force: true });
      }
    } catch (err) {
      // Si el directorio no existe, crearlo
      await fs.mkdir(ACTIVE_BUILD_DIR, { recursive: true });
    }

    // Extraer ZIP al directorio activo
    await extract(zipPath, { dir: ACTIVE_BUILD_DIR });

    // Actualizar metadata
    metadata.builds.forEach(b => {
      b.deployed = b.id === buildId;
    });
    metadata.activeId = buildId;
    metadata.lastDeployment = new Date().toISOString();
    await saveMetadata(metadata);

    // Recargar nginx (si está disponible)
    try {
      execSync('nginx -s reload', { stdio: 'pipe' });
    } catch (err) {
      // Nginx no disponible o no es necesario
    }

    res.json({
      success: true,
      message: 'Build desplegado exitosamente',
      buildId: buildId,
      deployedAt: metadata.lastDeployment
    });

  } catch (error) {
    console.error('Error desplegando build:', error);
    res.status(500).json({
      error: 'Error al desplegar el build',
      details: error.message
    });
  }
});

/**
 * DELETE /api/builds/:buildId - Eliminar un build
 */
app.delete('/api/builds/:buildId', auth, async (req, res) => {
  try {
    const { buildId } = req.params;
    const buildDir = path.join(BUILDS_DIR, buildId);

    const metadata = await readMetadata();
    const build = metadata.builds.find(b => b.id === buildId);

    if (!build) {
      return res.status(404).json({ error: 'Build no encontrado' });
    }

    // No permitir eliminar el build activo si hay otros builds disponibles
    if (build.deployed && metadata.builds.length > 1) {
      return res.status(400).json({
        error: 'No se puede eliminar el build actualmente desplegado. Despliega otro build primero.'
      });
    }

    // Si es el único build y está desplegado, limpiar active-build
    if (build.deployed && metadata.builds.length === 1) {
      try {
        const files = await fs.readdir(ACTIVE_BUILD_DIR);
        for (const file of files) {
          await fs.rm(path.join(ACTIVE_BUILD_DIR, file), { recursive: true, force: true });
        }
      } catch (err) {
        console.error('Error limpiando active-build:', err);
      }
    }

    // Eliminar directorio del build
    await fs.rm(buildDir, { recursive: true, force: true });

    // Actualizar metadata
    metadata.builds = metadata.builds.filter(b => b.id !== buildId);
    metadata.activeId = null;
    metadata.lastDeployment = null;
    await saveMetadata(metadata);

    res.json({
      success: true,
      message: 'Build eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando build:', error);
    res.status(500).json({
      error: 'Error al eliminar el build',
      details: error.message
    });
  }
});

/**
 * GET /api/builds/:buildId/info - Obtener BUILD_INFO.txt de un build
 */
app.get('/api/builds/:buildId/info', auth, async (req, res) => {
  try {
    const { buildId } = req.params;
    const buildInfoPath = path.join(BUILDS_DIR, buildId, 'BUILD_INFO.txt');

    const buildInfo = await fs.readFile(buildInfoPath, 'utf8');
    res.type('text/plain').send(buildInfo);

  } catch (error) {
    console.error('Error leyendo BUILD_INFO:', error);
    res.status(404).json({ error: 'BUILD_INFO.txt no encontrado' });
  }
});

/**
 * GET /api/active - Obtener información del build activo
 */
app.get('/api/active', async (req, res) => {
  try {
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

  } catch (error) {
    console.error('Error obteniendo build activo:', error);
    res.status(500).json({ error: 'Error al obtener build activo' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  SERVIDOR DE DEPLOYMENT - IMPUGNA INE                ║
╚═══════════════════════════════════════════════════════╝

✓ Servidor API corriendo en puerto ${PORT}
✓ Dashboard disponible en: http://localhost:${PORT}/dashboard

Credenciales:
  Usuario: ${process.env.ADMIN_USER || 'admin'}
  Password: ${process.env.ADMIN_PASSWORD || 'impugnaINE2024'}

Endpoints:
  GET  /api/health          - Health check
  GET  /api/builds          - Listar builds
  POST /api/upload          - Subir build
  POST /api/deploy/:id      - Desplegar build
  GET  /api/active          - Build activo

Presiona Ctrl+C para detener el servidor
  `);
});
