'use strict';
// 1.2: luz demais, luz por trás, desfoque e câmera tremendo, com quadros sintéticos feitos das fotos de teste.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');
const EQ = require('../../src/enquadramento');
const TX = require('../../src/textos');
const F = path.join(__dirname, '..', '..', 'testdata', 'fontes');
const FOTOS = ['Sally_Ride_(1984).jpg', 'Mae_Carol_Jemison.jpg', 'dois_rostos.jpg', 'corpo_inteiro.jpg', 'Neil_Armstrong_pose.jpg'];
const cinza = (arq, vf, w, h) => Float32Array.from(execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(F, arq), '-frames:v', '1',
  '-vf', `${vf}scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1e8 }));
const ROSTO = 'crop=iw*0.3:ih*0.3:iw*0.35:ih*0.12,';
const novas = /Luz demais|Luz por trás|desfocada|tremendo/;
const base = { rostos: [{ x: 0.42, y: 0.25, w: 0.16, h: 0.24 }], largura: 1920, altura: 1080 };

test('1.2: fotos normais não disparam nenhum aviso novo', () => {
  for (const f of FOTOS) {
    const estourado = EQ.fracaoEstourada(cinza(f, 'scale=1280:720,', 128, 72));
    const nitidez = EQ.nitidezLaplaciano(cinza(f, ROSTO, 128, 128), 128, 128);
    const r = EQ.descreverEnquadramento({ ...base, brilho: 120, brilhoRosto: 130, estourado, nitidez, tremendo: false });
    assert.doesNotMatch(r.texto, novas, `${f}: ${r.texto} (estourado ${estourado}, nitidez ${nitidez})`);
  }
});
test('1.2: imagem estourada', () => {
  const estourado = EQ.fracaoEstourada(cinza('corpo_inteiro.jpg', 'eq=brightness=0.45:contrast=1.3,', 128, 72));
  const r = EQ.descreverEnquadramento({ ...base, brilho: 230, brilhoRosto: 235, estourado });
  assert.match(r.texto, /Luz demais: imagem estourada\./);
  assert.doesNotMatch(r.texto, /Luz por trás/);
});
test('1.2: luz por trás (fundo claro, rosto escuro)', () => {
  const r = EQ.descreverEnquadramento({ ...base, brilho: 175, brilhoRosto: 70, estourado: 0.05 });
  assert.match(r.texto, /Luz por trás: o rosto está na sombra\./);
  const ok = EQ.descreverEnquadramento({ ...base, brilho: 130, brilhoRosto: 110, estourado: 0.0 });
  assert.doesNotMatch(ok.texto, /Luz por trás/);
});
test('1.2: desfocada (rosto borrado), e normal não', () => {
  for (const f of FOTOS.slice(0, 2)) {
    const n = EQ.nitidezLaplaciano(cinza(f, 'scale=1920:-2,' + ROSTO + 'gblur=sigma=8,', 128, 128), 128, 128);
    assert.match(EQ.descreverEnquadramento({ ...base, nitidez: n }).texto, /Imagem desfocada: limpe a lente ou verifique o foco\./, `${f}: ${n}`);
  }
  assert.doesNotMatch(EQ.descreverEnquadramento({ ...base, nitidez: null }).texto, /desfocada/);
  // No escuro, só fala do escuro.
  assert.doesNotMatch(EQ.descreverEnquadramento({ ...base, brilho: 20, brilhoRosto: 20, nitidez: 3 }).texto, /desfocada/);
});

// Sequência de 7 quadros 128x72 recortados da mesma foto com deslocamentos (a "câmera" mexendo).
function sequencia(desl) {
  return desl.map(([dx, dy]) => cinza('Neil_Armstrong_pose.jpg', `scale=1408:792,crop=1280:720:${64 + dx}:${36 + dy},`, 128, 72));
}
test('1.2: câmera tremendo (mexe o tempo todo)', () => {
  const q = sequencia([[0, 0], [30, 10], [-20, -20], [25, 15], [-30, 0], [10, -25], [-25, 20]]);
  const t = EQ.cameraTremendo(q, 128, 72);
  assert.ok(t.tremendo, JSON.stringify(t.passos));
  assert.match(EQ.descreverEnquadramento({ ...base, tremendo: t.tremendo }).texto, /Câmera tremendo\./);
});
test('1.2: um esbarrão só não é tremor; câmera parada também não', () => {
  const um = EQ.cameraTremendo(sequencia([[0, 0], [0, 0], [0, 0], [30, 20], [30, 20], [30, 20], [30, 20]]), 128, 72);
  assert.ok(!um.tremendo, JSON.stringify(um.passos));
  const parada = EQ.cameraTremendo(sequencia([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]), 128, 72);
  assert.ok(!parada.tremendo, JSON.stringify(parada.passos));
});
test('1.2: mexer a cabeça (fundo parado) não é tremor', () => {
  const fundo = cinza('Neil_Armstrong_pose.jpg', 'scale=1280:720,', 128, 72);
  const rosto = { x: 0.4, y: 0.2, w: 0.15, h: 0.25 };
  const q = [0, 6, -6, 8, -8, 5, -5].map((d) => {
    const g = Float32Array.from(fundo);
    for (let y = 18; y < 72; y++) for (let x = 54 + d; x < 72 + d; x++) g[y * 128 + x] = (x * 7 + y * 3) % 255; // "cabeça" mexendo
    return g;
  });
  assert.ok(!EQ.cameraTremendo(q, 128, 72, rosto).tremendo);
});
test('1.2: novos fundos na ordem das categorias', () => {
  const v = TX.FUNDOS.map((f) => f.valor);
  assert.deepStrictEqual(v.slice(0, 4), ['escritorio', 'estudio', 'biblioteca', 'sala-de-aula']);
  assert.strictEqual(v[v.indexOf('carro-masculino') + 1], 'estacao-espacial');
});
