// Configuración
const API_BASE = window.location.origin;
const AUTH = btoa('admin:impugnaINE2024'); // Credenciales por defecto

// Estado global
let builds = [];
let activeId = null;

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  setupDropZone();
  loadBuilds();

  // Recargar cada 30 segundos
  setInterval(loadBuilds, 30000);
});

// === FUNCIONES DE CARGA DE DATOS ===

async function loadBuilds() {
  try {
    const response = await fetch(`${API_BASE}/api/builds`, {
      headers: {
        'Authorization': `Basic ${AUTH}`
      }
    });

    if (!response.ok) {
      throw new Error('Error al cargar builds');
    }

    const data = await response.json();
    builds = data.builds || [];
    activeId = data.activeId;

    updateStats();
    renderBuilds();
  } catch (error) {
    console.error('Error:', error);
    showAlert('Error al cargar los builds', 'error');
  }
}

// === FUNCIONES DE UI ===

function updateStats() {
  document.getElementById('stat-total').textContent = builds.length;

  const activeBuild = builds.find(b => b.id === activeId);
  if (activeBuild) {
    const version = extractVersion(activeBuild.filename);
    document.getElementById('stat-active').textContent = version || 'Desplegado';
  } else {
    document.getElementById('stat-active').textContent = 'Ninguno';
  }

  if (activeBuild && activeBuild.uploadedAt) {
    const date = new Date(activeBuild.uploadedAt);
    document.getElementById('stat-last').textContent = formatDate(date);
  } else {
    document.getElementById('stat-last').textContent = '-';
  }
}

function renderBuilds() {
  const container = document.getElementById('builds-list');

  if (builds.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">∅</div>
        <h3>No hay builds disponibles</h3>
        <p>Sube tu primer build usando el área de arriba</p>
      </div>
    `;
    return;
  }

  container.innerHTML = builds.map(build => {
    const isActive = build.id === activeId;
    const version = extractVersion(build.filename);
    const buildType = extractBuildType(build.filename);
    const date = new Date(build.uploadedAt);

    return `
      <div class="build-card ${isActive ? 'active' : ''}">
        <div class="build-header">
          <div class="build-title">
            <h3>${build.filename}</h3>
            <small>Subido ${formatDate(date)}</small>
          </div>
          <span class="build-badge ${isActive ? 'active' : 'inactive'}">
            ${isActive ? 'ACTIVO' : 'Disponible'}
          </span>
        </div>

        <div class="build-info">
          <div class="build-info-item">
            <label>Versión</label>
            <span>${version || 'N/A'}</span>
          </div>
          <div class="build-info-item">
            <label>Tipo</label>
            <span>${buildType}</span>
          </div>
          <div class="build-info-item">
            <label>Tamaño</label>
            <span>${build.size}</span>
          </div>
          <div class="build-info-item">
            <label>Subido por</label>
            <span>${build.uploadedBy || 'N/A'}</span>
          </div>
        </div>

        <div class="build-actions">
          ${!isActive ? `
            <button class="btn btn-success" onclick="deployBuild('${build.id}')">
              Desplegar
            </button>
          ` : `
            <button class="btn btn-primary" disabled>
              Desplegado
            </button>
          `}
          <button class="btn btn-secondary" onclick="showBuildInfo('${build.id}')">
            Ver Info
          </button>
          ${(!isActive || builds.length === 1) ? `
            <button class="btn btn-danger" onclick="deleteBuild('${build.id}', ${isActive})">
              Eliminar
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// === FUNCIONES DE ACCIONES ===

async function deployBuild(buildId) {
  if (!confirm('¿Estás seguro de desplegar este build? Esto reemplazará el build actual.')) {
    return;
  }

  try {
    showAlert('Desplegando build...', 'info');

    const response = await fetch(`${API_BASE}/api/deploy/${buildId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${AUTH}`
      }
    });

    if (!response.ok) {
      throw new Error('Error al desplegar build');
    }

    const result = await response.json();
    showAlert('Build desplegado exitosamente', 'success');

    // Recargar builds
    await loadBuilds();
  } catch (error) {
    console.error('Error:', error);
    showAlert('Error al desplegar el build', 'error');
  }
}

async function deleteBuild(buildId) {
  if (!confirm('¿Estás seguro de eliminar este build? Esta acción no se puede deshacer.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/builds/${buildId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${AUTH}`
      }
    });

    if (!response.ok) {
      throw new Error('Error al eliminar build');
    }

    showAlert('Build eliminado exitosamente', 'success');
    await loadBuilds();
  } catch (error) {
    console.error('Error:', error);
    showAlert('Error al eliminar el build', 'error');
  }
}

