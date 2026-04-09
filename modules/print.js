/**
 * modules/print.js
 * Motor de impressão A3 para BrasilCartaPro
 * Exporta PNG de alta resolução e dispara diálogo de impressão
 */

;(function (window) {
  'use strict';

  const PrintEngine = {
    _map: null,

    init(map) {
      this._map = map;
    },

    /**
     * Gera o canvas A3 a 150 DPI (compromisso entre qualidade e mem.)
     * A3 paisagem = 420 × 297 mm = 2480 × 1754 px a 150 DPI
     */
    async exportPNG(opts = {}) {
      const {
        title          = 'CARTA TÁTICA',
        subtitle       = '',
        classification = '',
        includeGrid    = true,
        includeCompass = true,
        includeScale   = true,
      } = opts;

      const DPI    = 150;
      const MM_PX  = DPI / 25.4;
      const W      = Math.round(420 * MM_PX); // 2480
      const H      = Math.round(297 * MM_PX); // 1754
      const MARGIN = Math.round(10  * MM_PX); // 10mm

      const offCanvas = document.createElement('canvas');
      offCanvas.width  = W;
      offCanvas.height = H;
      const ctx = offCanvas.getContext('2d');

      // ---- Fundo ----
      ctx.fillStyle = '#0d1520';
      ctx.fillRect(0, 0, W, H);

      // ---- Captura do mapa ----
      // Obtemos o canvas atual do MapLibre e o desenhamos no canvas de impressão
      const mapCanvas = this._map.getCanvas();
      const mapW = W - 2 * MARGIN;
      const mapH = H - 2 * MARGIN - Math.round(20 * MM_PX); // reserva cabeçalho

      ctx.save();
      // Borda do mapa
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.5)';
      ctx.lineWidth   = 2;
      ctx.strokeRect(MARGIN, MARGIN + Math.round(14 * MM_PX), mapW, mapH);
      // Mapa
      ctx.drawImage(mapCanvas, MARGIN, MARGIN + Math.round(14 * MM_PX), mapW, mapH);
      ctx.restore();

      // ---- Grade UTM sobre o mapa ----
      if (includeGrid) {
        const gridCanvas = document.getElementById('utm-grid-canvas');
        if (gridCanvas) {
          ctx.save();
          ctx.globalAlpha = 0.7;
          ctx.drawImage(gridCanvas, MARGIN, MARGIN + Math.round(14 * MM_PX), mapW, mapH);
          ctx.restore();
        }
      }

      // ---- Cabeçalho ----
      const headerY = MARGIN + Math.round(4 * MM_PX);
      // Linha separadora
      ctx.fillStyle = 'rgba(74, 222, 128, 0.3)';
      ctx.fillRect(MARGIN, MARGIN + Math.round(12 * MM_PX), W - 2 * MARGIN, 1);

      // Título
      ctx.fillStyle  = '#e2e8f0';
      ctx.font       = `bold ${Math.round(8 * MM_PX)}px Inter, sans-serif`;
      ctx.textAlign  = 'center';
      ctx.fillText(title, W / 2, headerY + Math.round(4 * MM_PX));

      // Subtítulo
      if (subtitle) {
        ctx.font      = `${Math.round(4 * MM_PX)}px Inter, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(subtitle, W / 2, headerY + Math.round(9 * MM_PX));
      }

      // Classificação (esquerda)
      if (classification) {
        ctx.font      = `bold ${Math.round(3 * MM_PX)}px Inter, sans-serif`;
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'left';
        ctx.fillText(classification, MARGIN, headerY + Math.round(4 * MM_PX));
      }

      // Data/Hora (direita)
      const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      ctx.font      = `${Math.round(2.5 * MM_PX)}px Roboto Mono, monospace`;
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'right';
      ctx.fillText(now, W - MARGIN, headerY + Math.round(4 * MM_PX));

      // Datum e Projeção
      ctx.font      = `${Math.round(2.5 * MM_PX)}px Roboto Mono, monospace`;
      ctx.fillStyle = '#22c55e';
      ctx.textAlign = 'right';
      ctx.fillText('SIRGAS 2000 | UTM', W - MARGIN, headerY + Math.round(8 * MM_PX));

      // ---- Rodapé ----
      const footerY = H - MARGIN - Math.round(4 * MM_PX);
      ctx.fillStyle = 'rgba(74, 222, 128, 0.15)';
      ctx.fillRect(MARGIN, H - MARGIN - Math.round(7 * MM_PX), W - 2 * MARGIN, 1);

      // Centro: Barra de escala
      if (includeScale) {
        const scaleW = Math.round(60 * MM_PX);
        const scaleX = W / 2 - scaleW / 2;
        const scaleY = footerY - Math.round(2 * MM_PX);
        ctx.fillStyle = 'white';
        ctx.fillRect(scaleX, scaleY, scaleW, Math.round(1.5 * MM_PX));
        ctx.fillRect(scaleX, scaleY - Math.round(2 * MM_PX), 2, Math.round(2 * MM_PX));
        ctx.fillRect(scaleX + scaleW, scaleY - Math.round(2 * MM_PX), 2, Math.round(2 * MM_PX));

        const zoom    = this._map.getZoom();
        const lat     = this._map.getCenter().lat;
        const metersPerPx = (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);
        const scaleMeters = Math.round(metersPerPx * (this._map.getCanvas().width));
        const scaleLabel  = scaleMeters >= 1000
          ? `${(scaleMeters / 1000).toFixed(1)} km`
          : `${scaleMeters} m`;

        ctx.font      = `${Math.round(2.5 * MM_PX)}px Roboto Mono, monospace`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(scaleLabel, W / 2, footerY);
      }

      // Esquerda: BrasilCartaPro
      ctx.font      = `bold ${Math.round(3 * MM_PX)}px Inter, sans-serif`;
      ctx.fillStyle = '#4ade80';
      ctx.textAlign = 'left';
      ctx.fillText('BrasilCartaPro', MARGIN, footerY);

      // Direita: Fontes
      ctx.font      = `${Math.round(2.5 * MM_PX)}px Inter, sans-serif`;
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'right';
      ctx.fillText('Fontes: OSM | INDE/DSG | IBGE', W - MARGIN, footerY);

      return offCanvas;
    },

    async downloadPNG(opts) {
      const canvas = await this.exportPNG(opts);
      const blob   = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const url    = URL.createObjectURL(blob);
      const a      = document.createElement('a');
      a.href       = url;
      a.download   = `carta-tatica-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },

    printA3() {
      window.print();
    },
  };

  window.PrintEngine = PrintEngine;
})(window);
