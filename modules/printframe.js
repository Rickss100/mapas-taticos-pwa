/**
 * modules/printframe.js — BrasilCartaPro
 * Moldura de impressão interativa com rodapé cartográfico completo:
 * • Barra de escala gráfica (estilo DSG/IBGE)
 * • Diagrama de declinação magnética (Nv · Ng · Nm)
 * • Tabela técnica (coordenadas, datum, fuso, escala, data)
 */

;(function (window) {
  'use strict';

  // Dimensões em mm
  const PAPER = {
    A4: { w: 297, h: 210 },
    A3: { w: 420, h: 297 },
  };

  // ── Converte decimal → GMS ─────────────────────────────────
  function toDMS(decimal, isLat) {
    const abs = Math.abs(decimal);
    const deg = Math.floor(abs);
    const mf  = (abs - deg) * 60;
    const min = Math.floor(mf);
    const sec = Math.round((mf - min) * 60);
    const dir = isLat
      ? (decimal >= 0 ? 'N' : 'S')
      : (decimal >= 0 ? 'L' : 'O');
    return `${deg}° ${String(min).padStart(2,'0')}' ${String(sec).padStart(2,'0')}" ${dir}`;
  }

  const PrintFrame = {
    _map:    null,
    _active: false,
    _el:     null,
    _opts:   {},
    _onMove: null,
    _fw: 0,
    _fh: 0,

    // ── Dimensões do papel (mm) ────────────────────────────────
    _paper() {
      const p = PAPER[this._opts.size] || PAPER.A4;
      return this._opts.orientation === 'landscape'
        ? { w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) }
        : { w: Math.min(p.w, p.h), h: Math.max(p.w, p.h) };
    },

    // ── Tamanho da moldura em pixels de tela ───────────────────
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

    // ── Escala real para a moldura ─────────────────────────────
    _scale() {
      if (!this._map || !this._fw) return 0;
      const zoom  = this._map.getZoom();
      const lat   = this._map.getCenter().lat;
      const mpp   = 156543.034 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
      const paper = this._paper();
      return Math.round((this._fw * mpp) / (paper.w / 1000));
    },

    // ── Zoom para escala alvo ──────────────────────────────────
    zoomToScale(targetScale) {
      const paper = this._paper();
      const lat   = this._map.getCenter().lat;
      const mpp   = (paper.w / 1000) * targetScale / this._fw;
      const z     = Math.log2(156543.034 * Math.cos(lat * Math.PI / 180) / mpp);
      this._map.flyTo({ zoom: Math.max(3, Math.min(19, z)), duration: 700 });
    },

    // ── Exibe a moldura ────────────────────────────────────────
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

    // ── Remove a moldura ───────────────────────────────────────
    hide() {
      if (!this._active) return;
      this._active = false;
      if (this._el)  { this._el.remove(); this._el = null; }
      if (this._map && this._onMove) {
        this._map.off('move', this._onMove);
        this._map.off('zoom', this._onMove);
      }
    },

    // ── Constrói o DOM da moldura ──────────────────────────────
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
          <button id="pf-cancel"   class="pf-btn">✕ Cancelar</button>
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

    _tick() {
      const el = document.getElementById('pf-scale-val');
      if (el) el.textContent = `1:${this._scale().toLocaleString('pt-BR')}`;
    },

    // ────────────────────────────────────────────────────────────
    // CAPTURA
    // ────────────────────────────────────────────────────────────
    async capture(printOpts = {}) {
      const paper = this._paper();
      const fw    = this._fw;
      const fh    = this._fh;
      const gc    = document.getElementById('utm-grid-canvas');
      
      // Resolução de saída do Documento PDF: 250 DPI garante altíssima qualidade A3 sem explodir a RAM do celular
      const DPI = 250;
      const PPM = DPI / 25.4;            // pixels por mm
      const OW  = Math.round(paper.w * PPM);
      const OH  = Math.round(paper.h * PPM);
      const MAR = Math.round(6  * PPM);  // margem 6 mm
      const HDR = Math.round(14 * PPM);  // cabeçalho 14 mm
      const FTR = Math.round(48 * PPM);  // rodapé cartográfico 48 mm

      const mX = MAR;
      const mY = MAR + HDR;
      const mW = OW - 2 * MAR;
      const mH = OH - 2 * MAR - HDR - FTR;

      // ─── HIGH-RES HACK: Forçar MapLibre a renderizar em alta densidade ───
      const originalDPR = window.devicePixelRatio || 1;
      const targetDPR = Math.min(Math.max(Math.ceil(mW / fw), originalDPR), 4.5); // Limita a ~4.5x para evitar crash de WebGL

      let restored = false;
      if (targetDPR > originalDPR) {
        if (window.toast) toast('Processando mapa em Alta Resolução (DPI)... Aguarde um instante.', 'info', 4000);
        try {
          Object.defineProperty(window, 'devicePixelRatio', { get: () => targetDPR, configurable: true });
          this._map.resize();
          
          await new Promise(resolve => {
            let to = setTimeout(resolve, 8000); // max 8 seg esperando tiles carregarem
            this._map.once('idle', () => { clearTimeout(to); resolve(); });
          });
          restored = true;
        } catch(e) {
          console.warn('Fallback DPR override failed:', e);
        }
      }

      // Agora o canvas do MapLibre está gigante e "crisp"
      const mc = this._map.getCanvas();
      const currentDPR = restored ? targetDPR : originalDPR;

      // Coordenadas de recorte — mapa (pixels físicos trubinados)
      const mcFX = Math.round((mc.width  - fw * currentDPR) / 2);
      const mcFY = Math.round((mc.height - fh * currentDPR) / 2);
      const mcFW = Math.round(fw * currentDPR);
      const mcFH = Math.round(fh * currentDPR);

      // Coordenadas de recorte — grade UTM (pixels CSS, nós não mudamos a grade, apenas aplicaremos redimensionamento suave na imagem)
      const gcFX = gc ? (gc.width  - fw) / 2 : 0;
      const gcFY = gc ? (gc.height - fh) / 2 : 0;

      const off = document.createElement('canvas');
      off.width  = OW;
      off.height = OH;
      const ctx  = off.getContext('2d');

      // ─── Fundo ──────────────────────────────────────────────────
      ctx.fillStyle = '#0d1520';
      ctx.fillRect(0, 0, OW, OH);

      // ─── Área de mapa ────────────────────────────────────────────
      if (mcFW > 0 && mcFH > 0) {
        ctx.drawImage(mc, mcFX, mcFY, mcFW, mcFH, mX, mY, mW, mH);
      }

      // ─── Grade UTM recortada ─────────────────────────────────────
      if (gc && printOpts.includeGrid !== false && fw > 0 && fh > 0) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        // O drawImage faz upscale com blur das linhas SVG que é ok para 1px stroke
        ctx.drawImage(gc, gcFX, gcFY, fw, fh, mX, mY, mW, mH);
        ctx.restore();
      }

      // ─── Restaurar DPR para evitar mapa gigante na tela ─────────
      if (restored) {
        try {
          Object.defineProperty(window, 'devicePixelRatio', { get: () => originalDPR, configurable: true });
          this._map.resize();
        } catch(e) {}
      }

      // ─── Borda cartográfica ──────────────────────────────────────
      ctx.strokeStyle = 'rgba(74,222,128,0.55)';
      ctx.lineWidth   = 2.5;
      ctx.strokeRect(MAR, MAR, OW - 2*MAR, OH - 2*MAR);

      // ─── Cabeçalho ───────────────────────────────────────────────
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

      if (printOpts.subtitle) {
        ctx.font      = `${Math.round(3.2*PPM)}px Inter,sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(printOpts.subtitle, OW / 2, MAR + HDR * 0.72);
      }

      if (printOpts.classification) {
        ctx.font      = `bold ${Math.round(3*PPM)}px Inter,sans-serif`;
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'left';
        ctx.fillText(printOpts.classification, MAR + 6, MAR + HDR * 0.36);
      }

      const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      ctx.font      = `${Math.round(2.4*PPM)}px "Roboto Mono",monospace`;
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'right';
      ctx.fillText(now, OW - MAR - 6, MAR + HDR * 0.28);

      ctx.fillStyle = '#22c55e';
      ctx.fillText(
        `SIRGAS 2000 | UTM | 1:${this._scale().toLocaleString('pt-BR')}`,
        OW - MAR - 6,
        MAR + HDR * 0.67,
      );

      // ─── Rodapé cartográfico ─────────────────────────────────────
      const fY = OH - MAR - FTR;
      this._drawRichFooter(ctx, MAR, fY, OW - 2*MAR, FTR, PPM, printOpts);

      return off;
    },

    // ════════════════════════════════════════════════════════════
    // RODAPÉ CARTOGRÁFICO — 3 colunas
    // ════════════════════════════════════════════════════════════
    _drawRichFooter(ctx, x, y, w, h, PPM, opts) {
      const scale  = this._scale();
      const center = this._map.getCenter();

      // Fundo
      ctx.fillStyle = '#08111e';
      ctx.fillRect(x, y, w, h);

      // Linha separadora superior
      ctx.fillStyle = 'rgba(74,222,128,0.45)';
      ctx.fillRect(x, y, w, 1);

      // Larguras das colunas
      const col1W = Math.round(w * 0.37); // Barra de escala
      const col2W = Math.round(w * 0.30); // Diagrama de declinação
      const col3W = w - col1W - col2W;    // Tabela técnica

      const col1X = x;
      const col2X = x + col1W;
      const col3X = x + col1W + col2W;

      // Divisores verticais
      ctx.fillStyle = 'rgba(74,222,128,0.18)';
      const pad = Math.round(2 * PPM);
      ctx.fillRect(col2X, y + pad, 1, h - 2*pad);
      ctx.fillRect(col3X, y + pad, 1, h - 2*pad);

      // Desenha cada coluna
      this._drawScaleBar(ctx, col1X, y, col1W, h, PPM, scale);
      this._drawDeclinationDiagram(ctx, col2X, y, col2W, h, PPM);
      this._drawTechTable(ctx, col3X, y, col3W, h, PPM, scale, center, opts);
    },

    // ════════════════════════════════════════════════════════════
    // COLUNA 1 — Barra de Escala Gráfica
    // ════════════════════════════════════════════════════════════
    _drawScaleBar(ctx, x, y, w, h, PPM, scale) {
      const PAD  = Math.round(5 * PPM);
      const midX = x + w / 2;

      // ── Título ────────────────────────────────────────────────
      ctx.fillStyle    = '#94a3b8';
      ctx.font         = `600 ${Math.round(2.2*PPM)}px Inter,sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('BARRA DE ESCALA', midX, y + Math.round(3*PPM));

      // ── Cálculo da distância e largura ────────────────────────
      // pixPerMeter: pixels no canvas de saída por metro de terreno
      const pixPerMeter = PPM * 1000 / scale;
      const maxBarW     = w - 2 * PAD;
      const maxTerrainM = maxBarW / pixPerMeter;

      // Escolhe distância "bonita" para o comprimento total da barra
      const candidates = [50,100,200,500,1000,2000,5000,10000,20000,50000,100000];
      let totalM = candidates[0];
      for (const c of candidates) { if (c <= maxTerrainM * 0.82) totalM = c; }

      const barW = Math.round(totalM * pixPerMeter);
      const barX = Math.round(midX - barW / 2);

      // Rótulo da escala total
      const totalLabel = totalM >= 1000
        ? `${(totalM / 1000).toFixed(totalM % 1000 === 0 ? 0 : 1)} km`
        : `${totalM} m`;

      // ── Registro superior: 4 subdivisões (preto/branco) ───────
      const segCount = 4;
      const segW     = Math.round(barW / segCount);
      const barHt    = Math.round(3 * PPM);  // altura de cada registro
      const barY1    = y + Math.round(11 * PPM); // Y do registro superior

      for (let i = 0; i < segCount; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#e2e8f0' : '#1a2332';
        ctx.fillRect(barX + i * segW, barY1, segW, barHt);
      }

      // ── Registro inferior: 2 metades (preto/branco invertido) ─
      const barY2 = barY1 + barHt;
      const halfW = Math.round(barW / 2);
      ctx.fillStyle = '#1a2332';
      ctx.fillRect(barX,         barY2, halfW,      barHt);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(barX + halfW, barY2, barW - halfW, barHt);

      // ── Grade de borda em ambos os registros ──────────────────
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth   = 0.7;
      // Borda superior
      ctx.strokeRect(barX, barY1, barW, barHt);
      // Divisores internos superiores
      for (let i = 1; i < segCount; i++) {
        ctx.beginPath();
        ctx.moveTo(barX + i * segW, barY1);
        ctx.lineTo(barX + i * segW, barY1 + barHt);
        ctx.stroke();
      }
      // Borda inferior
      ctx.strokeRect(barX, barY2, barW, barHt);
      // Divisor interno inferior (meio)
      ctx.beginPath();
      ctx.moveTo(barX + halfW, barY2);
      ctx.lineTo(barX + halfW, barY2 + barHt);
      ctx.stroke();

      // ── Marcas de tick verticais ──────────────────────────────
      const tickLen = Math.round(1.5 * PPM);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth   = 0.7;
      [[barX, barY1], [barX + barW, barY1], [barX + halfW, barY1]].forEach(([tx, ty]) => {
        ctx.beginPath();
        ctx.moveTo(tx, ty - tickLen);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      });

      // ── Rótulos ───────────────────────────────────────────────
      ctx.font         = `500 ${Math.round(2.2*PPM)}px "Roboto Mono",monospace`;
      ctx.fillStyle    = '#e2e8f0';
      ctx.textBaseline = 'bottom';

      // 0
      ctx.textAlign = 'center';
      ctx.fillText('0', barX, barY1 - tickLen - Math.round(0.5*PPM));

      // metade
      const halfLabel = (totalM / 2) >= 1000
        ? `${(totalM / 2000).toFixed(1)} km`
        : `${totalM / 2} m`;
      ctx.fillText(halfLabel, barX + halfW, barY1 - tickLen - Math.round(0.5*PPM));

      // total
      ctx.fillText(totalLabel, barX + barW, barY1 - tickLen - Math.round(0.5*PPM));

      // ── Texto da escala numérica ──────────────────────────────
      const scaleStr = scale >= 10000
        ? `1:${(scale / 1000).toFixed(0)}.000`
        : `1:${scale.toLocaleString('pt-BR')}`;

      ctx.fillStyle    = '#4ade80';
      ctx.font         = `bold ${Math.round(3.2*PPM)}px Inter,sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`ESCALA  ${scaleStr}`, midX, y + h - Math.round(3.5*PPM));

      // Sub-rótulo (metros/km)
      ctx.fillStyle    = '#475569';
      ctx.font         = `${Math.round(2*PPM)}px Inter,sans-serif`;
      ctx.fillText('metros', midX, y + h - Math.round(8*PPM));
    },

    // ════════════════════════════════════════════════════════════
    // COLUNA 2 — Diagrama de Declinação Magnética
    // ════════════════════════════════════════════════════════════
    _drawDeclinationDiagram(ctx, x, y, w, h, PPM) {
      const midX = x + w / 2;

      // ── Título ────────────────────────────────────────────────
      ctx.fillStyle    = '#94a3b8';
      ctx.font         = `600 ${Math.round(2*PPM)}px Inter,sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('DIAGRAMA DE DECLINAÇÃO', midX, y + Math.round(2.5*PPM));
      ctx.fillText('MAGNÉTICA ATUAL',         midX, y + Math.round(4.8*PPM));

      ctx.fillStyle = '#4ade80';
      ctx.font      = `700 ${Math.round(2.1*PPM)}px Inter,sans-serif`;
      ctx.fillText('VITÓRIA – ES (2026)',      midX, y + Math.round(7.2*PPM));

      // ── Parâmetros do diagrama ────────────────────────────────
      // Ponto base: 58% da altura do rodapé
      const baseCY = y + Math.round(h * 0.60);
      const armLen = Math.min(w * 0.36, Math.round(14 * PPM));

      // Ângulos (radianos a partir do eixo Y positivo = Norte)
      const DECL_GRID = (0.34 * Math.PI / 180); // convergência ~0.34° L
      const DECL_NV   = 0;                       // Norte Verdadeiro (vertical)
      const DECL_NM   = (-24.15 * Math.PI / 180); // Norte Magnético 24°09' O

      // ── Função auxiliar: desenha seta ─────────────────────────
      const drawArrow = (angle, color, bold) => {
        const ex = midX + Math.sin(angle) * armLen;
        const ey = baseCY - Math.cos(angle) * armLen;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth   = bold ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(midX, baseCY);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        // Cabeça da seta
        const hs = Math.round(2.5 * PPM);
        const ha = 0.38;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - hs * Math.sin(angle + ha), ey + hs * Math.cos(angle + ha));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - hs * Math.sin(angle - ha), ey + hs * Math.cos(angle - ha));
        ctx.stroke();
        ctx.restore();
        return { ex, ey };
      };

      // ── Arcos de ângulo ───────────────────────────────────────
      const arcR = Math.round(armLen * 0.45);
      // Arco entre Nv e Nm (declinação magnética)
      ctx.save();
      ctx.strokeStyle = 'rgba(251,191,36,0.5)';
      ctx.lineWidth   = 0.8;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(midX, baseCY, arcR, -(Math.PI/2 + Math.abs(DECL_NM)), -Math.PI/2, false);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Arco entre Nv e Ng (convergência — muito pequeno)
      ctx.save();
      ctx.strokeStyle = 'rgba(74,222,128,0.4)';
      ctx.lineWidth   = 0.7;
      ctx.beginPath();
      ctx.arc(midX, baseCY, Math.round(arcR * 0.6), -Math.PI/2, -(Math.PI/2 - DECL_GRID), false);
      ctx.stroke();
      ctx.restore();

      // ── Desenha as setas ──────────────────────────────────────
      const pvNM = drawArrow(DECL_NM,   '#fbbf24', false); // Nm — âmbar
      const pvNV = drawArrow(DECL_NV,   '#e2e8f0', true);  // Nv — branco
      const pvNG = drawArrow(DECL_GRID, '#4ade80', false);  // Ng — verde

      // ── Ponto base (losango) ──────────────────────────────────
      const ds = Math.round(2 * PPM);
      ctx.save();
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(midX,      baseCY - ds);
      ctx.lineTo(midX + ds, baseCY);
      ctx.lineTo(midX,      baseCY + ds * 0.6);
      ctx.lineTo(midX - ds, baseCY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // ── Rótulos das setas ─────────────────────────────────────
      const lFont = `bold ${Math.round(2.1*PPM)}px Inter,sans-serif`;
      ctx.font = lFont;
      ctx.textBaseline = 'middle';

      // Nm (esquerda da seta)
      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'right';
      ctx.fillText('Nm', pvNM.ex - Math.round(1.5*PPM), pvNM.ey + Math.round(2*PPM));

      // Nv (direita da seta)
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'left';
      ctx.fillText('Nv', pvNV.ex + Math.round(1.5*PPM), pvNV.ey - Math.round(1.5*PPM));

      // Ng (direita, mais próximo de Nv)
      ctx.fillStyle = '#4ade80';
      ctx.fillText('Ng', pvNG.ex + Math.round(1.5*PPM), pvNG.ey);

      // ── Ângulo da declinação (rótulo no arco) ─────────────────
      ctx.fillStyle    = '#fbbf24';
      ctx.font         = `${Math.round(2*PPM)}px "Roboto Mono",monospace`;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText("24°09'", midX - Math.round(arcR * 0.85), baseCY - Math.round(arcR * 0.5));

      // ── Linha horizontal de base ──────────────────────────────
      ctx.strokeStyle = 'rgba(74,222,128,0.2)';
      ctx.lineWidth   = 0.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.round(3*PPM), baseCY);
      ctx.lineTo(x + w - Math.round(3*PPM), baseCY);
      ctx.stroke();

      // ── Informações abaixo do diagrama ────────────────────────
      const infoY = baseCY + Math.round(4 * PPM);
      ctx.font         = `${Math.round(1.9*PPM)}px Inter,sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';

      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Declinação Magnética:', midX, infoY);
      ctx.fillStyle = '#fbbf24';
      ctx.font      = `600 ${Math.round(2.1*PPM)}px "Roboto Mono",monospace`;
      ctx.fillText("24° 09' OESTE (2026)", midX, infoY + Math.round(3*PPM));

      ctx.fillStyle = '#475569';
      ctx.font      = `${Math.round(1.9*PPM)}px Inter,sans-serif`;
      ctx.fillText('Convergência Meridiana:', midX, infoY + Math.round(6.5*PPM));
      ctx.fillStyle = '#4ade80';
      ctx.font      = `600 ${Math.round(1.9*PPM)}px "Roboto Mono",monospace`;
      ctx.fillText("0° 20' LESTE", midX, infoY + Math.round(9.5*PPM));

      // ── Legenda ───────────────────────────────────────────────
      const legY = y + h - Math.round(8 * PPM);
      const legItems = [
        { color: '#e2e8f0', label: 'Nv — Norte Verdadeiro (Geográfico)' },
        { color: '#4ade80', label: 'Ng — Norte Grid (UTM)' },
        { color: '#fbbf24', label: 'Nm — Norte Magnético' },
      ];
      ctx.textBaseline = 'middle';
      legItems.forEach((item, i) => {
        const ly = legY + i * Math.round(3 * PPM);
        // Pequeno quadrado colorido
        ctx.fillStyle = item.color;
        ctx.fillRect(x + Math.round(3*PPM), ly - Math.round(0.8*PPM), Math.round(1.8*PPM), Math.round(1.8*PPM));
        ctx.fillStyle = '#475569';
        ctx.font      = `${Math.round(1.7*PPM)}px Inter,sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(item.label, x + Math.round(6*PPM), ly);
      });
    },

    // ════════════════════════════════════════════════════════════
    // COLUNA 3 — Tabela de Informações Técnicas
    // ════════════════════════════════════════════════════════════
    _drawTechTable(ctx, x, y, w, h, PPM, scale, center, opts) {
      const PAD  = Math.round(4 * PPM);
      const midX = x + w / 2;

      // ── Título ────────────────────────────────────────────────
      ctx.fillStyle    = '#94a3b8';
      ctx.font         = `600 ${Math.round(2.1*PPM)}px Inter,sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('INFORMAÇÕES TÉCNICAS', midX, y + Math.round(2.5*PPM));

      // ── Calcula valores ───────────────────────────────────────
      const utmZone = Math.floor((center.lng + 180) / 6) + 1;
      const hem     = center.lat < 0 ? 'S' : 'N';
      const date    = new Date().toLocaleDateString('pt-BR');

      const scaleStr = scale >= 10000
        ? `1:${(scale / 1000).toFixed(0)}.000`
        : `1:${scale.toLocaleString('pt-BR')}`;

      // UTM do centro (usando latLonToUTM do UTMGrid se disponível)
      let utmE = '—', utmN = '—';
      if (window.UTMGrid && window.UTMGrid.latLonToUTM) {
        const utm = window.UTMGrid.latLonToUTM(center.lat, center.lng);
        utmE = Math.round(utm.easting).toLocaleString('pt-BR');
        utmN = Math.round(utm.northing).toLocaleString('pt-BR');
      }

      const latDMS = toDMS(center.lat, true);
      const lonDMS = toDMS(center.lng, false);

      // ── Seções da tabela ──────────────────────────────────────
      const sections = [
        {
          header: 'COORDENADAS DO CENTRO',
          rows: [
            ['LATITUDE',  latDMS],
            ['LONGITUDE', lonDMS],
            ['UTM E',     utmE],
            ['UTM N',     utmN],
          ],
        },
        {
          header: 'REFERÊNCIA GEODÉSICA',
          rows: [
            ['DATUM',     'SIRGAS 2000'],
            ['PROJEÇÃO',  'UTM'],
            ['FUSO',      `${utmZone}${hem}`],
            ['ESCALA',    scaleStr],
            ['DATA',      date],
          ],
        },
      ];

      const tableX = x + PAD;
      const tableW = w - 2 * PAD;
      let curY = y + Math.round(7.5 * PPM);

      const rowH      = Math.round(3.8 * PPM);
      const headerH   = Math.round(4.5 * PPM);
      const labelColW = Math.round(tableW * 0.40);

      sections.forEach(sec => {
        // Cabeçalho da seção
        ctx.fillStyle = 'rgba(74,222,128,0.14)';
        ctx.fillRect(tableX, curY, tableW, headerH);

        ctx.fillStyle    = '#4ade80';
        ctx.font         = `700 ${Math.round(1.9*PPM)}px Inter,sans-serif`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(sec.header, tableX + Math.round(2*PPM), curY + headerH / 2);

        curY += headerH;

        // Linhas de dados
        sec.rows.forEach(([ label, value ], i) => {
          // Fundo alternado
          if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.02)';
            ctx.fillRect(tableX, curY, tableW, rowH);
          }

          // Rótulo
          ctx.fillStyle    = '#64748b';
          ctx.font         = `500 ${Math.round(1.85*PPM)}px Inter,sans-serif`;
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, tableX + Math.round(2*PPM), curY + rowH / 2);

          // Valor
          ctx.fillStyle = '#e2e8f0';
          ctx.font      = `600 ${Math.round(1.9*PPM)}px "Roboto Mono",monospace`;
          ctx.textAlign = 'right';
          ctx.fillText(value, tableX + tableW - Math.round(2*PPM), curY + rowH / 2);

          // Linha inferior da row
          ctx.strokeStyle = 'rgba(74,222,128,0.08)';
          ctx.lineWidth   = 0.5;
          ctx.beginPath();
          ctx.moveTo(tableX, curY + rowH);
          ctx.lineTo(tableX + tableW, curY + rowH);
          ctx.stroke();

          curY += rowH;
        });

        curY += Math.round(2 * PPM); // Espaço entre seções
      });

      // ── Borda da tabela inteira ───────────────────────────────
      const totalTableH = curY - (y + Math.round(7.5*PPM));
      ctx.strokeStyle = 'rgba(74,222,128,0.2)';
      ctx.lineWidth   = 0.7;
      ctx.strokeRect(tableX, y + Math.round(7.5*PPM), tableW, totalTableH);

      // ── Rodapé com BrasilCartaPro ─────────────────────────────
      ctx.fillStyle    = '#475569';
      ctx.font         = `${Math.round(1.9*PPM)}px Inter,sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Fontes: OSM · INDE/DSG · IBGE', midX, y + h - Math.round(4*PPM));

      ctx.fillStyle = '#4ade80';
      ctx.font      = `bold ${Math.round(2.2*PPM)}px Inter,sans-serif`;
      ctx.fillText('BrasilCartaPro', midX, y + h - Math.round(1.2*PPM));
    },
  };

  window.PrintFrame = PrintFrame;
})(window);
