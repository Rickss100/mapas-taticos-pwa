/**
 * modules/printframe.js — BrasilCartaPro
 * Moldura de impressão interativa: exibe um retângulo com as proporções exatas
 * do papel escolhido sobre o mapa. O usuário posiciona o mapa livremente por baixo
 * e captura a área enquadrada em alta resolução.
 */

;(function (window) {
  'use strict';

  // Dimensões em mm (landscape natural para A3/A4)
  const PAPER = {
    A4: { w: 297, h: 210 },
    A3: { w: 420, h: 297 },
  };

  const PrintFrame = {
    _map:     null,
    _active:  false,
    _el:      null,
    _opts:    {},
    _onMove:  null,
    _fw: 0,   // largura da moldura em CSS px
    _fh: 0,   // altura  da moldura em CSS px

    // ── Dimensões do papel (mm) ─────────────────────────────────
    _paper() {
      const p = PAPER[this._opts.size] || PAPER.A4;
      return this._opts.orientation === 'landscape'
        ? { w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) }
        : { w: Math.min(p.w, p.h), h: Math.max(p.w, p.h) };
    },

    // ── Calcula tamanho da moldura em pixels de tela ────────────
    _calcFramePx() {
      const paper = this._paper();
      const ratio = paper.w / paper.h;
      const TOPBAR = 56, ACTIONBAR = 88, PAD = 32;
      const avW = window.innerWidth  - PAD * 2;
      const avH = window.innerHeight - TOPBAR - ACTIONBAR - PAD * 2;

      let fw = avW, fh = fw / ratio;
      if (fh > avH) { fh = avH; fw = fh * ratio; }

      this._fw = Math.round(fw);
      this._fh = Math.round(fh);
      return { fw: this._fw, fh: this._fh, paper };
    },

    // ── Escala real atual para a moldura ────────────────────────
    _scale() {
      if (!this._map || !this._fw) return 0;
      const zoom = this._map.getZoom();
      const lat  = this._map.getCenter().lat;
      const mpp  = 156543.034 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
      const paper = this._paper();
      return Math.round((this._fw * mpp) / (paper.w / 1000));
    },

    // ── Applica zoom para corresponder à escala alvo ────────────
    zoomToScale(targetScale) {
      const paper = this._paper();
      const lat   = this._map.getCenter().lat;
      const mpp   = (paper.w / 1000) * targetScale / this._fw;
      const z     = Math.log2(156543.034 * Math.cos(lat * Math.PI / 180) / mpp);
      this._map.flyTo({ zoom: Math.max(3, Math.min(19, z)), duration: 700 });
    },

    // ── Exibe a moldura ─────────────────────────────────────────
    show(map, opts = {}) {
      this._map    = map;
      this._opts   = opts;
      this._active = true;
      this._calcFramePx();
      this._build();
      this._tick();
      this._onMove = () => this._tick();
      map.on('move', this._onMove);
      map.on('zoom', this._onMove);
    },

    // ── Remove a moldura ────────────────────────────────────────
    hide() {
      if (!this._active) return;
      this._active = false;
      if (this._el)   { this._el.remove(); this._el = null; }
      if (this._map  && this._onMove) {
        this._map.off('move', this._onMove);
        this._map.off('zoom', this._onMove);
      }
    },

    // ── Constrói o DOM da moldura ───────────────────────────────
    _build() {
      if (this._el) this._el.remove();
      const ts  = this._opts.targetScale || 25000;
      const sz  = this._opts.size || 'A4';
      const ori = this._opts.orientation === 'landscape' ? 'Paisagem' : 'Retrato';

      const el = document.createElement('div');
      el.id    = 'pf-overlay';
      el.innerHTML = `
        <div id="pf-frame" style="width:${this._fw}px;height:${this._fh}px">
          <div class="pf-c pf-tl"></div>
          <div class="pf-c pf-tr"></div>
          <div class="pf-c pf-bl"></div>
          <div class="pf-c pf-br"></div>
          <div class="pf-badge">${sz} · ${ori}</div>
          <div class="pf-ch-h"></div>
          <div class="pf-ch-v"></div>
        </div>

        <div id="pf-bar">
          <button id="pf-cancel"   class="pf-btn">✕</button>
          <div class="pf-scale-box">
            <span id="pf-scale-val">—</span>
            <span class="pf-scale-lbl">escala atual</span>
          </div>
          <button id="pf-zoom-btn" class="pf-btn pf-secondary">
            ⊙ 1:${ts.toLocaleString('pt-BR')}
          </button>
          <button id="pf-capture"  class="pf-btn pf-primary">📄 Capturar</button>
        </div>
      `;

      document.getElementById('map-container').appendChild(el);
      this._el = el;

      document.getElementById('pf-cancel').onclick   = () => this.hide();
      document.getElementById('pf-zoom-btn').onclick = () => this.zoomToScale(ts);
      document.getElementById('pf-capture').onclick  = () => {
        if (this._opts.onCapture) this._opts.onCapture();
      };
    },

    // ── Atualiza escala em tempo real ────────────────────────────
    _tick() {
      const el = document.getElementById('pf-scale-val');
      if (el) el.textContent = `1:${this._scale().toLocaleString('pt-BR')}`;
    },

    // ── Renderiza a área da moldura em canvas de impressão ───────
    async capture(printOpts = {}) {
      const paper = this._paper();
      const fw    = this._fw;
      const fh    = this._fh;
      const mc    = this._map.getCanvas();
      const gc    = document.getElementById('utm-grid-canvas');
      const DPR   = window.devicePixelRatio || 1;

      // Coordenadas de recorte no canvas do mapa (pixels físicos)
      const mcFX = Math.round((mc.width  - fw * DPR) / 2);
      const mcFY = Math.round((mc.height - fh * DPR) / 2);
      const mcFW = Math.round(fw * DPR);
      const mcFH = Math.round(fh * DPR);

      // Coordenadas de recorte na grade UTM (pixels CSS — não escalonada por DPR)
      const gcFX = gc ? (gc.width  - fw) / 2 : 0;
      const gcFY = gc ? (gc.height - fh) / 2 : 0;

      // Canvas de saída a 150 DPI
      const DPI = 150;
      const PPM = DPI / 25.4;           // pixels por mm
      const OW  = Math.round(paper.w * PPM);
      const OH  = Math.round(paper.h * PPM);
      const MAR = Math.round(6  * PPM); // margem 6 mm
      const HDR = Math.round(14 * PPM); // cabeçalho 14 mm
      const FTR = Math.round(10 * PPM); // rodapé 10 mm

      const off = document.createElement('canvas');
      off.width  = OW;
      off.height = OH;
      const ctx  = off.getContext('2d');

      // ─── Fundo ───────────────────────────────────────────────
      ctx.fillStyle = '#0d1520';
      ctx.fillRect(0, 0, OW, OH);

      // ─── Área de mapa no canvas de saída ─────────────────────
      const mX = MAR;
      const mY = MAR + HDR;
      const mW = OW - 2 * MAR;
      const mH = OH - 2 * MAR - HDR - FTR;

      // Imagem do mapa recortada
      if (mcFW > 0 && mcFH > 0) {
        ctx.drawImage(mc, mcFX, mcFY, mcFW, mcFH, mX, mY, mW, mH);
      }

      // Grade UTM recortada
      if (gc && printOpts.includeGrid !== false && fw > 0 && fh > 0) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(gc, gcFX, gcFY, fw, fh, mX, mY, mW, mH);
        ctx.restore();
      }

      // ─── Borda cartográfica ──────────────────────────────────
      ctx.strokeStyle = 'rgba(74,222,128,0.55)';
      ctx.lineWidth   = 2;
      ctx.strokeRect(MAR, MAR, OW - 2*MAR, OH - 2*MAR);

      // ─── Cabeçalho ───────────────────────────────────────────
      ctx.fillStyle = 'rgba(13,21,32,0.9)';
      ctx.fillRect(MAR, MAR, OW - 2*MAR, HDR);

      ctx.fillStyle = 'rgba(74,222,128,0.25)';
      ctx.fillRect(MAR, MAR + HDR - 1, OW - 2*MAR, 1);

      // Título
      ctx.fillStyle    = '#e2e8f0';
      ctx.font         = `bold ${Math.round(6*PPM)}px Inter,sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(printOpts.title || 'CARTA TÁTICA', OW / 2, MAR + HDR * 0.36);

      // Subtítulo
      if (printOpts.subtitle) {
        ctx.font      = `${Math.round(3.2*PPM)}px Inter,sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(printOpts.subtitle, OW / 2, MAR + HDR * 0.72);
      }

      // Classificação (esquerda)
      if (printOpts.classification) {
        ctx.font      = `bold ${Math.round(3*PPM)}px Inter,sans-serif`;
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'left';
        ctx.fillText(printOpts.classification, MAR + 6, MAR + HDR * 0.36);
      }

      // Data e Datum/escala (direita)
      const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      ctx.font      = `${Math.round(2.4*PPM)}px "Roboto Mono",monospace`;
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'right';
      ctx.fillText(now, OW - MAR - 6, MAR + HDR * 0.28);

      ctx.fillStyle = '#22c55e';
      ctx.fillText(
        `SIRGAS 2000 | UTM | 1:${this._scale().toLocaleString('pt-BR')}`,
        OW - MAR - 6,
        MAR + HDR * 0.65,
      );

      // ─── Rodapé ───────────────────────────────────────────────
      const fY = OH - MAR - FTR;
      ctx.fillStyle = 'rgba(13,21,32,0.9)';
      ctx.fillRect(MAR, fY, OW - 2*MAR, FTR);

      ctx.fillStyle = 'rgba(74,222,128,0.25)';
      ctx.fillRect(MAR, fY - 1, OW - 2*MAR, 1);

      ctx.font      = `bold ${Math.round(3*PPM)}px Inter,sans-serif`;
      ctx.fillStyle = '#4ade80';
      ctx.textAlign = 'left';
      ctx.fillText('BrasilCartaPro', MAR + 6, fY + FTR * 0.55);

      ctx.font      = `${Math.round(2.4*PPM)}px Inter,sans-serif`;
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'right';
      ctx.fillText('Fontes: OSM · INDE/DSG · IBGE', OW - MAR - 6, fY + FTR * 0.55);

      return off;
    },
  };

  window.PrintFrame = PrintFrame;
})(window);
