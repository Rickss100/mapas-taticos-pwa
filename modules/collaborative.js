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
  let alliedMarkers = {}; // Guarda as instâncias dos marcadores dos aliados

  // Elementos HTML
  const btnCreateOp  = document.getElementById('btn-create-op');
  const qrContainer  = document.getElementById('op-qr-container');
  const qrDisplay    = document.getElementById('qrcode-display');
  const opLinkText   = document.getElementById('op-link-text');
  
  const modalJoin    = document.getElementById('modal-join-op');
  const inputName    = document.getElementById('operator-name-input');
  const btnJoin      = document.getElementById('btn-confirm-join');

  function init() {
    // Tenta inicializar apenas se a chave não for a dummy
    if (firebaseConfig.apiKey !== "Sua_Chave_API" && firebaseConfig.apiKey !== "Alza...") {
      try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
      } catch(e) {
        console.error("Erro ao iniciar Firebase:", e);
      }
    } else {
      console.warn("Credenciais do Firebase não configuradas no collaborative.js");
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
    if (!db) return alert("Firebase não configurado! Substitua a chave no código.");
    
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

    startTracking();
    listenAllies();
  }

  // Transmite a própria localização
  function startTracking() {
    if (!navigator.geolocation) return alert("GPS não suportado pelo navegador.");

    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
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
    if (!window.map) return; // Se o maplibre ainda n carregou

    // Se for o próprio usuário, não precisa desenhar marcador de aliado
    if (id === userName) return;

    if (!alliedMarkers[id]) {
      // Cria elemento HTML customizado pro marcador tático
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
      // Apenas atualiza
      alliedMarkers[id].setLngLat([lng, lat]);
    }
  }

  function removeAllyMarker(id) {
    if (alliedMarkers[id]) {
      alliedMarkers[id].remove();
      delete alliedMarkers[id];
    }
  }

  // Auto init
  window.addEventListener('DOMContentLoaded', init);

  return { init };
})();
