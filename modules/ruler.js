/**
 * modules/ruler.js — BrasilCartaPro
 * Ferramenta de medição tática: distâncias e área de perímetro
 * Mecânica: clique → pontos → linha vermelha com labels de distância acumulada
 */

;(function(window) {
  'use strict';

  const Ruler = {
    _map:     null,
    _active:  false,
    _points:  [],          // [[lng, lat], ...]
    _markers: [],          // divs de vértice no mapa
    _labels:  [],          // divs de label de distância
    _keyHandler: null,

    init(mapInstance) {
      this._map = mapInstance;
    },

    // Liga/desliga a régua
    toggle() {
      if (this._active) {
        this._deactivate();
      } else {
        this._activate();
      }
    },

    isActive() { return this._active; },

    _activate() {
      if (!this._map) return;
      this._active = true;
      this._points = [];
      this._map.getCanvas().style.cursor = 'crosshair';
      document.getElementById('btn-ruler')?.classList.add('ruler-active');

      if (window.toast) toast('📏 Régua ativa — clique para medir. Esc para cancelar.', 'info', 4500);

      this._clickHandler = (e) => this._onMapClick(e);
      this._map.on('click', this._clickHandler);

      this._keyHandler = (e) => { if (e.key === 'Escape') this._deactivate(); };
      document.addEventListener('keydown', this._keyHandler);

      // Atualiza linha em tempo real com o cursor
      this._moveHandler = (e) => this._onMapMove(e);
      this._map.on('mousemove', this._moveHandler);
    },

    _deactivate() {
      this._active = false;
      if (this._map) {
        this._map.getCanvas().style.cursor = '';
        if (this._clickHandler) this._map.off('click', this._clickHandler);
        if (this._moveHandler)  this._map.off('mousemove', this._moveHandler);
      }
      if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
      this._clickHandler = null;
      this._moveHandler  = null;
      this._keyHandler   = null;
      document.getElementById('btn-ruler')?.classList.remove('ruler-active');
      this._clearAll();
    },

    _onMapClick(e) {
      const pt = [e.lngLat.lng, e.lngLat.lat];
      this._points.push(pt);

      // Marcador de vértice
      const vertex = document.createElement('div');
      vertex.className = 'ruler-vertex';
      const vm = new maplibregl.Marker({ element: vertex, anchor: 'center' })
        .setLngLat(pt)
        .addTo(this._map);
      this._markers.push(vm);

      // Se temos 2+ pontos, atualiza linha e label
      if (this._points.length >= 2) {
        this._renderLine(this._points);
        const totalM = this._calcTotalDistance(this._points);
        this._updateDistanceLabel(pt, totalM);
        this._updatePanelStats();
      }
    },

    _onMapMove(e) {
      if (this._points.length === 0) return;
      const preview = [...this._points, [e.lngLat.lng, e.lngLat.lat]];
      this._renderLine(preview);
    },

    // GeoJSON line-string
    _renderLine(points) {
      if (!this._map) return;
      const geojson = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: points },
      };
      if (this._map.getSource('ruler-line')) {
        this._map.getSource('ruler-line').setData(geojson);
      } else {
        this._map.addSource('ruler-line', { type: 'geojson', data: geojson });

        // Sombra (casing) da linha
        this._map.addLayer({
          id: 'ruler-line-casing', type: 'line', source: 'ruler-line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#0f172a', 'line-width': 5, 'line-opacity': 0.6 },
        });
        // Linha tática vermelha tracejada
        this._map.addLayer({
          id: 'ruler-line-fill', type: 'line', source: 'ruler-line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#ef4444',
            'line-width': 2.5,
            'line-dasharray': [4, 3],
          },
        });
      }
    },

    _updateDistanceLabel(lngLat, totalMeters) {
      // Remove último label
      if (this._labels.length > 0) {
        const last = this._labels[this._labels.length - 1];
        last.marker?.remove();
      }

      const label = document.createElement('div');
      label.className = 'ruler-label';
      label.textContent = this._formatDistance(totalMeters);

      const lm = new maplibregl.Marker({ element: label, anchor: 'bottom-left', offset: [6, -6] })
        .setLngLat(lngLat)
        .addTo(this._map);

      this._labels.push({ marker: lm, element: label });
    },

    _updatePanelStats() {
      const totalM = this._calcTotalDistance(this._points);
      const el = document.getElementById('ruler-stats');
      if (!el) return;
      const segments = this._points.length - 1;
      el.innerHTML = `
        <div class="ruler-stat-row">
          <span>Distância Total</span>
          <strong>${this._formatDistance(totalM)}</strong>
        </div>
        <div class="ruler-stat-row">
          <span>Pontos</span>
          <strong>${this._points.length}</strong>
        </div>
        <div class="ruler-stat-row">
          <span>Segmentos</span>
          <strong>${segments}</strong>
        </div>
      `;
      el.style.display = 'block';
    },

    _calcTotalDistance(pts) {
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        total += this._haversine(pts[i-1][1], pts[i-1][0], pts[i][1], pts[i][0]);
      }
      return total;
    },

    _haversine(lat1, lng1, lat2, lng2) {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2
              + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },

    _formatDistance(meters) {
      if (meters >= 1000) return (meters / 1000).toFixed(2) + ' km';
      return Math.round(meters) + ' m';
    },

    _clearAll() {
      this._markers.forEach(m => m.remove());
      this._labels.forEach(l => l.marker?.remove());
      this._markers = [];
      this._labels  = [];
      this._points  = [];

      if (this._map) {
        try { this._map.removeLayer('ruler-line-fill');   } catch (_) {}
        try { this._map.removeLayer('ruler-line-casing'); } catch (_) {}
        try { this._map.removeSource('ruler-line');       } catch (_) {}
      }

      const el = document.getElementById('ruler-stats');
      if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    },
  };

  window.Ruler = Ruler;
})(window);
