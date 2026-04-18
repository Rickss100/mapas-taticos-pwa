/**
 * modules/markers.js — BrasilCartaPro
 * Marcadores táticos compartilhados em tempo real (Firestore ↔ MapLibre)
 */

;(function(window) {
  'use strict';

  const MARKER_TYPES = {
    PONTO:    { color: '#3b82f6', emoji: '📍', label: 'Ponto' },
    ALERTA:   { color: '#f97316', emoji: '⚠️', label: 'Alerta' },
    OBJETIVO: { color: '#ef4444', emoji: '🎯', label: 'Objetivo' },
  };

  const SharedMarkers = {
    _db:       null,
    _map:      null,
    _room:     null,
    _user:     null,
    _unsub:    null,
    _markers:  {}, // markerId -> { marker: MaplibreMarker }
    _addMode:  false,

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
        }, err => {
          console.error('[SharedMarkers] onSnapshot error:', err);
        });
    },

    stopListening() {
      if (this._unsub) { this._unsub(); this._unsub = null; }
      Object.keys(this._markers).forEach(id => this._removeMarker(id));
      this._markers = {};
      this._room = null;
      this._user = null;
    },

    // Entra em modo de adicionar. Clique novamente no botao ou Esc para cancelar.
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

      // Delay obrigatorio: o clique no botao ainda esta propagando; sem delay capturaria o proprio clique
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
      if (window.toast) toast('Marcacao cancelada', 'info', 2000);
    },

    _showAddDialog(lat, lng) {
      // Remove diálogo anterior se existir
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

      // Foco no input
      setTimeout(() => dialog.querySelector('#marker-label-in').focus(), 80);

      // Seleção de tipo
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

      this._markers[id] = { marker };
    },

    _showPopup(id, data) {
      document.querySelectorAll('.sm-popup').forEach(p => p.remove());
      const cfg = MARKER_TYPES[data.type] || MARKER_TYPES.PONTO;

      const popup = document.createElement('div');
      popup.className = 'sm-popup';
      popup.innerHTML = `
        <div class="sm-popup-type" style="color:${cfg.color}">${cfg.emoji} ${cfg.label}</div>
        ${data.label ? `<div class="sm-popup-label">${data.label}</div>` : ''}
        <div class="sm-popup-meta">Por: ${data.createdBy || '—'}</div>
        <button class="sm-popup-del" data-del="${id}">🗑️ Excluir</button>
      `;

      popup.querySelector('[data-del]').onclick = () => {
        this.deleteMarker(id);
        popup.remove();
      };

      document.getElementById('map-container').appendChild(popup);

      // Posiciona perto do marcador
      const pt = this._map.project([data.lng, data.lat]);
      popup.style.left = (pt.x + 16) + 'px';
      popup.style.top  = (pt.y - 48) + 'px';

      // Fecha ao clicar no mapa
      const close = () => { popup.remove(); this._map.off('click', close); };
      setTimeout(() => this._map.on('click', close), 100);
    },

    _removeMarker(id) {
      if (this._markers[id]) {
        this._markers[id].marker.remove();
        delete this._markers[id];
      }
    },

    deleteMarker(id) {
      if (!this._db || !this._room) return;
      this._db.collection('operacoes').doc(this._room).collection('mapMarkers')
        .doc(id).delete()
        .then(() => { if (window.toast) toast('Marcador removido', 'info'); })
        .catch(e => console.error('[SharedMarkers] delete error:', e));
    },
  };

  window.SharedMarkers = SharedMarkers;
})(window);
