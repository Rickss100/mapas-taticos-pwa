/**
 * app.js — BrasilCartaPro
 * Lógica principal: inicialização do mapa, controles, geolocalização,
 * escala dinâmica e integração dos módulos.
 */

'use strict';

// ── Constantes ──────────────────────────────────────────────
const VITORIA_CENTER = [-40.3128, -20.3155]; // lon, lat
const INITIAL_ZOOM   = 13;

// ── Estado ──────────────────────────────────────────────────
let map;
let panelOpen = false;

// ── DOM refs ────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSplash();
  registerSW();
});

function initSplash() {
  // Simula carregamento mínimo para splash visível
  setTimeout(() => {
    initMap();
  }, 800);
}

function initMap() {
  const OSM_STYLE = {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        maxzoom: 19,
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };

  map = new maplibregl.Map({
    container:          'map',
    style:              OSM_STYLE,
    center:             VITORIA_CENTER,
    zoom:               INITIAL_ZOOM,
    attributionControl: false,
    maxZoom:            20,
    minZoom:            3,
  });

  // Attribution compacta
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

  map.on('load', () => {
    // Inicializa módulos
    UTMGrid.init(map);
    Compass.init(map);
    LayerManager.init(map);
    PrintEngine.init(map);

    // UI
    initControls();
    bindLayerButtons();
    bindToggleOverlays();
    bindSearch();
    bindPrintModal();
    bindZoomButtons();

    // Listeners de mapa
    map.on('mousemove', onMouseMove);
    map.on('move',      onMapMove);
    map.on('zoom',      onMapMove);

    onMapMove(); // Atualiza info imediatamente

    // Revela app, esconde splash
    showApp();
  });
}

// ── Splash → App ────────────────────────────────────────────
function showApp() {
  const splash = $('splash-screen');
  const app    = $('app');

  app.classList.remove('hidden');
  splash.classList.add('fade-out');
  setTimeout(() => { splash.style.display = 'none'; }, 600);
}

// ── Controles de painel ─────────────────────────────────────
function initControls() {
  $('btn-toggle-panel').addEventListener('click', togglePanel);
  $('btn-close-panel').addEventListener('click',  () => setPanel(false));

  // Fechar painel clicando fora (mobile)
  $('map').addEventListener('click', () => {
    if (panelOpen && window.innerWidth < 768) setPanel(false);
  });
}

function togglePanel() { setPanel(!panelOpen); }
function setPanel(open) {
  panelOpen = open;
  $('side-panel').classList.toggle('panel-closed', !open);
}

// ── Layer Buttons ───────────────────────────────────────────
function bindLayerButtons() {
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      LayerManager.setBase(btn.dataset.layer);
      toast(`Camada: ${btn.querySelector('span:last-child').textContent}`, 'info');
    });
  });
}

// ── Overlay Toggles ─────────────────────────────────────────
function bindToggleOverlays() {
  $('toggle-grid').addEventListener('change', e => {
    UTMGrid.setEnabled(e.target.checked);
    toast(`Grade UTM ${e.target.checked ? 'ativada' : 'desativada'}`, 'info');
  });

  $('toggle-inde-wms').addEventListener('change', e => {
    LayerManager.toggleInde(e.target.checked);
    toast(`INDE/DSG WMS ${e.target.checked ? 'ativado' : 'desativado'}`, 'info');
  });

  $('toggle-ibge').addEventListener('change', e => {
    LayerManager.toggleIbge(e.target.checked);
    toast(`Limites IBGE ${e.target.checked ? 'ativados' : 'desativados'}`, 'info');
  });
}

// ── Busca por coordenadas ────────────────────────────────────
function bindSearch() {
  $('btn-go-coord').addEventListener('click', goToCoord);
  $('coord-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') goToCoord();
  });
}

function goToCoord() {
  const raw = $('coord-search').value.trim();
  if (!raw) return;

  // aceita: "lat, lon" ou "lat lon"
  const parts = raw.replace(',', ' ').trim().split(/\s+/);
  if (parts.length < 2) { toast('Formato inválido. Ex: -20.3155, -40.3128', 'error'); return; }

  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lon)) { toast('Coordenadas inválidas', 'error'); return; }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    toast('Coordenadas fora do intervalo', 'error'); return;
  }

  map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 14), speed: 1.8 });
  toast(`Navegando para ${lat.toFixed(5)}, ${lon.toFixed(5)}`, 'success');
}

