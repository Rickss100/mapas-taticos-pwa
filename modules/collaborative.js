/**
 * collaborative.js — BrasilCartaPro
 * Rastreamento Tático em Tempo Real: ícones de operador, marcadores compartilhados, trilhas.
 */

window.Collaborative = (function() {
  // ─────────────────────────────────────────────────────────
  // Firebase config
  // ─────────────────────────────────────────────────────────
  const firebaseConfig = {
    apiKey: "AIzaSyAv7ObFc6Fy55KB_xLMWenqrWFv85mnTUc",
    authDomain: "patrulha-tatica.firebaseapp.com",
    projectId: "patrulha-tatica",
    storageBucket: "patrulha-tatica.firebasestorage.app",
    messagingSenderId: "100511161805",
    appId: "1:100511161805:web:de3ce62389393359eab884"
  };

  // ─────────────────────────────────────────────────────────
  // Ícones de operador
  // ─────────────────────────────────────────────────────────
  const OPERATOR_ICONS = {
    police:  { emoji: '👮', color: '#3b82f6', label: 'Policial'  },
    vehicle: { emoji: '🚔', color: '#6366f1', label: 'Viatura'   },
    k9:      { emoji: '🐕', color: '#f97316', label: 'Cão K9'    },
    medic:   { emoji: '⛑️',  color: '#22c55e', label: 'Médico'    },
    command: { emoji: '⭐', color: '#fbbf24', label: 'Comando'   },
  };

  // ─────────────────────────────────────────────────────────
  // Estado
  // ─────────────────────────────────────────────────────────
  let db          = null;
  let currentRoom = null;
  let userName    = null;
  let myIcon      = 'police'; // ícone selecionado pelo próprio operador
  let gpsWatchId  = null;
  let myLastPos   = null;
  let isTracking  = false;
  let alliedMarkers = {}; // id -> MaplibreMarker
  let alliesData    = {}; // id -> { lat, lng, status, icon }

  // Elementos HTML (cacheados no carregamento)
  const btnCreateOp  = document.getElementById('btn-create-op');
  const qrContainer  = document.getElementById('op-qr-container');
  const qrDisplay    = document.getElementById('qrcode-display');
  const opLinkText   = document.getElementById('op-link-text');
  const modalJoin    = document.getElementById('modal-join-op');
  const inputName    = document.getElementById('operator-name-input');
  const btnJoin      = document.getElementById('btn-confirm-join');
  const btnToggleGPS = document.getElementById('btn-toggle-tracking');
  const gpsControls  = document.getElementById('tracking-controls');

  // ─────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────
  function init() {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    } catch(e) {
      console.error("Erro ao iniciar Firebase:", e);
    }
    bindEvents();
    checkInvite();
  }

  function bindEvents() {
    if (btnCreateOp)  btnCreateOp.addEventListener('click', createOperation);
    if (btnJoin)      btnJoin.addEventListener('click', joinOperation);
    if (btnToggleGPS) btnToggleGPS.addEventListener('click', toggleTracking);

    // Botão de marcar ponto flutuante
    const btnMark = document.getElementById('btn-mark-point');
    if (btnMark) {
      btnMark.addEventListener('click', () => {
        if (!currentRoom) {
          if (window.toast) toast('Entre em uma operação para marcar pontos', 'info', 3000);
          return;
        }
        if (window.SharedMarkers) window.SharedMarkers.enableAddMode();
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Criação e Entrada na Operação
  // ─────────────────────────────────────────────────────────
  function createOperation() {
    if (!db) return alert("Falha na rede: Sistema tático indisponível.");
    const randomHex = Math.random().toString(16).substr(2, 4).toUpperCase();
    currentRoom = "OP-TANGO-" + randomHex;
    const inviteUrl = window.location.origin + window.location.pathname + "?op=" + currentRoom;
    qrContainer.style.display = 'block';
    qrDisplay.innerHTML = '';
    const qrCanvas = document.createElement('canvas');
    new QRious({ element: qrCanvas, value: inviteUrl, size: 150 });
    qrDisplay.appendChild(qrCanvas);
    opLinkText.innerText = inviteUrl;
    if (window.toast) toast(`Operação ${currentRoom} criada!`, "success");
    modalJoin.style.display = 'flex';
  }

  function checkInvite() {
    const urlParams = new URLSearchParams(window.location.search);
    const op = urlParams.get('op');
    if (op) {
      currentRoom = op;
      modalJoin.style.display = 'flex';
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  function joinOperation() {
    const nome = inputName.value.trim();
    if (!nome) return alert("Por favor, informe seu identificador tático.");
    if (!db) return alert("Firebase não configurado!");

    // Lê ícone selecionado no modal
    const selectedIconBtn = document.querySelector('.icon-sel-btn.active');
    if (selectedIconBtn) myIcon = selectedIconBtn.dataset.icon;

    userName = nome;
    modalJoin.style.display = 'none';
    if (window.toast) toast(`Conectado como ${userName} ${OPERATOR_ICONS[myIcon].emoji}`, "success");

    if (gpsControls) gpsControls.style.display = 'block';
    const alliesPanel = document.getElementById('allies-panel');
    if (alliesPanel) alliesPanel.style.display = 'flex';

    // Botão de marcar ponto
    const btnMark = document.getElementById('btn-mark-point');
    if (btnMark) btnMark.style.display = 'flex';

    // Inicializa módulos auxiliares
    if (window.SharedMarkers && window.map) {
      window.SharedMarkers.init(window.map, db);
      window.SharedMarkers.setRoom(currentRoom, userName);
      window.SharedMarkers.startListening();
    }
    if (window.TrailManager && window.map) {
      window.TrailManager.init(window.map);
    }

    startTracking();
    listenAllies();
  }

  // ─────────────────────────────────────────────────────────
  // Rastreamento GPS
  // ─────────────────────────────────────────────────────────
  function startTracking() {
    if (!navigator.geolocation) return alert("GPS não suportado pelo navegador.");
    isTracking = true;
    updateTrackingUI();

    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
        myLastPos = { lat, lng };
        if (!isTracking) return;
        db.collection('operacoes').doc(currentRoom).collection('operadores').doc(userName)
          .set({
            lat, lng, acc,
            icon: myIcon,
            status: 'online',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          });
      },
      (err) => {
        console.error("Erro GPS:", err);
        if (window.toast) toast("Erro ao obter posição GPS", "error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function stopTracking() {
    if (gpsWatchId) {
      navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = null;
    }
    isTracking = false;
    updateTrackingUI();
    if (db && currentRoom && userName) {
      db.collection('operacoes').doc(currentRoom).collection('operadores').doc(userName)
        .update({ status: 'offline' }).catch(e => console.warn("Status offline:", e));
    }
    if (window.toast) toast("Rastreamento interrompido", "info");
  }

  function toggleTracking() {
    if (isTracking) stopTracking(); else startTracking();
  }

  function updateTrackingUI() {
    if (!btnToggleGPS) return;
    if (isTracking) {
      btnToggleGPS.innerHTML = '📡 Transmitindo Posição';
      btnToggleGPS.style.background = '#22c55e';
    } else {
      btnToggleGPS.innerHTML = '🚫 Oculto (GPS Pausado)';
      btnToggleGPS.style.background = '#ef4444';
    }
  }

  // ─────────────────────────────────────────────────────────
  // Snapshot de Operadores
  // ─────────────────────────────────────────────────────────
  function listenAllies() {
    db.collection('operacoes').doc(currentRoom).collection('operadores')
      .onSnapshot((snapshot) => {
        const activeIds = new Set();
        snapshot.forEach((doc) => {
          activeIds.add(doc.id);
          processAllyUpdate(doc.id, doc.data());
        });
        const allTracked = new Set([...Object.keys(alliedMarkers), ...Object.keys(alliesData)]);
        allTracked.forEach(id => { if (!activeIds.has(id)) removeAllyMarker(id); });
      }, (err) => {
        console.error('[Collaborative] onSnapshot error:', err);
        if (window.toast) toast('Erro de sincronização: ' + err.message, 'error', 5000);
      });
  }

  function processAllyUpdate(id, data) {
    // Atualiza posição local backup
    if (id === userName && data.lat !== undefined) {
      myLastPos = { lat: data.lat, lng: data.lng };
    }

    alliesData[id] = {
      lat:    data.lat,
      lng:    data.lng,
      status: data.status || 'online',
      icon:   data.icon   || 'police',
    };

    // Atualiza trilha se ativa (Opção A: acumulação local)
    if (id !== userName && data.lat !== undefined && window.TrailManager) {
      window.TrailManager.onPositionUpdate(id, data.lat, data.lng);
    }

    // Cria/move marcador no mapa
    if (id !== userName && data.lat !== undefined && data.lng !== undefined) {
      _updateMarker(id, data.lat, data.lng, data.status, data.icon);
    }

    renderAlliesList();
  }

  // ─────────────────────────────────────────────────────────
  // Marcadores de Aliados no Mapa
  // ─────────────────────────────────────────────────────────
  function _updateMarker(id, lat, lng, status, iconType) {
    if (!window.map) return;
    const isOffline = status === 'offline';
    const cfg = OPERATOR_ICONS[iconType] || OPERATOR_ICONS.police;

    if (!alliedMarkers[id]) {
      const el = document.createElement('div');
      el.className = 'ally-marker';
      el.dataset.operatorId = id;
      el.style.opacity = isOffline ? '0.4' : '1';
      el.innerHTML = `
        <div class="ally-marker-frame" style="--ak-color:${cfg.color}">
          <span class="ally-marker-icon">${cfg.emoji}</span>
        </div>
        <div class="ally-marker-label">${id}</div>
      `;
      alliedMarkers[id] = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(window.map);
    } else {
      alliedMarkers[id].setLngLat([lng, lat]);
      const markerEl  = alliedMarkers[id].getElement();
      const frameEl   = markerEl.querySelector('.ally-marker-frame');
      const iconEl    = markerEl.querySelector('.ally-marker-icon');
      const labelEl   = markerEl.querySelector('.ally-marker-label');
      markerEl.style.opacity = isOffline ? '0.4' : '1';
      if (frameEl) frameEl.style.setProperty('--ak-color', cfg.color);
      if (iconEl)  iconEl.textContent = cfg.emoji;
      if (labelEl) labelEl.textContent = id;
    }
  }

  function removeAllyMarker(id) {
    if (alliesData[id]) delete alliesData[id];
    if (alliedMarkers[id]) {
      alliedMarkers[id].remove();
      delete alliedMarkers[id];
    }
    if (window.TrailManager) window.TrailManager.stopTrail(id);
    renderAlliesList();
  }

  // ─────────────────────────────────────────────────────────
  // Painel de Aliados
  // ─────────────────────────────────────────────────────────
  function renderAlliesList() {
    const ul = document.getElementById('allies-list-ul');
    if (!ul) return;
    ul.innerHTML = '';

    // PRÓPRIO OPERADOR
    if (userName) {
      const cfg = OPERATOR_ICONS[myIcon] || OPERATOR_ICONS.police;
      const selfLi = document.createElement('li');
      selfLi.className = 'ally-item ally-self';
      selfLi.innerHTML = `
        <span class="ally-icon-badge" style="background:${cfg.color}">${cfg.emoji}</span>
        <span class="ally-name">${userName} <em class="ally-tag">(Eu)</em></span>
      `;
      selfLi.onclick = () => {
        if (myLastPos && window.map) window.map.flyTo({ center: [myLastPos.lng, myLastPos.lat], zoom: 16 });
        else if (window.toast) toast('GPS próprio ainda não disponível', 'info');
      };
      ul.appendChild(selfLi);
    }

    // OUTROS OPERADORES
    const others = Object.keys(alliesData).filter(id => id !== userName);

    if (others.length === 0) {
      const li = document.createElement('li');
      li.className = 'ally-item ally-empty';
      li.textContent = 'Aguardando outros operadores...';
      ul.appendChild(li);
    } else {
      others.forEach(id => {
        const li = document.createElement('li');
        li.className = 'ally-item';

        const fresh = alliesData[id]; // lido pelo nome, não capturado em closure!
        const isOffline = fresh.status === 'offline';
        const hasCoords = fresh.lat !== undefined && fresh.lng !== undefined;
        const cfg = OPERATOR_ICONS[fresh.icon] || OPERATOR_ICONS.police;
        const trailActive = window.TrailManager?.isActive(id) ?? false;

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'ally-remove-btn';
        removeBtn.title = 'Remover da lista';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          removeAllyMarker(id);
          if (db && currentRoom) {
            db.collection('operacoes').doc(currentRoom).collection('operadores')
              .doc(id).delete().catch(err => console.warn('remove err:', err));
          }
          if (window.toast) toast(`Operador ${id} removido`, 'info');
        };

        // Trail button
        const trailBtn = document.createElement('button');
        trailBtn.className = 'ally-trail-btn' + (trailActive ? ' active' : '');
        trailBtn.title = trailActive ? 'Parar trilha' : 'Gravar trilha';
        trailBtn.innerHTML = trailActive ? '⏹️' : '🗺️';
        trailBtn.onclick = (e) => {
          e.stopPropagation();
          if (window.TrailManager) {
            if (trailActive) {
              window.TrailManager.stopTrail(id);
            } else {
              window.TrailManager.promptAndStart(id);
            }
            renderAlliesList();
          }
        };

        // Conteúdo principal
        li.innerHTML = `
          <span class="ally-icon-badge" style="background:${cfg.color};opacity:${isOffline ? '0.5' : '1'}">${cfg.emoji}</span>
          <span class="ally-name">
            ${id}
            ${isOffline ? '<em class="ally-tag ally-offline">(offline)</em>' : ''}
            ${!hasCoords ? '<em class="ally-tag" style="color:#475569">(sem GPS)</em>' : ''}
          </span>
        `;
        li.appendChild(trailBtn);
        li.appendChild(removeBtn);

        // Clique no item: flyTo + azimute (lê dados frescos)
        li.onclick = (e) => {
          if (e.target.closest('.ally-remove-btn') || e.target.closest('.ally-trail-btn')) return;

          const f = alliesData[id]; // FRESH read
          if (!f || f.lat === undefined) {
            if (window.toast) toast(`${id} ainda não tem posição GPS`, 'info', 3000);
            return;
          }
          if (window.map) window.map.flyTo({ center: [f.lng, f.lat], zoom: 16, speed: 1.6 });
          if (myLastPos) {
            const dist = calcDistance(myLastPos.lat, myLastPos.lng, f.lat, f.lng);
            const az   = calcBearing(myLastPos.lat, myLastPos.lng, f.lat, f.lng);
            const dtx  = dist > 999 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m';
            if (window.toast) toast(`🚩 ${id} | ${dtx} | Az ${Math.round(az)}°`, 'info', 6000);
          } else {
            if (window.toast) toast('Ative seu GPS para calcular azimute', 'info', 3000);
          }
        };

        ul.appendChild(li);
      });
    }

    // Botão de sair
    const leaveLi = document.createElement('li');
    leaveLi.className = 'ally-item ally-leave';
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'ally-leave-btn';
    leaveBtn.textContent = '🚪 Sair da Operação';
    leaveBtn.onclick = leaveOperation;
    leaveLi.appendChild(leaveBtn);
    ul.appendChild(leaveLi);
  }

  // ─────────────────────────────────────────────────────────
  // Sair da Operação
  // ─────────────────────────────────────────────────────────
  function leaveOperation() {
    if (!currentRoom || !userName) return;
    stopTracking();

    db.collection('operacoes').doc(currentRoom).collection('operadores').doc(userName)
      .delete().catch(e => console.warn('Erro ao sair:', e));

    Object.keys(alliedMarkers).forEach(id => { try { alliedMarkers[id].remove(); } catch {} });
    alliedMarkers = {};
    alliesData    = {};

    if (window.SharedMarkers) window.SharedMarkers.stopListening();
    if (window.TrailManager)  window.TrailManager.clearAll();

    currentRoom = null;
    userName    = null;

    const alliesPanel = document.getElementById('allies-panel');
    if (alliesPanel) alliesPanel.style.display = 'none';
    if (gpsControls)  gpsControls.style.display = 'none';
    const btnMark = document.getElementById('btn-mark-point');
    if (btnMark) btnMark.style.display = 'none';

    if (window.toast) toast('Você saiu da operação', 'info');
  }

  // ─────────────────────────────────────────────────────────
  // Matemática Geoespacial
  // ─────────────────────────────────────────────────────────
  function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function calcBearing(lat1, lon1, lat2, lon2) {
    const p1 = lat1 * Math.PI/180, p2 = lat2 * Math.PI/180;
    const dl = (lon2 - lon1) * Math.PI/180;
    const y = Math.sin(dl)*Math.cos(p2);
    const x = Math.cos(p1)*Math.sin(p2) - Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function getUserName() { return userName; }

  window.addEventListener('DOMContentLoaded', init);
  return { init, getUserName };
})();
