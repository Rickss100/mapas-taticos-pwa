/**
 * collaborative.js
 * Módulo de Rastreamento Tático em Tempo Real (Patrulha)
 */

window.Collaborative = (function() {
  // ─────────────────────────────────────────────────────────
  // 1. INSIRA AQUI AS CREDENCIAIS REAIS DO SEU FIREBASE
  // ─────────────────────────────────────────────────────────
  const firebaseConfig = {
    apiKey: "AIzaSyAv7ObFc6Fy55KB_xLMWenqrWFv85mnTUc",
    authDomain: "patrulha-tatica.firebaseapp.com",
    projectId: "patrulha-tatica",
    storageBucket: "patrulha-tatica.firebasestorage.app",
    messagingSenderId: "100511161805",
    appId: "1:100511161805:web:de3ce62389393359eab884"
  };

  // Referências principais
  let db = null;
  let currentRoom = null;
  let userName = null;
  let gpsWatchId = null;
  let myLastPos = null;
  let isTracking = false;
  let alliedMarkers = {}; // Guarda as instâncias dos marcadores do MapLibre
  let alliesData = {};    // Guarda {lat, lng} para alimentar o painel lateral e calcular Azimute

  // Elementos HTML
  const btnCreateOp  = document.getElementById('btn-create-op');
  const qrContainer  = document.getElementById('op-qr-container');
  const qrDisplay    = document.getElementById('qrcode-display');
  const opLinkText   = document.getElementById('op-link-text');
  
  const modalJoin    = document.getElementById('modal-join-op');
  const inputName    = document.getElementById('operator-name-input');
  const btnJoin      = document.getElementById('btn-confirm-join');
  const btnToggleGPS = document.getElementById('btn-toggle-tracking');
  const gpsControls  = document.getElementById('tracking-controls');

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
    if (btnCreateOp) {
      btnCreateOp.addEventListener('click', createOperation);
    }
    if (btnJoin) {
      btnJoin.addEventListener('click', joinOperation);
    }
    if (btnToggleGPS) {
      btnToggleGPS.addEventListener('click', toggleTracking);
    }
  }

  // Gera uma sala aleatória e mostra o QR Code
  function createOperation() {
    if (!db) return alert("Falha na rede: Sistema tático indisponível. Recarregue a página (limpe os dados do app) e tente novamente com conexão 4G/Wi-Fi.");
    
    // Gerar ID de Operação: ex: OP-BRAVO-1A2B
    const randomHex = Math.random().toString(16).substr(2, 4).toUpperCase();
    currentRoom = "OP-TANGO-" + randomHex;
    
    const inviteUrl = window.location.origin + window.location.pathname + "?op=" + currentRoom;
    
    // Mostra a UI do QR Code
    qrContainer.style.display = 'block';
    qrDisplay.innerHTML = ''; // Limpa anterior
    
    // Gera o QR Code com a biblioteca Qrious
    const qrCanvas = document.createElement('canvas');
    new QRious({
      element: qrCanvas,
      value: inviteUrl,
      size: 150,
    });
    // Injeta o canvas criado na div
    qrDisplay.appendChild(qrCanvas);
    opLinkText.innerText = inviteUrl;

    if (window.toast) toast(`Operação ${currentRoom} criada!`, "success");

    // Já que ele criou, sugere ele entrar também
    modalJoin.style.display = 'flex';
  }

  // Verifica se o usuário abriu um link com "?op=..."
  function checkInvite() {
    const urlParams = new URLSearchParams(window.location.search);
    const op = urlParams.get('op');
    
    if (op) {
      currentRoom = op;
      modalJoin.style.display = 'flex';
      
      // Limpa URL pra não poluir
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // Quando o usuário clica em "Entrar na Patrulha"
  function joinOperation() {
    const nome = inputName.value.trim();
    if (!nome) return alert("Por favor, informe seu identificador tático.");
    if (!db) return alert("Firebase não configurado!");

    userName = nome;
    modalJoin.style.display = 'none';
    if (window.toast) toast(`Conectado como ${userName}`, "success");

    // Mostra controles de GPS e painel de aliados
    if (gpsControls) gpsControls.style.display = 'block';
    const alliesPanel = document.getElementById('allies-panel');
    if (alliesPanel) alliesPanel.style.display = 'flex';

    startTracking();
    listenAllies();
  }

  // Transmite a própria localização
  function startTracking() {
    if (!navigator.geolocation) return alert("GPS não suportado pelo navegador.");

    isTracking = true;
    updateTrackingUI();

    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        myLastPos = { lat: latitude, lng: longitude };

        if (!isTracking) return;

        const myDoc = db.collection('operacoes').doc(currentRoom).collection('operadores').doc(userName);
        myDoc.set({
          lat: latitude,
          lng: longitude,
          acc: accuracy,
          status: 'online',
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
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

    // Notifica outros que estou offline
    if (db && currentRoom && userName) {
      const myDoc = db.collection('operacoes').doc(currentRoom).collection('operadores').doc(userName);
      myDoc.update({ status: 'offline' }).catch(err => console.warn("Erro ao atualizar status offline:", err));
    }

    if (window.toast) toast("Rastreamento interrompido", "info");
  }

  function toggleTracking() {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
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

  // Escuta a localização dos aliados
  // Usa snapshot completo para que quem entra mais tarde veja todos os
  // operadores já presentes na sala, não apenas as mudanças futuras.
  function listenAllies() {
    db.collection('operacoes').doc(currentRoom).collection('operadores')
      .onSnapshot((snapshot) => {
        // Coleta IDs ativos neste snapshot
        const activeIds = new Set();

        snapshot.forEach((doc) => {
          const data = doc.data();
          activeIds.add(doc.id);
          if (data.lat !== undefined && data.lng !== undefined) {
            updateAllyMarker(doc.id, data.lat, data.lng, data.status);
          }
        });

        // Remove marcadores de quem saiu (não está mais no snapshot)
        Object.keys(alliedMarkers).forEach(id => {
          if (!activeIds.has(id)) removeAllyMarker(id);
        });
        Object.keys(alliesData).forEach(id => {
          if (!activeIds.has(id)) removeAllyMarker(id);
        });
      }, (err) => {
        console.error('[Collaborative] Erro no onSnapshot:', err);
        if (window.toast) toast('Erro de sincronização: ' + err.message, 'error', 5000);
      });
  }

  function updateAllyMarker(id, lat, lng, status) {
    if (!window.map) return;
    if (!id || lat === undefined || lng === undefined) return;

    // Sempre salva dados (inclusive o próprio operador para referência de posição)
    if (id === userName) {
      myLastPos = { lat, lng }; // Atualiza posição local via Firestore como backup
    }

    alliesData[id] = { lat, lng, status };
    renderAlliesList();

    // Marcadores no mapa apenas para outros (não si mesmo)
    if (id === userName) return;

    const isOffline = status === 'offline';

    if (!alliedMarkers[id]) {
      const el = document.createElement('div');
      el.className = 'ally-marker';
      el.style.opacity = isOffline ? '0.4' : '1';
      el.dataset.operatorId = id;

      const inner = document.createElement('div');
      inner.className = 'ally-marker-inner';
      if (isOffline) inner.style.backgroundColor = '#94a3b8';
      el.appendChild(inner);

      const label = document.createElement('div');
      label.className = 'ally-marker-label';
      label.innerText = isOffline ? `${id} (offline)` : id;
      el.appendChild(label);

      alliedMarkers[id] = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(window.map);
    } else {
      alliedMarkers[id].setLngLat([lng, lat]);
      // Atualiza visual offline/online
      const markerEl = alliedMarkers[id].getElement();
      const innerEl  = markerEl.querySelector('.ally-marker-inner');
      const labelEl  = markerEl.querySelector('.ally-marker-label');
      markerEl.style.opacity = isOffline ? '0.4' : '1';
      if (innerEl) innerEl.style.backgroundColor = isOffline ? '#94a3b8' : '';
      if (labelEl) labelEl.innerText = isOffline ? `${id} (offline)` : id;
    }
  }

  function removeAllyMarker(id) {
    if (alliesData[id]) delete alliesData[id];
    renderAlliesList();

    if (alliedMarkers[id]) {
      alliedMarkers[id].remove();
      delete alliedMarkers[id];
    }
  }

  function renderAlliesList() {
    const ul = document.getElementById('allies-list-ul');
    if (!ul) return;
    ul.innerHTML = '';

    // --- PRÓPRIO OPERADOR ---
    if (userName) {
      const selfLi = document.createElement('li');
      selfLi.className = 'ally-item';
      selfLi.style.borderLeft = '3px solid #4ade80';
      selfLi.innerHTML = `<span class="ally-dot" style="background:#4ade80;box-shadow:0 0 8px #4ade80"></span><span>${userName} <em style="color:#64748b;font-size:0.7rem">(Eu)</em></span>`;
      // Clique no próprio nome centraliza no mapa
      selfLi.onclick = () => {
        if (myLastPos && window.map) {
          window.map.flyTo({ center: [myLastPos.lng, myLastPos.lat], zoom: 16 });
        } else {
          if (window.toast) toast('GPS próprio ainda não disponível', 'info');
        }
      };
      ul.appendChild(selfLi);
    }

    // --- DEMAIS OPERADORES ---
    const others = Object.keys(alliesData).filter(id => id !== userName);

    if (others.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'ally-item';
      emptyLi.style.color = '#475569';
      emptyLi.style.fontSize = '0.72rem';
      emptyLi.style.justifyContent = 'center';
      emptyLi.style.pointerEvents = 'none';
      emptyLi.textContent = 'Aguardando outros operadores...';
      ul.appendChild(emptyLi);
      return;
    }

    others.forEach(id => {
      const data = alliesData[id];
      const isOffline = data.status === 'offline';

      const li = document.createElement('li');
      li.className = 'ally-item';
      if (isOffline) li.style.opacity = '0.55';

      // Botão de remover (X)
      const removeBtn = document.createElement('button');
      removeBtn.title = 'Remover da lista';
      removeBtn.style.cssText = 'background:none;border:none;color:#f87171;cursor:pointer;font-size:0.85rem;padding:0 4px;margin-left:auto;flex-shrink:0';
      removeBtn.innerHTML = '&times;';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeAllyMarker(id);
        // Apaga do Firestore também (só criador da operação deveria, mas permitimos aqui por praticidade)
        if (db && currentRoom) {
          db.collection('operacoes').doc(currentRoom).collection('operadores').doc(id)
            .delete().catch(e => console.warn('Erro ao remover operador:', e));
        }
        if (window.toast) toast(`Operador ${id} removido`, 'info');
      };

      li.innerHTML = `<span class="ally-dot" style="${isOffline ? 'background:#64748b;box-shadow:none' : ''}"></span><span>${id}${isOffline ? ' <em style="color:#64748b;font-size:0.68rem">(offline)</em>' : ''}</span>`;
      li.appendChild(removeBtn);

      li.onclick = (e) => {
        if (e.target === removeBtn) return; // Não dispara clique ao remover
        if (window.map) window.map.flyTo({ center: [data.lng, data.lat], zoom: 16 });

        if (myLastPos) {
          const dist    = calcDistance(myLastPos.lat, myLastPos.lng, data.lat, data.lng);
          const az      = calcBearing(myLastPos.lat, myLastPos.lng, data.lat, data.lng);
          const distTxt = dist > 999 ? (dist/1000).toFixed(1) + ' km' : Math.round(dist) + ' m';
          if (window.toast) toast(`🚩 ${id} | Dist: ${distTxt} | Az: ${Math.round(az)}°`, 'info', 6000);
        } else {
          if (window.toast) toast('Ative seu GPS para calcular distância e azimute', 'info', 4000);
        }
      };

      ul.appendChild(li);
    });

    // Botão de sair da operação
    const leaveLi = document.createElement('li');
    leaveLi.className = 'ally-item';
    leaveLi.style.cssText = 'justify-content:center;border-top:1px solid rgba(74,222,128,0.15);margin-top:4px;padding-top:6px;';
    const leaveBtn = document.createElement('button');
    leaveBtn.textContent = '🚪 Sair da Operação';
    leaveBtn.style.cssText = 'background:none;border:1px solid #f87171;color:#f87171;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:0.75rem;width:100%;';
    leaveBtn.onclick = leaveOperation;
    leaveLi.appendChild(leaveBtn);
    ul.appendChild(leaveLi);
  }

  function leaveOperation() {
    if (!currentRoom || !userName) return;

    stopTracking();

    // Deleta o próprio documento do Firestore
    db.collection('operacoes').doc(currentRoom).collection('operadores').doc(userName)
      .delete().catch(e => console.warn('Erro ao sair:', e));

    // Limpa todos os marcadores e dados
    Object.keys(alliedMarkers).forEach(id => {
      try { alliedMarkers[id].remove(); } catch {}
    });
    alliedMarkers = {};
    alliesData    = {};
    currentRoom   = null;
    userName      = null;

    // Oculta painel de aliados e controles de GPS
    const alliesPanel = document.getElementById('allies-panel');
    if (alliesPanel) alliesPanel.style.display = 'none';
    if (gpsControls)  gpsControls.style.display  = 'none';
    if (window.toast) toast('Você saiu da operação', 'info');
  }

  // Matemática Geoespacial (Haversine e Radianos Esféricos)
  function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Raios da terra em metros
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2)*Math.sin(dp/2) + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)*Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function calcBearing(lat1, lon1, lat2, lon2) {
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1)*Math.sin(p2) - Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
    const rad = Math.atan2(y, x);
    return (rad * 180 / Math.PI + 360) % 360; // 0-360
  }

  function getUserName() {
    return userName;
  }

  // Auto init
  window.addEventListener('DOMContentLoaded', init);

  return { init, getUserName };
})();