// ── Minha Localização ────────────────────────────────────────
$('btn-my-location').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('Geolocalização não suportada', 'error'); return; }
  toast('Obtendo localização...', 'info');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      map.flyTo({ center: [lon, lat], zoom: 16, speed: 1.6 });
      toast(`Localização: ±${Math.round(accuracy)}m`, 'success');

      // Marcador temporário
      const el = document.createElement('div');
      el.className = 'my-location-dot';
      el.style.cssText = `
        width: 16px; height: 16px;
        background: #4ade80;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 0 0 4px rgba(74,222,128,0.3);
        animation: pulse-loc 2s ease-in-out infinite;
      `;
      new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map);

      // Adiciona estilo de animação
      if (!document.getElementById('loc-style')) {
        const s = document.createElement('style');
        s.id = 'loc-style';
        s.textContent = `
          @keyframes pulse-loc {
            0%,100% { box-shadow: 0 0 0 4px rgba(74,222,128,0.3); }
            50%      { box-shadow: 0 0 0 10px rgba(74,222,128,0); }
          }
        `;
        document.head.appendChild(s);
      }
    },
    err => {
      const messages = {
        1: 'Permissão de localização negada',
        2: 'Localização indisponível',
        3: 'Tempo esgotado',
      };
      toast(messages[err.code] || 'Erro de geolocalização', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

// ── Eventos do mapa ──────────────────────────────────────────
function onMouseMove(e) {
  if (!e) return;
  const { lat, lng } = e.lngLat;
  $('coord-lat').textContent = `${lat.toFixed(5)}°`;
  $('coord-lon').textContent = `${lng.toFixed(5)}°`;

  // UTM overlay
  const utm = UTMGrid.latLonToUTM(lat, lng);
  $('utm-e').textContent = `E ${Math.round(utm.easting).toLocaleString('pt-BR')}`;
  $('utm-n').textContent = `N ${Math.round(utm.northing).toLocaleString('pt-BR')}`;
}

function onMapMove() {
  const zoom   = map.getZoom();
  const center = map.getCenter();

  $('info-zoom').textContent = zoom.toFixed(1);

  // Fuso UTM
  const zone = Math.floor((center.lng + 180) / 6) + 1;
  const hem  = center.lat < 0 ? 'S' : 'N';
  $('info-zone').textContent = `${zone}${hem}`;

  // Barra de escala
  updateScaleBar(zoom, center.lat);
}

function updateScaleBar(zoom, lat) {
  const metersPerPx = (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);
  // Tenta achar um valor de escala "bonito"
  const targetPx = 120; // pixels desejados para a barra
  const meters   = metersPerPx * targetPx;

  let niceMeters, label;
  if      (meters >= 100000) { niceMeters = Math.round(meters / 100000) * 100000; label = `${niceMeters / 1000} km`; }
  else if (meters >= 10000)  { niceMeters = Math.round(meters / 10000)  * 10000;  label = `${niceMeters / 1000} km`; }
  else if (meters >= 1000)   { niceMeters = Math.round(meters / 1000)   * 1000;   label = `${niceMeters / 1000} km`; }
  else if (meters >= 100)    { niceMeters = Math.round(meters / 100)    * 100;    label = `${niceMeters} m`;  }
  else if (meters >= 10)     { niceMeters = Math.round(meters / 10)     * 10;     label = `${niceMeters} m`;  }
  else                       { niceMeters = Math.round(meters);                   label = `${niceMeters} m`;  }

  const barW = niceMeters / metersPerPx;
  $('scale-line').style.width  = `${Math.max(50, Math.min(200, barW))}px`;
  $('scale-label').textContent = label;
}

// ── Zoom Buttons ─────────────────────────────────────────────
function bindZoomButtons() {
  $('btn-zoom-in').addEventListener('click',  () => map.zoomIn({ duration: 300 }));
  $('btn-zoom-out').addEventListener('click', () => map.zoomOut({ duration: 300 }));
}

// ── Print Modal ──────────────────────────────────────────────
function bindPrintModal() {
  $('btn-print').addEventListener('click',       () => $('print-overlay').classList.remove('hidden'));
  $('btn-close-print').addEventListener('click', () => $('print-overlay').classList.add('hidden'));

  $('print-overlay').addEventListener('click', e => {
    if (e.target === $('print-overlay')) $('print-overlay').classList.add('hidden');
  });

  $('btn-do-print').addEventListener('click', () => {
    $('print-overlay').classList.add('hidden');
    setTimeout(() => PrintEngine.printA3(), 300);
  });

  $('btn-export-png').addEventListener('click', async () => {
    $('btn-export-png').disabled    = true;
    $('btn-export-png').textContent = '⏳ Gerando…';
    toast('Gerando imagem PNG…', 'info');

    try {
      await PrintEngine.downloadPNG({
        title:          $('print-title').value,
        subtitle:       $('print-subtitle').value,
        classification: $('print-classification').value,
        includeGrid:    $('print-include-grid').checked,
        includeCompass: $('print-include-compass').checked,
        includeScale:   $('print-include-scale').checked,
      });
      toast('PNG exportado com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      toast('Erro ao exportar PNG', 'error');
    } finally {
      $('btn-export-png').disabled    = false;
      $('btn-export-png').textContent = '⬇ Exportar PNG';
    }
  });
}

// ── Toast ────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = '0.3s'; }, 2800);
  setTimeout(() => el.remove(), 3100);
}

// ── Service Worker ───────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('[SW] Registrado:', reg.scope))
      .catch(err => console.warn('[SW] Erro:', err));
  }
}
