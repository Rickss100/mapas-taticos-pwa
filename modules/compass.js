/**
 * modules/compass.js
 * Rosa dos ventos com declinação magnética para BrasilCartaPro
 */

;(function (window) {
  'use strict';

  const Compass = {
    _canvas: null,
    _ctx: null,
    _map: null,
    // Declinação magnética para Vitória/ES 2026 ≈ 24° W
    _declination: -24,

    init(map) {
      this._map  = map;
      this._canvas = document.getElementById('compass-canvas');
      this._ctx  = this._canvas.getContext('2d');

      map.on('rotate', () => this._draw());
      map.on('pitchend', () => this._draw());
      this._draw();
    },

    _draw() {
      const canvas = this._canvas;
      const ctx    = this._ctx;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const R  = W / 2 - 4;

      ctx.clearRect(0, 0, W, H);

      const bearing = this._map ? -this._map.getBearing() * Math.PI / 180 : 0;

      // Círculo externo
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // Fundo
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(13, 21, 32, 0.75)';
      ctx.fill();

      // Marcações cardinais
      const cardinals = ['N', 'L', 'S', 'O'];
      ctx.font      = '700 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < 4; i++) {
        const angle = bearing + (i * Math.PI / 2);
        const tx = cx + (R - 10) * Math.sin(angle);
        const ty = cy - (R - 10) * Math.cos(angle);
        ctx.fillStyle = i === 0 ? '#f87171' : 'rgba(74, 222, 128, 0.8)';
        ctx.fillText(cardinals[i], tx, ty);
      }

      // Agulha Norte (vermelho)
      ctx.translate(cx, cy);
      ctx.rotate(bearing);

      ctx.beginPath();
      ctx.moveTo(0, -(R - 16));
      ctx.lineTo(-5, 0);
      ctx.lineTo(0, 8);
      ctx.lineTo(5, 0);
      ctx.closePath();
      ctx.fillStyle = '#f87171';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth   = 0.5;
      ctx.stroke();

      // Agulha Sul (verde escuro)
      ctx.beginPath();
      ctx.moveTo(0, R - 16);
      ctx.lineTo(-4, 0);
      ctx.lineTo(0, -8);
      ctx.lineTo(4, 0);
      ctx.closePath();
      ctx.fillStyle = '#166534';
      ctx.fill();
      ctx.stroke();

      // Centro
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#1a2332';
      ctx.fill();
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)';
      ctx.lineWidth   = 1;
      ctx.stroke();

      ctx.restore();

      // Ponta Norte — declinação magnética
      const declAngle = bearing + (this._declination * Math.PI / 180);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(declAngle);
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -(R - 20));
      ctx.stroke();
      ctx.restore();
    },
  };

  window.Compass = Compass;
})(window);
