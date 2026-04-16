/**
 * modules/trails.js — BrasilCartaPro
 * Trilhas de deslocamento (Opção A: acumulação LOCAL dos updates do Firestore)
 * Sem custo extra de escrita — usa as posições que já chegam via onSnapshot.
 */

;(function(window) {
  'use strict';

  // Paleta de cores táticas disponíveis para o usuário
  const TRAIL_COLORS = [
    { id: 'red',    hex: '#ef4444', label: 'Vermelho' },
    { id: 'orange', hex: '#f97316', label: 'Laranja'  },
    { id: 'yellow', hex: '#eab308', label: 'Amarelo'  },
    { id: 'green',  hex: '#22c55e', label: 'Verde'    },
    { id: 'blue',   hex: '#3b82f6', label: 'Azul'     },
    { id: 'purple', hex: '#a855f7', label: 'Roxo'     },
    { id: 'cyan',   hex: '#06b6d4', label: 'Ciano'    },
    { id: 'white',  hex: '#f8fafc', label: 'Branco'   },
  ];

  // activeTrails: { operatorId -> { color, points: [[lng,lat], ...] } }
  const activeTrails = {};
  let map = null;
  const MAX_POINTS = 500; // limite de pontos por trilha

  const TrailManager = {
    init(mapInstance) {
      map = mapInstance;
    },

    getColors() { return TRAIL_COLORS; },

    isActive(operatorId) { return !!activeTrails[operatorId]; },

    // Mostra color picker e inicia trilha após seleção de cor
    promptAndStart(operatorId) {
      document.getElementById('trail-color-picker')?.remove();

      const picker = document.createElement('div');
      picker.id = 'trail-color-picker';
      picker.className = 'trail-picker';
      picker.innerHTML = `
        <div class="trail-picker-title">Cor da Trilha: <strong>${operatorId}</strong></div>
        <div class="trail-picker-colors">
          ${TRAIL_COLORS.map(c => `
            <button class="tpc-swatch" data-color="${c.hex}" title="${c.label}"
              style="background:${c.hex}"></button>
          `).join('')}
        </div>
        <button class="tpc-cancel">Cancelar</button>
      `;

      document.body.appendChild(picker);

      picker.querySelectorAll('.tpc-swatch').forEach(btn => {
        btn.onclick = () => {
          this.startTrail(operatorId, btn.dataset.color);
          picker.remove();
        };
      });
      picker.querySelector('.tpc-cancel').onclick = () => picker.remove();
    },

    startTrail(operatorId, color) {
      if (activeTrails[operatorId]) return;
      activeTrails[operatorId] = { color: color || '#3b82f6', points: [] };
      this._initLayer(operatorId, color);
      if (window.toast) toast(`🗺️ Trilha de ${operatorId} iniciada`, 'success', 2500);
    },

    stopTrail(operatorId) {
      if (!activeTrails[operatorId]) return;
      const pts = activeTrails[operatorId].points.length;
      this._removeLayer(operatorId);
      delete activeTrails[operatorId];
      if (window.toast) toast(`⏹️ Trilha de ${operatorId} salva (${pts} pontos)`, 'info', 3000);
    },

    // Chamado pelo collaborative.js cada vez que a posição de um operador é atualizada
    onPositionUpdate(operatorId, lat, lng) {
      const trail = activeTrails[operatorId];
      if (!trail) return;

      trail.points.push([lng, lat]);
      if (trail.points.length > MAX_POINTS) trail.points.shift();

      this._updateLayer(operatorId);
    },

    _initLayer(operatorId, color) {
      if (!map) return;
      const srcId = `trail-src-${operatorId}`;
      const lyId  = `trail-ly-${operatorId}`;

      if (!map.getSource(srcId)) {
        map.addSource(srcId, { type: 'geojson', data: _buildGeoJSON([]) });
      }

      if (!map.getLayer(lyId)) {
        map.addLayer({
          id: lyId, type: 'line', source: srcId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': color || '#3b82f6',
            'line-width': 3,
            'line-opacity': 0.85,
            'line-dasharray': [2, 0], // linha sólida; mude para [4,2] para tracejado
          },
        });
      }
    },

    _updateLayer(operatorId) {
      if (!map) return;
      const src = map.getSource(`trail-src-${operatorId}`);
      if (src) src.setData(_buildGeoJSON(activeTrails[operatorId]?.points || []));
    },

    _removeLayer(operatorId) {
      if (!map) return;
      const lyId  = `trail-ly-${operatorId}`;
      const srcId = `trail-src-${operatorId}`;
      try { if (map.getLayer(lyId))  map.removeLayer(lyId);  } catch {}
      try { if (map.getSource(srcId)) map.removeSource(srcId); } catch {}
    },

    clearAll() {
      Object.keys(activeTrails).forEach(id => this._removeLayer(id));
      Object.keys(activeTrails).forEach(id => delete activeTrails[id]);
    },
  };

  function _buildGeoJSON(points) {
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: points.length >= 2 ? points : [] },
    };
  }

  window.TrailManager = TrailManager;
})(window);
