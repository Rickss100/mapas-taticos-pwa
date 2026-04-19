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
    Ruler.init(map);

    // UI
    initControls();
    bindLayerButtons();
    bindToggleOverlays();
    bindSearch();
    bindPrintModal();
    bindZoomButtons();
    bindRuler();

    // Listeners de mapa
    map.on('mousemove', onMouseMove);
    map.on('move',      onMapMove);
    map.on('zoom',      onMapMove);

    onMapMove(); // Atualiza info imediatamente

    // Fix 1.2/1.4: feedback de erro de camadas WMS externas
    map.on('error', (e) => {
      const src = e?.sourceId || '';
      if (src.includes('ibge')) {
        toast('⚠️ Limites IBGE: servidor bloqueou requisição (CORS). Indisponível no browser.', 'error', 7000);
      } else if (src.includes('inde') || src.includes('dsg')) {
        toast('⚠️ Carta DSG: servidor militar pode estar indisponível. Tente novamente mais tarde.', 'info', 5000);
      }
    });

    // Observer garante que o WebGL Canvas não seja achatado
    const resizeObserver = new ResizeObserver(() => {
      if (window.map) {
        window.map.resize();
        // Força um segundo resize após um curto delay para garantir sincronia com animações CSS
        setTimeout(() => window.map.resize(), 100);
      }
    });
    resizeObserver.observe(document.getElementById('map-container'));

    // Revela app, esconde splash
    showApp();
    
    // Força re-render inicial
    window.dispatchEvent(new Event('resize'));
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
  setTimeout(() => { if (window.map) window.map.resize(); }, 150);
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

// -- Busca Hibrida: Coordenadas OU Nome de Local (Nominatim/OSM)
function bindSearch() {
  $('btn-go-coord').addEventListener('click', goToCoord);
  $('coord-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') goToCoord();
  });
}

async function goToCoord() {
  const raw = $('coord-search').value.trim();
  if (!raw) return;

  // Tenta parsear como coordenadas numericas
  const numParts = raw.replace(',', ' ').trim().split(/\s+/);
  if (numParts.length >= 2) {
    const lat = parseFloat(numParts[0]);
    const lon = parseFloat(numParts[1]);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 14), speed: 1.8 });
      toast(`✅ Coordenada: ${lat.toFixed(5)}, ${lon.toFixed(5)}`, 'success');
      return;
    }
  }

  // Busca textual via Nominatim (OSM, gratuito)
  toast('Buscando local...', 'info', 2500);
  await _nominatimSearch(raw);
}

