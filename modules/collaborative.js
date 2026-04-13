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
    new QRious({
      element: document.createElement('canvas'),
      value: inviteUrl,
      size: 150,
    });
    // Injeta o canvas criado na div
    qrDisplay.appendChild(document.querySelector('canvas'));
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

    // Revela a tabela na UI
    const alliesPanel = document.getElementById('allies-panel');
    if (alliesPanel) alliesPanel.style.display = 'flex';

    startTracking();
    listenAllies();
  }

  // Transmite a própria localização
  function startTracking() {
    if (!navigator.geolocation) return alert("GPS não suportado pelo navegador.");

    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        myLastPos = { lat: latitude, lng: longitude };

        const myDoc = db.collection('operacoes').doc(currentRoom).collection('operadores').doc(userName);
        myDoc.set({
          lat: latitude,
          lng: longitude,
          acc: accuracy,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
      },
      (err) => console.error("Erro GPS:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  // Escuta a localização dos aliados
  function listenAllies() {
    db.collection('operacoes').doc(currentRoom).collection('operadores')
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const docId = change.doc.id;
          const data = change.doc.data();

          if (change.type === 'added' || change.type === 'modified') {
             updateAllyMarker(docId, data.lat, data.lng);
          }
          if (change.type === 'removed') {
             removeAllyMarker(docId);
          }
        });
      });
  }

  function updateAllyMarker(id, lat, lng) {
    if (!window.map) return; 

    if (id === userName) return;

    alliesData[id] = { lat, lng };
    renderAlliesList();

    if (!alliedMarkers[id]) {
      const el = document.createElement('div');
      el.className = 'ally-marker';
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.backgroundColor = '#3b82f6';
      el.style.border = '2px solid white';
      el.style.borderRadius = '50%';
      el.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.8)';
      
      const label = document.createElement('div');
      label.innerText = id;
      label.style.position = 'absolute';
      label.style.top = '18px';
      label.style.left = '50%';
      label.style.transform = 'translateX(-50%)';
      label.style.color = '#fff';
      label.style.fontSize = '10px';
      label.style.fontWeight = 'bold';
      label.style.textShadow = '1px 1px 2px #000';
      label.style.whiteSpace = 'nowrap';
      el.appendChild(label);

      alliedMarkers[id] = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(window.map);
    } else {
      alliedMarkers[id].setLngLat([lng, lat]);
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
    
    Object.keys(alliesData).forEach(id => {
      const data = alliesData[id];
      const li = document.createElement('li');
      li.className = 'ally-item';
      li.innerHTML = `<span class="ally-dot"></span><span>${id}</span>`;
      
      li.onclick = () => {
        if (window.map) window.map.flyTo({ center: [data.lng, data.lat], zoom: 16 });
        
        if (myLastPos) {
           const dist = calcDistance(myLastPos.lat, myLastPos.lng, data.lat, data.lng);
           const az   = calcBearing(myLastPos.lat, myLastPos.lng, data.lat, data.lng);
           const distTxt = dist > 999 ? (dist/1000).toFixed(1) + ' km' : Math.round(dist) + ' m';
           if (window.toast) toast(`${id}: Dist ${distTxt} · Azimute ${Math.round(az)}°`, 'info', 5000);
        } else {
           if (window.toast) toast(`Centralizando ${id} no satélite...`, 'info', 3000);
        }
      };
      
      ul.appendChild(li);
    });
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

  // Auto init
  window.addEventListener('DOMContentLoaded', init);

  return { init };
})();
