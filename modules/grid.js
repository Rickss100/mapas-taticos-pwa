/**
 * modules/grid.js
 * Grade de coordenadas UTM dinâmica para BrasilCartaPro
 * SIRGAS 2000 (EPSG:4674) · Projeção UTM
 */

;(function (window) {
  'use strict';

  const UTMGrid = {
    // Canvas overlay para o grid
    _canvas: null,
    _ctx: null,
    _map: null,
    _enabled: true,

    /**
     * Converte graus decimais → coordenadas UTM (WGS84/SIRGAS 2000 são praticamente idênticos)
     * Retorna { easting, northing, zone, hemisphere }
     */
    latLonToUTM(lat, lon) {
      const a = 6378137.0;           // semi-eixo maior WGS84
      const f = 1 / 298.257223563;   // achatamento
      const b = a * (1 - f);
      const e2 = 1 - (b * b) / (a * a);
      const e = Math.sqrt(e2);
      const e1sq = e2 / (1 - e2);

      const phi = (lat * Math.PI) / 180;
      const lam = (lon * Math.PI) / 180;

      // Fuso UTM
      let zone = Math.floor((lon + 180) / 6) + 1;
      const lam0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);

      const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
      const T = Math.tan(phi) ** 2;
      const C = e1sq * Math.cos(phi) ** 2;
      const A = Math.cos(phi) * (lam - lam0);

      const M = a * (
        (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
        - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
        + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi)
        - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi)
      );

      const x = 0.9996 * N * (
        A + (1 - T + C) * A ** 3 / 6
        + (5 - 18 * T + T ** 2 + 72 * C - 58 * e1sq) * A ** 5 / 120
      ) + 500000;

      const y = 0.9996 * (
        M + N * Math.tan(phi) * (
          A ** 2 / 2
          + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
          + (61 - 58 * T + T ** 2 + 600 * C - 330 * e1sq) * A ** 6 / 720
        )
      ) + (lat < 0 ? 10000000 : 0);

      return {
        easting: x,
        northing: y,
        zone,
        hemisphere: lat < 0 ? 'S' : 'N',
      };
    },

    /**
     * Calcula o intervalo de grade adequado para o zoom atual
     */
    _getGridInterval(zoom) {
      if (zoom >= 15) return 500;
      if (zoom >= 13) return 1000;
      if (zoom >= 11) return 5000;
      if (zoom >= 9)  return 10000;
      if (zoom >= 7)  return 50000;
      return 100000;
    },

    /**
     * Inicializa o canvas de grade sobre o mapa
     */
    init(map) {
      this._map = map;

      this._canvas = document.createElement('canvas');
      this._canvas.id = 'utm-grid-canvas';
      this._canvas.style.cssText = `
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 5;
        width: 100%;
        height: 100%;
      `;
      this._ctx = this._canvas.getContext('2d');
      document.getElementById('map-container').appendChild(this._canvas);

      const resize = () => {
        const cont = document.getElementById('map-container');
        this._canvas.width  = cont.offsetWidth;
        this._canvas.height = cont.offsetHeight;
        this._draw();
      };

      map.on('render', () => { if (this._enabled) this._draw(); });
      map.on('resize', resize);
      window.addEventListener('resize', resize);
      resize();
    },

    setEnabled(val) {
      this._enabled = val;
      if (!val) this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      else this._draw();
    },

    _draw() {
      const map    = this._map;
      const canvas = this._canvas;
      const ctx    = this._ctx;
      const W      = canvas.width;
      const H      = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const zoom     = map.getZoom();
      const interval = this._getGridInterval(zoom);

      // Bounding box do viewport em lon/lat
      const bounds = map.getBounds();
      const minLon = bounds.getWest();
      const maxLon = bounds.getEast();
      const minLat = bounds.getSouth();
      const maxLat = bounds.getNorth();

      // UTM bounds
      const utmBL = this.latLonToUTM(minLat, minLon);
      const utmTR = this.latLonToUTM(maxLat, maxLon);

      const eMin = Math.floor(Math.min(utmBL.easting,  utmTR.easting)  / interval) * interval;
      const eMax = Math.ceil (Math.max(utmBL.easting,  utmTR.easting)  / interval) * interval;
      const nMin = Math.floor(Math.min(utmBL.northing, utmTR.northing) / interval) * interval;
      const nMax = Math.ceil (Math.max(utmBL.northing, utmTR.northing) / interval) * interval;

      // Fuso central para conversão inversa UTM→lat/lon
      const zone = utmBL.zone;
      const hemisphere = utmBL.hemisphere;

      const toScreen = (lat, lon) => {
        const pt = map.project([lon, lat]);
        return { x: pt.x, y: pt.y };
      };

      // Approx inverse UTM — suficiente para posicionar linhas no canvas
      const utmToLatLon = (easting, northing, z, hemi) => {
        const a = 6378137;
        const e2 = 0.00669437999014;
        const k0 = 0.9996;
        const e1sq = e2 / (1 - e2);

        const x = easting - 500000;
        const y = hemi === 'S' ? northing - 10000000 : northing;

        const M = y / k0;
        const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
        const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

        const phi1 = mu
          + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
          + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
          + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
          + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);

        const N1  = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
        const T1  = Math.tan(phi1) ** 2;
        const C1  = e1sq * Math.cos(phi1) ** 2;
        const R1  = a * (1 - e2) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
        const D   = x / (N1 * k0);

        const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (
          D ** 2 / 2
          - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * e1sq) * D ** 4 / 24
          + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * e1sq - 3 * C1 ** 2) * D ** 6 / 720
        );
        const lam0 = ((z - 1) * 6 - 180 + 3) * (Math.PI / 180);
        const lon = lam0 + (
          D
          - (1 + 2 * T1 + C1) * D ** 3 / 6
          + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * e1sq + 24 * T1 ** 2) * D ** 5 / 120
        ) / Math.cos(phi1);

        return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
      };

      ctx.save();
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.22)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.font        = '500 9px "Roboto Mono", monospace';
      ctx.fillStyle   = 'rgba(74, 222, 128, 0.7)';

      // Linhas verticais (Easting)
      for (let e = eMin; e <= eMax; e += interval) {
        let pts = [];
        const steps = 12;
        for (let s = 0; s <= steps; s++) {
          const n   = nMin + (nMax - nMin) * (s / steps);
          const ll  = utmToLatLon(e, n, zone, hemisphere);
          if (ll.lat < -90 || ll.lat > 90 || ll.lon < -180 || ll.lon > 180) continue;
          const sc  = toScreen(ll.lat, ll.lon);
          pts.push(sc);
        }
        if (pts.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        // Label
        const mid = pts[Math.floor(pts.length / 2)];
        if (mid && mid.x >= 0 && mid.x <= W) {
          const label = interval >= 1000
            ? `${(e / 1000).toFixed(0)}k E`
            : `${e.toFixed(0)} E`;
          ctx.fillText(label, Math.max(2, mid.x + 2), 12);
        }
      }

      // Linhas horizontais (Northing)
      for (let n = nMin; n <= nMax; n += interval) {
        let pts = [];
        const steps = 12;
        for (let s = 0; s <= steps; s++) {
          const e   = eMin + (eMax - eMin) * (s / steps);
          const ll  = utmToLatLon(e, n, zone, hemisphere);
          if (ll.lat < -90 || ll.lat > 90 || ll.lon < -180 || ll.lon > 180) continue;
          const sc  = toScreen(ll.lat, ll.lon);
          pts.push(sc);
        }
        if (pts.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        // Label
        const mid = pts[Math.floor(pts.length / 2)];
        if (mid && mid.y >= 0 && mid.y <= H) {
          const label = interval >= 1000
            ? `${(n / 1000).toFixed(0)}k N`
            : `${n.toFixed(0)} N`;
          ctx.fillText(label, 2, Math.max(12, mid.y - 2));
        }
      }

      ctx.restore();
    },
  };

  window.UTMGrid = UTMGrid;
})(window);