async function _nominatimSearch(query) {
  const resultsEl = $('search-results');
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=br&accept-language=pt-BR`;
  try {
    const res  = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    const data = await res.json();
    if (!data.length) {
      toast('Local nao encontrado. Tente coordenadas lat,lon.', 'error', 4000);
      return;
    }
    if (data.length === 1) {
      _flyToResult(data[0]);
    } else {
      _showSearchResults(data);
    }
  } catch (err) {
    toast('Erro na busca. Verifique a conexao.', 'error', 4000);
    console.warn('[Nominatim]', err);
  }
}

function _showSearchResults(results) {
  const el = $('search-results');
  if (!el) return;
  el.innerHTML = '';
  el.style.display = 'block';
  results.forEach(r => {
    const item = document.createElement('button');
    item.className = 'search-result-item';
    item.textContent = r.display_name;
    item.onclick = () => {
      _flyToResult(r);
      el.style.display = 'none';
      el.innerHTML = '';
    };
    el.appendChild(item);
  });
  setTimeout(() => document.addEventListener('click', function closeResults(ev) {
    if (!el.contains(ev.target)) { el.style.display = 'none'; document.removeEventListener('click', closeResults); }
  }), 100);
}

function _flyToResult(r) {
  const lat  = parseFloat(r.lat);
  const lon  = parseFloat(r.lon);
  const bbox = r.boundingbox;
  if (bbox) {
    map.fitBounds(
      [[parseFloat(bbox[2]), parseFloat(bbox[0])], [parseFloat(bbox[3]), parseFloat(bbox[1])]],
      { padding: 40, duration: 1500 }
    );
  } else {
    map.flyTo({ center: [lon, lat], zoom: 15, speed: 1.8 });
  }
  toast(`✅ ${r.display_name.split(',')[0]}`, 'success', 3000);
}

// -- Regua Tatica -------------------------------------------------
function bindRuler() {
  const btn = $('btn-ruler');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (window.Ruler) Ruler.toggle();
  });
}


// -- Seguir Localizacao (Feature 2.1) --
// 3 estados: off -> locate-once -> follow
const MyLocation = (function() {
  const STATES = { OFF: 0, ONCE: 1, FOLLOW: 2 };
  let state   = STATES.OFF;
  let watchId = null;
  let marker  = null;

  function getBtn() { return document.getElementById('btn-my-location'); }

  function updateBtn() {
    const b = getBtn();
    if (!b) return;
    // OFF: icone de mira vazia
    if (state === STATES.OFF) {
      b.innerHTML = '&#9678;'; b.className = 'map-icon-btn';
      b.title = 'Localizar minha posicao';
    }
    // ONCE: procurando GPS
    if (state === STATES.ONCE) {
      b.innerHTML = '&#9677;'; b.className = 'map-icon-btn loc-active';
      b.title = 'Localizando...';
    }
    // FOLLOW: seguindo
    if (state === STATES.FOLLOW) {
      b.innerHTML = '&#9677;'; b.className = 'map-icon-btn loc-active loc-follow';
      b.title = 'Seguindo posicao (clique para parar)';
    }
  }

  function updateDot(lat, lng, accuracy) {
    if (!window.map) return;
    if (!marker) {
      const el = document.createElement('div');
      el.className = 'my-location-dot';
      el.innerHTML = '<div class="mld-inner"></div>';
      marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat]).addTo(window.map);
    } else {
      marker.setLngLat([lng, lat]);
    }
    const geo = buildCircle(lat, lng, Math.max(10, accuracy));
    if (window.map.getSource('my-accuracy')) {
      window.map.getSource('my-accuracy').setData(geo);
    } else if (window.map.isStyleLoaded()) {
      window.map.addSource('my-accuracy', { type: 'geojson', data: geo });
      window.map.addLayer({ id: 'my-accuracy-fill', type: 'fill', source: 'my-accuracy',
        paint: { 'fill-color': '#4ade80', 'fill-opacity': 0.08 } });
      window.map.addLayer({ id: 'my-accuracy-line', type: 'line', source: 'my-accuracy',
        paint: { 'line-color': '#4ade80', 'line-width': 1.5, 'line-opacity': 0.5 } });
    }
    if (state === STATES.FOLLOW) window.map.easeTo({ center: [lng, lat], duration: 800 });
  }

  function removeDot() {
    if (marker) { marker.remove(); marker = null; }
    if (window.map && window.map.isStyleLoaded()) {
      try { window.map.removeLayer('my-accuracy-fill'); } catch (_) {}
      try { window.map.removeLayer('my-accuracy-line'); } catch (_) {}
      try { window.map.removeSource('my-accuracy'); }     catch (_) {}
    }
  }

  function handleGpsError(err) {
    state = STATES.OFF;
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    updateBtn();
    const msgs = {
      1: 'GPS negado. Ative em Configuracoes > Privacidade > Localizacao',
      2: 'Sinal GPS indisponivel. Va a area aberta ou ative dados moveis',
      3: 'Tempo de GPS esgotado. Tente novamente',
    };
    toast(msgs[err.code] || 'Erro de geolocalizacao', 'error', 7000);
  }

  function startFollow() {
    if (watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        updateDot(lat, lng, accuracy);
        window._myGpsPos = { lat, lng };
      },
      (err) => handleGpsError(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );
  }

  function toggle() {
    if (!navigator.geolocation) { toast('GPS nao suportado neste dispositivo', 'error'); return; }
    if (state === STATES.ONCE) return; // aguardando resposta GPS

    if (state === STATES.FOLLOW) {
      state = STATES.OFF;
      if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
      removeDot();
      updateBtn();
      toast('Rastreamento de posicao desativado', 'info', 2500);
      return;
    }

    // State === OFF -> inicia
    state = STATES.ONCE; updateBtn();
    toast('Localizando...', 'info', 2000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        window.map.flyTo({ center: [lng, lat], zoom: Math.max(window.map.getZoom(), 15), speed: 1.6 });
        state = STATES.FOLLOW; updateBtn();
        updateDot(lat, lng, accuracy);
        window._myGpsPos = { lat, lng };
        startFollow();
        toast('Seguindo sua posicao', 'success', 3000);
      },
      (err) => handleGpsError(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function getPosition() { return window._myGpsPos || null; }
  return { toggle, getPosition };
})();

document.getElementById('btn-my-location')?.addEventListener('click', () => MyLocation.toggle());
window.MyLocation = MyLocation;

// Constroi GeoJSON de circulo aproximado (lat/lng, raio em metros)
function buildCircle(lat, lng, radiusM, steps) {
  steps = steps || 64;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = radiusM * Math.cos(angle);
    const dy = radiusM * Math.sin(angle);
    const dLat = (dy / 6371000) * (180 / Math.PI);
    const dLng = (dx / (6371000 * Math.cos(lat * Math.PI / 180))) * (180 / Math.PI);
    coords.push([lng + dLng, lat + dLat]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } };
}


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
function toast(msg, type = 'info', duration = 3100) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  $('toast-container').appendChild(el);
  const fadeAt = Math.max(duration - 300, 200);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = '0.3s'; }, fadeAt);
  setTimeout(() => el.remove(), duration);
}

// ── Service Worker ───────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('[SW] Registrado:', reg.scope))
      .catch(err => console.warn('[SW] Erro:', err));
  }
}
