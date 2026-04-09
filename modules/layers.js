/**
 * modules/layers.js
 * Gerenciador de camadas base e overlays WMS para BrasilCartaPro
 */

;(function (window) {
  'use strict';

  const STYLES = {
    osm: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxzoom: 19,
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },

    topo: {
      version: 8,
      sources: {
        topo: {
          type: 'raster',
          tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
          maxzoom: 17,
        },
      },
      layers: [{ id: 'topo', type: 'raster', source: 'topo' }],
    },

    satellite: {
      version: 8,
      sources: {
        satellite: {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: '© <a href="https://www.esri.com/">Esri</a> World Imagery',
          maxzoom: 19,
        },
      },
      layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
    },

    dark: {
      version: 8,
      sources: {
        dark: {
          type: 'raster',
          tiles: [
            'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
          ],
          tileSize: 256,
          attribution: '© <a href="https://stadiamaps.com/">Stadia Maps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxzoom: 20,
        },
      },
      layers: [{ id: 'dark', type: 'raster', source: 'dark' }],
    },
  };

  // WMS overlay — INDE/DSG carta topográfica 1:250.000
  const INDE_WMS = {
    type: 'raster',
    tiles: [
      'https://www.geoportal.eb.mil.br/teogc/terraogcwms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1'
      + '&SRS=EPSG:4326&TRANSPARENT=TRUE&FORMAT=image/png'
      + '&LAYERS=ctm250&STYLES=&'
      + 'BBOX={bbox-epsg-4326}&WIDTH=256&HEIGHT=256',
    ],
    tileSize: 256,
    attribution: 'DSG/EB — Carta Topográfica Militar 1:250.000',
  };

  // IBGE Malha Municipal
  const IBGE_WMS = {
    type: 'raster',
    tiles: [
      'https://geoservicos.ibge.gov.br/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap'
      + '&SRS=EPSG:4326&TRANSPARENT=TRUE&FORMAT=image/png'
      + '&LAYERS=CCAR:BC250_Limite_Municipio_A&STYLES=&'
      + 'BBOX={bbox-epsg-4326}&WIDTH=256&HEIGHT=256',
    ],
    tileSize: 256,
    attribution: 'IBGE BC250',
  };

  const LayerManager = {
    _map: null,
    _currentBase: 'osm',

    init(map) {
      this._map = map;
    },

    /**
     * Troca a camada base; mantém overlays ativos
     */
    setBase(name) {
      const map   = this._map;
      const style = STYLES[name] || STYLES.osm;

      // Preserva overlays
      const indeActive = this.isOverlayActive('inde-wms');
      const ibgeActive = this.isOverlayActive('ibge');

      map.setStyle(style);
      this._currentBase = name;

      // Reaplica overlays após o style carregar
      map.once('style.load', () => {
        if (indeActive) this._addInde();
        if (ibgeActive) this._addIbge();
        window.UTMGrid && window.UTMGrid._draw();
      });
    },

    isOverlayActive(id) {
      try { return !!this._map.getLayer(id); } catch { return false; }
    },

    toggleInde(active) {
      if (active) this._addInde();
      else        this._removeLayer('inde-wms');
    },

    toggleIbge(active) {
      if (active) this._addIbge();
      else        this._removeLayer('ibge');
    },

    _addInde() {
      const map = this._map;
      if (!map.getSource('inde-src')) {
        map.addSource('inde-src', INDE_WMS);
      }
      if (!map.getLayer('inde-wms')) {
        map.addLayer({ id: 'inde-wms', type: 'raster', source: 'inde-src', paint: { 'raster-opacity': 0.7 } });
      }
    },

    _addIbge() {
      const map = this._map;
      if (!map.getSource('ibge-src')) {
        map.addSource('ibge-src', IBGE_WMS);
      }
      if (!map.getLayer('ibge')) {
        map.addLayer({ id: 'ibge', type: 'raster', source: 'ibge-src', paint: { 'raster-opacity': 0.8 } });
      }
    },

    _removeLayer(id) {
      const map = this._map;
      try { if (map.getLayer(id)) map.removeLayer(id); } catch {}
    },

    getStyles() { return Object.keys(STYLES); },
  };

  window.LayerManager = LayerManager;
})(window);
