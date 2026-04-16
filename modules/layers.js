/**
 * modules/layers.js
 * Gerenciador de camadas base e overlays WMS para BrasilCartaPro
 */

;(function (window) {
  'use strict';

  const GLYPHS_URL = 'https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=inglBezhia6tUQkDWOEd';

  const STYLES = {
    osm: {
      version: 8,
      glyphs: GLYPHS_URL,
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
      glyphs: GLYPHS_URL,
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
      glyphs: GLYPHS_URL,
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
      glyphs: GLYPHS_URL,
      sources: {
        dark: {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
      + '&SRS=EPSG:4326&TRANSPARENT=TRUE&FORMAT=image/png&BGCOLOR=0x000000'
      + '&LAYERS=ctm250&STYLES='
      + '&BBOX={bbox-epsg-4326}&WIDTH=256&HEIGHT=256',
    ],
    tileSize: 256,
    attribution: 'DSG/EB — Carta Topográfica Militar 1:250.000',
  };

  // IBGE Malha Municipal — workspace CGEO (público)
  const IBGE_WMS = {
    type: 'raster',
    tiles: [
      'https://geoservicos.ibge.gov.br/geoserver/CGEO/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap'
      + '&SRS=EPSG:4326&TRANSPARENT=TRUE&FORMAT=image/png&BGCOLOR=0x000000'
      + '&LAYERS=CGEO:BC250_Limite_Municipio_A&STYLES='
      + '&BBOX={bbox-epsg-4326}&WIDTH=256&HEIGHT=256',
    ],
    tileSize: 256,
    attribution: 'IBGE BC250',
  };

  // MapTiler Curvas de Nível (Vetor Global)
  const CONTOUR_VECTOR = {
    type: 'vector',
    url: 'https://api.maptiler.com/tiles/contours-v2/tiles.json?key=inglBezhia6tUQkDWOEd',
    attribution: '© <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a>'
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
      const indeActive    = this.isOverlayActive('inde-wms');
      const ibgeActive    = this.isOverlayActive('ibge');
      const contourActive = this.isOverlayActive('contour-wms');

      // Preserva opacidades atuais se os sliders estiverem definidos na UI
      const getOp = (id) => {
        const el = document.getElementById(id);
        return el ? parseInt(el.value) / 100 : 0.8;
      };
      
      this._lastOpacities = {
        inde: getOp('opacity-inde'),
        ibge: getOp('opacity-ibge'),
        contour: getOp('opacity-contour')
      };

      map.setStyle(style);
      this._currentBase = name;

      // Reaplica overlays após o style carregar
      map.once('style.load', () => {
        if (indeActive)    this._addInde();
        if (ibgeActive)    this._addIbge();
        if (contourActive) this._addContour();
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

    toggleContour(active) {
      if (active) {
        this._addContour();
      } else {
        this._removeLayer('contour-label');
        this._removeLayer('contour-wms');
      }
    },

    setOverlayOpacity(layerId, opacityValue) {
      if (this.isOverlayActive(layerId)) {
        const type = this._map.getLayer(layerId).type;
        if (type === 'raster') {
          this._map.setPaintProperty(layerId, 'raster-opacity', opacityValue);
        } else if (type === 'line') {
          this._map.setPaintProperty(layerId, 'line-opacity', opacityValue);
          
          // Ajusta a opacidade do label também se for o contour
          if (layerId === 'contour-wms' && this.isOverlayActive('contour-label')) {
            this._map.setPaintProperty('contour-label', 'text-opacity', opacityValue);
          }
        }
      }
    },

    _addInde() {
      const map = this._map;
      if (!map.getSource('inde-src')) map.addSource('inde-src', INDE_WMS);
      if (!map.getLayer('inde-wms')) {
        const op = this._lastOpacities?.inde ?? (document.getElementById('opacity-inde') ? parseInt(document.getElementById('opacity-inde').value)/100 : 0.7);
        map.addLayer({ id: 'inde-wms', type: 'raster', source: 'inde-src', paint: { 'raster-opacity': op } });
      }
    },

    _addIbge() {
      const map = this._map;
      if (!map.getSource('ibge-src')) map.addSource('ibge-src', IBGE_WMS);
      if (!map.getLayer('ibge')) {
        const op = this._lastOpacities?.ibge ?? (document.getElementById('opacity-ibge') ? parseInt(document.getElementById('opacity-ibge').value)/100 : 0.8);
        map.addLayer({ id: 'ibge', type: 'raster', source: 'ibge-src', paint: { 'raster-opacity': op } });
      }
    },

    _addContour() {
      const map = this._map;
      if (!map.getSource('contour-src')) map.addSource('contour-src', CONTOUR_VECTOR);
      
      const op = this._lastOpacities?.contour ?? (document.getElementById('opacity-contour') ? parseInt(document.getElementById('opacity-contour').value)/100 : 0.8);
      
      if (!map.getLayer('contour-wms')) { // Mantemos o ID por compatibilidade
        map.addLayer({ 
          id: 'contour-wms', 
          type: 'line', 
          source: 'contour-src', 
          'source-layer': 'contour',
          paint: { 
            'line-color': '#d97706', // Amber tático
            'line-width': ['match', ['get', 'nth_line'], 5, 1.4, 0.6], // Linhas mestras mais grossas
            'line-opacity': op 
          } 
        });
      }
      
      if (!map.getLayer('contour-label')) {
        map.addLayer({
          id: 'contour-label',
          type: 'symbol',
          source: 'contour-src',
          'source-layer': 'contour',
          filter: ['==', 'nth_line', 5], // Apenas linhas mestras
          layout: {
            'symbol-placement': 'line',
            'text-field': ['concat', ['to-string', ['get', 'elevation']], ' m'],
            'text-font': ['Roboto Medium'],
            'text-size': 11,
            'text-pitch-alignment': 'map',
            'text-rotation-alignment': 'map'
          },
          paint: {
            'text-color': '#d97706',
            'text-halo-color': 'rgba(255,255,255,0.7)',
            'text-halo-width': 1.2,
            'text-opacity': op
          }
        });
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
