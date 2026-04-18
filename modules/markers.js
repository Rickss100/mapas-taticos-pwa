/**
 * modules/markers.js — BrasilCartaPro
 * Marcadores táticos compartilhados em tempo real (Firestore ↔ MapLibre)
 * v2: Painel Gerenciador lateral + Alertas de Proximidade (Feature 3.1 + 4.2)
 */

;(function(window) {
  'use strict';

  const MARKER_TYPES = {
    PONTO:    { color: '#3b82f6', emoji: '📍', label: 'Ponto' },
    ALERTA:   { color: '#f97316', emoji: '⚠️', label: 'Alerta' },
    OBJETIVO: { color: '#ef4444', emoji: '🎯', label: 'Objetivo' },
  };

  // Raio de alerta de proximidade em metros
  const PROXIMITY_RADIUS_M = 500;
  // Intervalo de checagem em ms
  const PROXIMITY_INTERVAL_MS = 30000;

  const SharedMarkers = {
    _db:               null,
    _map:              null,
    _room:             null,
    _user:             null,
    _unsub:            null,
    _markers:          {},   // markerId → { marker, data }
    _addMode:          false,
    _addClickHandler:  null,
    _addKeyHandler:    null,
    _proximityTimer:   null,
    _alertedIds:       new Set(), // IDs já alertados (reset a cada 5min)

    init(mapInstance, dbInstance) {
      this._map = mapInstance;
      this._db  = dbInstance;
    },

    setRoom(room, userName) {
      this._room = room;
      this._user = userName;
    },

    startListening() {
      if (!this._db || !this._room) return;
      this._unsub = this._db
        .collection('operacoes').doc(this._room).collection('mapMarkers')
        .onSnapshot(snapshot => {
          const activeIds = new Set();
          snapshot.forEach(doc => {
            activeIds.add(doc.id);
            this._upsertMarker(doc.id, doc.data());
          });
          Object.keys(this._markers).forEach(id => {
            if (!activeIds.has(id)) this._removeMarker(id);
          });
          this._renderManagerPanel();
        }, err => {
          console.error('[SharedMarkers] onSnapshot error:', err);
        });

      // Inicia loop de alertas de proximidade
      this._startProximityLoop();
    },

    stopListening() {
      if (this._unsub) { this._unsub(); this._unsub = null; }
      Object.keys(this._markers).forEach(id => this._removeMarker(id));
      this._markers = {};
      this._room    = null;
      this._user    = null;
      this._stopProximityLoop();
      this._clearManagerPanel();
    },

    // ── Add Mode ──────────────────────────────────────────────────────────
    enableAddMode() {
      if (!this._map) return;
      if (this._addMode) { this._cancelAddMode(); return; }

      this._addMode = true;
      this._map.getCanvas().style.cursor = 'crosshair';
      document.getElementById('btn-mark-point')?.classList.add('mark-active');
      if (window.toast) toast('Clique no mapa para marcar o ponto. Esc para cancelar.', 'info', 4000);

      const onClick = (e) => { this._finishAddMode(); this._showAddDialog(e.lngLat.lat, e.lngLat.lng); };
      const onKeyDown = (e) => { if (e.key === 'Escape') { this._cancelAddMode(); document.removeEventListener('keydown', onKeyDown); } };

      this._addClickHandler = onClick;
      this._addKeyHandler   = onKeyDown;
      document.addEventListener('keydown', onKeyDown);

      // Delay obrigatório: evita capturar o próprio clique no botão
      setTimeout(() => { if (this._addMode) this._map.on('click', onClick); }, 150);
    },

    _finishAddMode() {
      this._addMode = false;
      if (this._map && this._addClickHandler) this._map.off('click', this._addClickHandler);
      if (this._addKeyHandler) document.removeEventListener('keydown', this._addKeyHandler);
      this._addClickHandler = null;
      this._addKeyHandler   = null;
      if (this._map) this._map.getCanvas().style.cursor = '';
      document.getElementById('btn-mark-point')?.classList.remove('mark-active');
    },

    _cancelAddMode() {
      this._finishAddMode();
      if (window.toast) toast('Marcação cancelada', 'info', 2000);
    },

    // ── Add Dialog ────────────────────────────────────────────────────────
    _showAddDialog(lat, lng) {
      document.getElementById('marker-add-dialog')?.remove();

      const dialog = document.createElement('div');
      dialog.id = 'marker-add-dialog';
      dialog.className = 'tac-modal';

      const types = Object.entries(MARKER_TYPES);
      dialog.innerHTML = `
        <h3 class="tac-modal-title">📌 Novo Marcador Tático</h3>
        <div class="mtype-grid">
          ${types.map(([key, val]) => `
            <button class="mtype-btn ${key === 'PONTO' ? 'active' : ''}" data-type="${key}">
              <span class="mtype-emoji">${val.emoji}</span>
              <span class="mtype-label">${val.label}</span>
            </button>
          `).join('')}
        </div>
        <input id="marker-label-in" type="text" maxlength="50"
          placeholder="Descrição (opcional)" class="tac-input" autocomplete="off"/>
        <div class="tac-modal-actions">
          <button id="marker-cancel" class="tac-btn-cancel">Cancelar</button>
          <button id="marker-confirm" class="tac-btn-confirm">✔ Confirmar</button>
        </div>
      `;

      document.body.appendChild(dialog);
      setTimeout(() => dialog.querySelector('#marker-label-in').focus(), 80);

      let selectedType = 'PONTO';
      const typeBtns = dialog.querySelectorAll('.mtype-btn');
      typeBtns.forEach(btn => {
        btn.onclick = () => {
          typeBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          selectedType = btn.dataset.type;
        };
      });

      dialog.querySelector('#marker-cancel').onclick = () => dialog.remove();
      dialog.querySelector('#marker-confirm').onclick = () => {
        const label = dialog.querySelector('#marker-label-in').value.trim();
        this._saveMarker(lat, lng, selectedType, label);
        dialog.remove();
      };
    },

    // ── Save / Upsert / Remove ────────────────────────────────────────────
    _saveMarker(lat, lng, type, label) {
      if (!this._db || !this._room) return;
      this._db.collection('operacoes').doc(this._room).collection('mapMarkers')
        .add({
          lat, lng, type,
          label: label || '',
          createdBy: this._user || 'desconhecido',
          ts: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .then(() => { if (window.toast) toast('Marcador salvo para todos ✔', 'success', 2500); })
        .catch(e => { console.error('[SharedMarkers] save error:', e); });
    },

    _upsertMarker(id, data) {
      if (!this._map || data.lat === undefined) return;
      const cfg = MARKER_TYPES[data.type] || MARKER_TYPES.PONTO;

      if (this._markers[id]) {
        this._markers[id].marker.setLngLat([data.lng, data.lat]);
        this._markers[id].data = data;
        return;
      }

      const el = document.createElement('div');
      el.className = 'shared-marker';
      el.dataset.markerId = id;
      el.innerHTML = `
        <div class="sm-pin" style="--sm-color:${cfg.color}">
          <span class="sm-icon">${cfg.emoji}</span>
        </div>
        ${data.label ? `<div class="sm-label">${data.label}</div>` : ''}
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showPopup(id, data);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([data.lng, data.lat])
        .addTo(this._map);

      this._markers[id] = { marker, data };
    },

    _removeMarker(id) {
      if (this._markers[id]) {
        this._markers[id].marker.remove();
        delete this._markers[id];
      }
    },

    // ── Popup ─────────────────────────────────────────────────────────────
    _showPopup(id, data) {
      document.querySelectorAll('.sm-popup').forEach(p => p.remove());
      const cfg = MARKER_TYPES[data.type] || MARKER_TYPES.PONTO;

      const popup = document.createElement('div');
      popup.className = 'sm-popup';
      popup.innerHTML = `
        <div class="sm-popup-type" style="color:${cfg.color}">${cfg.emoji} ${cfg.label}</div>
        ${data.label ? `<div class="sm-popup-label">${data.label}</div>` : ''}
        <div class="sm-popup-meta">Por: ${data.createdBy || '—'}</div>
        <button class="sm-popup-focus">🗺️ Focar</button>
        <button class="sm-popup-del" data-del="${id}">🗑️ Excluir</button>
      `;

      popup.querySelector('.sm-popup-focus').onclick = () => {
        this._map.flyTo({ center: [data.lng, data.lat], zoom: Math.max(this._map.getZoom(), 16), speed: 1.8 });
        popup.remove();
      };
      popup.querySelector('[data-del]').onclick = () => {
        this.deleteMarker(id);
        popup.remove();
      };

      document.getElementById('map-container').appendChild(popup);

      const pt = this._map.project([data.lng, data.lat]);
      popup.style.left = (pt.x + 16) + 'px';
      popup.style.top  = (pt.y - 48) + 'px';

      const close = () => { popup.remove(); this._map.off('click', close); };
      setTimeout(() => this._map.on('click', close), 100);
    },

    // ── Delete ────────────────────────────────────────────────────────────
    deleteMarker(id) {
      if (!this._db || !this._room) return;
      this._db.collection('operacoes').doc(this._room).collection('mapMarkers')
        .doc(id).delete()
        .then(() => { if (window.toast) toast('Marcador removido', 'info'); })
        .catch(e => console.error('[SharedMarkers] delete error:', e));
    },

    // ── Painel Gerenciador (Sidebar) ──────────────────────────────────────
    _renderManagerPanel() {
      const section = document.getElementById('section-marker-manager');
      const list    = document.getElementById('marker-manager-list');
      if (!list) return;

      const ids = Object.keys(this._markers);
      if (ids.length === 0) {
        section && (section.style.display = 'none');
        list.innerHTML = '<li class="marker-mgr-empty">Nenhum marcador ativo</li>';
        return;
      }

      section && (section.style.display = 'block');
      list.innerHTML = '';

      ids.forEach(id => {
        const { data } = this._markers[id];
        const cfg = MARKER_TYPES[data.type] || MARKER_TYPES.PONTO;
        const li = document.createElement('li');
        li.className = 'marker-mgr-item';
        li.innerHTML = `
          <span class="mmgr-icon" style="color:${cfg.color}">${cfg.emoji}</span>
          <span class="mmgr-label">${data.label || cfg.label}</span>
          <span class="mmgr-by">${data.createdBy || ''}</span>
          <div class="mmgr-actions">
            <button class="mmgr-btn-focus" title="Focar no mapa">🗺️</button>
            <button class="mmgr-btn-del"   title="Excluir">🗑️</button>
          </div>
        `;
        li.querySelector('.mmgr-btn-focus').onclick = () => {
          this._map.flyTo({ center: [data.lng, data.lat], zoom: Math.max(this._map.getZoom(), 16), speed: 1.8 });
        };
        li.querySelector('.mmgr-btn-del').onclick = () => {
          this.deleteMarker(id);
        };
        list.appendChild(li);
      });
    },

    _clearManagerPanel() {
      const section = document.getElementById('section-marker-manager');
      if (section) section.style.display = 'none';
      const list = document.getElementById('marker-manager-list');
      if (list) list.innerHTML = '<li class="marker-mgr-empty">Nenhum marcador ativo</li>';
    },

    // ── Alertas de Proximidade (Feature 4.2) ──────────────────────────────
    _startProximityLoop() {
      this._stopProximityLoop();
      this._proximityTimer = setInterval(() => this._checkProximity(), PROXIMITY_INTERVAL_MS);
    },

    _stopProximityLoop() {
      if (this._proximityTimer) { clearInterval(this._proximityTimer); this._proximityTimer = null; }
    },

    _checkProximity() {
      const myPos = window._myGpsPos;
      if (!myPos) return;

      // Reset lista de alertados a cada ~5 minutos (10 ciclos de 30s)
      if (this._alertCycle === undefined) this._alertCycle = 0;
      this._alertCycle++;
      if (this._alertCycle >= 10) { this._alertedIds.clear(); this._alertCycle = 0; }

      Object.entries(this._markers).forEach(([id, { data }]) => {
        if (this._alertedIds.has(id)) return;
        // Só alerta para ALERTA e OBJETIVO
        if (!['ALERTA', 'OBJETIVO'].includes(data.type)) return;

        const dist = this._haversine(myPos.lat, myPos.lng, data.lat, data.lng);
        if (dist <= PROXIMITY_RADIUS_M) {
          this._alertedIds.add(id);
          const cfg  = MARKER_TYPES[data.type];
          const desc = data.label ? `"${data.label}"` : cfg.label;
          if (window.toast) toast(`${cfg.emoji} ALERTA: ${desc} a ${Math.round(dist)}m de você!`, 'error', 8000);
        }
      });
    },

    _haversine(lat1, lng1, lat2, lng2) {
      const R    = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a    = Math.sin(dLat/2)**2
                 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },
  };

  window.SharedMarkers = SharedMarkers;
})(window);
