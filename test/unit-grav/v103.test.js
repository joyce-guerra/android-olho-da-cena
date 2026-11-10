'use strict';
// Olho da Cena 1.0.3: imagem gravada sem trancos ("vai e vem"). Um quadro desenhado e gravado
// para cada quadro novo da câmera (requestVideoFrameCallback + captureStream(0) + requestFrame),
// com relógio de reserva; câmera pedida com pelo menos 24 q/s, voltando ao pedido antigo se não der.
// A conferência de ponta a ponta, quadro a quadro, está em test/e2e-grav/quadros.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'gravar.js'), 'utf8');

test('gravação: sem relógio fixo de 30 q/s; um quadro por quadro da câmera', () => {
  assert.ok(!/captureStream\(30\)/.test(src));
  assert.ok(/captureStream\(0\)/.test(src));
  assert.ok(/requestVideoFrameCallback/.test(src) && /requestFrame\(\)/.test(src));
  assert.ok(!/setInterval\(desenhar/.test(src));
});

test('câmera: pede mínimo de 24 q/s e volta ao pedido antigo se a câmera não aguenta', () => {
  assert.ok(/frameRate: \{ ideal: 30, min: 24 \}/.test(src));
  assert.ok(/OverconstrainedError/.test(src));
  assert.ok(/frameRate: \{ ideal: 30 \} \}/.test(src));
});

