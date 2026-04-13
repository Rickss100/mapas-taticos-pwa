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
    container:              'map',
    style:                  OSM_STYLE,
    center:                 VITORIA_CENTER,
    zoom:                   INITIAL_ZOOM,
    attributionControl:     false,
    maxZoom:                20,
    minZoom:                3,
    preserveDrawingBuffer:  true, // necessário para captura de canvas
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

    // Observer garante que o WebGL Canvas não seja achatado
    new ResizeObserver(() => {
      if (window.map) window.map.resize();
    }).observe(document.getElementById('map-container'));

    // Revela app, esconde splash
    showApp();
    
    // Força re-render após o painel estar visível no DOM
    setTimeout(() => { 
      if (window.map) window.map.resize(); 
    }, 50);
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

  // Layer toggles
  const bindOverlay = (toggleId, ctrlId, toggleFn, name) => {
    $(toggleId).addEventListener('change', e => {
      toggleFn.call(LayerManager, e.target.checked);
      $(ctrlId).style.display = e.target.checked ? 'flex' : 'none';
      toast(`${name} ${e.target.checked ? 'ativado' : 'desativado'}`, 'info');
    });
  };

  bindOverlay('toggle-contour',  'opacity-control-contour', LayerManager.toggleContour, 'Curvas de Nível');
  bindOverlay('toggle-inde-wms', 'opacity-control-inde',    LayerManager.toggleInde,    'Carta Topo (DSG)');
  bindOverlay('toggle-ibge',     'opacity-control-ibge',    LayerManager.toggleIbge,    'Limites IBGE');

  // Opacity sliders
  const bindOpacity = (sliderId, valId, layerId) => {
    const slider = $(sliderId);
    slider.addEventListener('input', e => {
      $(valId).textContent = `${e.target.value}%`;
      LayerManager.setOverlayOpacity(layerId, parseInt(e.target.value) / 100);
    });
  };

  bindOpacity('opacity-contour', 'oval-contour', 'contour-wms');
  bindOpacity('opacity-inde',    'oval-inde',    'inde-wms');
  bindOpacity('opacity-ibge',    'oval-ibge',    'ibge');
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

  // Botões de formato de papel
  document.querySelectorAll('.fmt-btn[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fmt-btn[data-size]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Botões de orientação
  document.querySelectorAll('.fmt-btn[data-orient]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fmt-btn[data-orient]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Enquadrar no Mapa → abre a moldura interativa
  $('btn-frame-map').addEventListener('click', () => {
    const size        = document.querySelector('.fmt-btn[data-size].active')?.dataset.size    || 'A4';
    const orientation = document.querySelector('.fmt-btn[data-orient].active')?.dataset.orient || 'landscape';
    const targetScale = parseInt($('print-target-scale').value) || 25000;

    $('print-overlay').classList.add('hidden');
    setPanel(false);

    PrintFrame.show(map, {
      size,
      orientation,
      targetScale,

      onCapture: async () => {
        const captureBtn = document.getElementById('pf-capture');
        if (captureBtn) {
          captureBtn.disabled    = true;
          captureBtn.textContent = '⏳ Gerando…';
        }
        toast('Gerando carta…', 'info');

        try {
          const canvas = await PrintFrame.capture({
            title:          $('print-title').value,
            subtitle:       $('print-subtitle').value,
            classification: $('print-classification').value,
            includeGrid:    true,
          });

          const dataUrl = canvas.toDataURL('image/png');
          PrintFrame.hide();
          _triggerPrint(dataUrl, size, orientation);
          toast('Pronto! Escolha "Salvar como PDF" no diálogo.', 'success');
        } catch (err) {
          console.error('[PrintFrame] Erro na captura:', err);
          toast('Erro ao gerar carta', 'error');
          if (captureBtn) {
            captureBtn.disabled    = false;
            captureBtn.textContent = '📄 Capturar';
          }
        }
      },
    });
  });
}

// ── Dispara diálogo de impressão com tamanho de papel correto ─
function _triggerPrint(dataUrl, size, orientation) {
  // @page dinâmico com o tamanho escolhido
  const pageSize = size === 'A3'
    ? (orientation === 'landscape' ? 'A3 landscape' : 'A3 portrait')
    : (orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait');

  let styleEl = document.getElementById('_print-page-style');
  if (!styleEl) {
    styleEl    = document.createElement('style');
    styleEl.id = '_print-page-style';
    document.head.appendChild(styleEl);
  }
  
  // Corrige problema no landscape: força a imagem a ocupar vw/vh completo da caixa impressa
  styleEl.textContent = `
    @media print {
      @page { size: ${pageSize}; margin: 0; }
      html, body {
        width: 100%;
        height: 100%;
        margin: 0 !important;
        padding: 0 !important;
      }
      body > *:not(#_print-zone) { display: none !important; }
      #_print-zone { 
        display: flex !important; 
        position: absolute;
        inset: 0;
        width: 100%; 
        height: 100%;
        margin: 0; 
        padding: 0; 
        align-items: center;
        justify-content: center;
      }
      #_print-zone img { 
        max-width: 100% !important; 
        max-height: 100% !important; 
        width: 100vw !important;
        height: 100vh !important;
        object-fit: contain; 
        display: block; 
      }
    }
  `;

  let zone = document.getElementById('_print-zone');
  if (!zone) {
    zone       = document.createElement('div');
    zone.id    = '_print-zone';
    zone.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:#fff;';
    document.body.appendChild(zone);
  }
  zone.innerHTML = '';

  const img = new Image();
  img.src = dataUrl;
  img.onload = () => {
    zone.appendChild(img);
    zone.style.display = 'block';
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        zone.style.display = 'none';
        zone.innerHTML     = '';
      }, 800);
    }, 80);
  };
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