async function showBuildInfo(buildId) {
  try {
    const response = await fetch(`${API_BASE}/api/builds/${buildId}/info`, {
      headers: {
        'Authorization': `Basic ${AUTH}`
      }
    });

    if (!response.ok) {
      throw new Error('Error al cargar BUILD_INFO.txt');
    }

    const info = await response.text();
    document.getElementById('info-content').textContent = info;
    document.getElementById('info-modal').classList.add('active');
  } catch (error) {
    console.error('Error:', error);
    showAlert('Error al cargar la información del build', 'error');
  }
}

function closeModal() {
  document.getElementById('info-modal').classList.remove('active');
}

// === FUNCIONES DE UPLOAD ===

function setupDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  // Click para seleccionar archivo
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  // Archivo seleccionado
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      uploadFile(e.target.files[0]);
    }
  });

  // Drag & Drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    console.log('Drop event triggered!', e.dataTransfer.files.length, 'files');

    if (e.dataTransfer.files.length > 0) {
      console.log('File dropped:', e.dataTransfer.files[0].name);
      uploadFile(e.dataTransfer.files[0]);
    }
  });
}

async function uploadFile(file) {
  console.log('uploadFile called with:', file.name, file.size);

  if (!file.name.endsWith('.zip')) {
    console.log('File is not a ZIP');
    showAlert('Solo se permiten archivos ZIP', 'error');
    return;
  }

  if (file.size > 100 * 1024 * 1024) {
    console.log('File too large');
    showAlert('El archivo es demasiado grande (máx. 100 MB)', 'error');
    return;
  }

  console.log('Creating FormData and uploading...');
  const formData = new FormData();
  formData.append('build', file);

  try {
    showAlert('Subiendo archivo...', 'info');

    const response = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${AUTH}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error('Error al subir archivo');
    }

    const result = await response.json();
    showAlert('Build subido exitosamente', 'success');

    // Limpiar input
    document.getElementById('file-input').value = '';

    // Recargar builds
    await loadBuilds();
  } catch (error) {
    console.error('Error:', error);
    showAlert('Error al subir el archivo', 'error');
  }
}

// === UTILIDADES ===

function showAlert(message, type = 'info') {
  const container = document.getElementById('alert-container');
  const alertClass = `alert-${type}`;

  const alertHTML = `
    <div class="alert ${alertClass}">
      <span>${getAlertIcon(type)}</span>
      <span>${message}</span>
    </div>
  `;

  container.innerHTML = alertHTML;

  // Auto-remover después de 5 segundos
  setTimeout(() => {
    container.innerHTML = '';
  }, 5000);
}

function getAlertIcon(type) {
  const icons = {
    success: '✓',
    error: '✗',
    info: 'ℹ'
  };
  return icons[type] || 'ℹ';
}

function extractVersion(filename) {
  const match = filename.match(/v(\d+\.\d+\.\d+[^\s_]*)/);
  return match ? match[1] : null;
}

function extractBuildType(filename) {
  if (filename.includes('_PROD')) return 'PRODUCCIÓN';
  if (filename.includes('_DEV')) return 'DESARROLLO';
  return 'N/A';
}

function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Hace un momento';
  if (minutes < 60) return `Hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
  if (hours < 24) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
  if (days < 7) return `Hace ${days} día${days > 1 ? 's' : ''}`;

  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Cerrar modal al hacer click fuera
document.getElementById('info-modal').addEventListener('click', (e) => {
  if (e.target.id === 'info-modal') {
    closeModal();
  }
});
