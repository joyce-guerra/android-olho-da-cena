'use strict';
const test = require('node:test');
const assert = require('node:assert');
const AA = require('../../src/atalhos-audio.js');
const AJ = require('../../src/ajuste.js');

const k = (key, extra = {}) => ({ key, code: extra.code || '', altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, ...extra });
const botao = { tagName: 'BUTTON' };

test('1.3: cada atalho dá a ação certa', () => {
  const casos = [
    [k('i', { altKey: true, code: 'KeyI' }), 'inicio'], [k('f', { altKey: true, code: 'KeyF' }), 'fim'],
    [k('s', { altKey: true, code: 'KeyS' }), 'salvarTodos'], [k('d', { altKey: true, code: 'KeyD' }), 'listaDescartes'],
    [k('g', { altKey: true, code: 'KeyG' }), 'previa'], [k('Delete'), 'descartarTodos'],
    [k('ArrowLeft'), 'voltar1'], [k('ArrowRight'), 'avancar1'], [k('F2'), 'salto'],
    [k('PageUp'), 'proximoSalto'], [k('PageDown'), 'saltoAnterior'], [k(' '), 'tocar'],
    [k('Home'), 'comeco'], [k('End'), 'final'],
    [k('ArrowUp', { ctrlKey: true }), 'maisVelocidade'], [k('ArrowDown', { ctrlKey: true }), 'menosVelocidade'],
    [k('ArrowRight', { ctrlKey: true }), 'maisVolume'], [k('ArrowLeft', { ctrlKey: true }), 'menosVolume']
  ];
  for (const [e, a] of casos) assert.strictEqual(AA.acaoDaTecla(e, botao), a, JSON.stringify(e));
  assert.strictEqual(AA.acaoDaTecla(k('x', { altKey: true, code: 'KeyX' }), botao), null);
  assert.strictEqual(AA.acaoDaTecla(k('Delete', { shiftKey: true }), botao), null);
  assert.strictEqual(AA.acaoDaTecla(k('ArrowUp'), botao), null);
});

test('1.3: nenhum atalho dispara em campo editável', () => {
  const campos = [{ tagName: 'INPUT', type: 'text' }, { tagName: 'INPUT' }, { tagName: 'INPUT', type: 'range' }, { tagName: 'INPUT', type: 'number' },
    { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }];
  for (const c of campos) {
    for (const e of [k(' '), k('Delete'), k('ArrowLeft'), k('Home'), k('i', { altKey: true, code: 'KeyI' }), k('ArrowUp', { ctrlKey: true }), k('F2')]) {
      assert.strictEqual(AA.acaoDaTecla(e, c), null, `${c.tagName} ${e.key}`);
    }
  }
  for (const t of ['button', 'checkbox', 'radio']) assert.strictEqual(AA.acaoDaTecla(k(' '), { tagName: 'INPUT', type: t }), 'tocar');
  assert.strictEqual(AA.emCampoEditavel(null), false);
});

test('1.3: tempo em minuto:segundo, horas só acima de 1 hora', () => {
  assert.strictEqual(AA.formatarTempo(8, 60), '00:08');
  assert.strictEqual(AA.formatarTempo(754.9, 3000), '12:34');
  assert.strictEqual(AA.formatarTempo(3723, 4000), '01:02:03');
  assert.strictEqual(AA.formatarTempo(5, 4000), '00:00:05');
  assert.strictEqual(AA.formatarTempo(3600, 3600), '60:00');
  assert.strictEqual(AA.lerTempo('1:30', 600), 90);
  assert.strictEqual(AA.lerTempo('90', 600), 90);
  assert.strictEqual(AA.lerTempo('1:02:03', 600), null);
  assert.strictEqual(AA.lerTempo('1:02:03', 4000), 3723);
  assert.strictEqual(AA.lerTempo('1:75', 600), null);
  assert.strictEqual(AA.lerTempo('abc', 600), null);
});

test('1.3: lista de descartes do Alt D e mensagens', () => {
  const it = AA.itensDescartes([{ inicio: 20, fim: 25 }, { inicio: 0, fim: 8 }], 60);
  assert.strictEqual(it[0].rotulo, 'Descarte 1, de 00:00 a 00:08');
  assert.deepStrictEqual(it[0].botoes, ['Ouvir trecho 1', 'Descartar trecho 1', 'Salvar trecho 1']);
  assert.strictEqual(it[1].rotulo, 'Descarte 2, de 00:20 a 00:25');
  assert.strictEqual(AA.itensDescartes([{ inicio: 3605, fim: 3610 }], 4000)[0].rotulo, 'Descarte 1, de 01:00:05 a 01:00:10');
  assert.deepStrictEqual(AA.itensDescartes([], 60), []);
  assert.strictEqual(AA.MSG.semDescartes, 'Nenhum descarte encontrado. Use Alt I e Alt F para marcar os descartes desejados antes de selecionar. Del e Alt S descartam ou salvam todos.');
  assert.strictEqual(AA.MSG.previa, 'Prévia de 10 segundos. Avance e recue para ouvir outros trechos.');
});

test('1.3: cortes, pulo e prévia de 10 s', () => {
  assert.deepStrictEqual(AA.unir([{ inicio: 5, fim: 8 }, { inicio: 1, fim: 3 }, { inicio: 7, fim: 9 }]), [{ inicio: 1, fim: 3 }, { inicio: 5, fim: 9 }]);
  assert.deepStrictEqual(AA.mantidos([{ inicio: 2, fim: 4 }], 10), [{ de: 0, ate: 2 }, { de: 4, ate: 10 }]);
  assert.strictEqual(AA.pularCorte(3, [{ inicio: 2, fim: 4 }]), 4);
  assert.strictEqual(AA.pularCorte(5, [{ inicio: 2, fim: 4 }]), 5);
  assert.deepStrictEqual(AA.segmentosPrevia(20, [{ inicio: 18, fim: 22 }], 100), [{ de: 13, ate: 18 }, { de: 22, ate: 27 }]);
  assert.deepStrictEqual(AA.segmentosPrevia(1, [], 100), [{ de: 0, ate: 10 }]);
  assert.deepStrictEqual(AA.segmentosPrevia(99, [], 100), [{ de: 90, ate: 100 }]);
  assert.deepStrictEqual(AA.segmentosPrevia(5, [{ inicio: 0, fim: 100 }], 100), []);
});

test('1.3: nivelamento para a internet (-16 LUFS, pico até -1 dB) e volume por cima', () => {
  assert.strictEqual(AJ.ganhoParaNivelar(-26, -20), 10);
  assert.strictEqual(AJ.ganhoParaNivelar(-26, -5), 4);   // o pico limita
  assert.strictEqual(AJ.ganhoParaNivelar(-60, -50), 30);  // teto de +30 dB
  assert.strictEqual(AJ.ganhoParaNivelar(-5, 0), -11);
  assert.strictEqual(AJ.ganhoParaNivelar(-Infinity), null);
  assert.strictEqual(AJ.filtroAudio({ nivelar: true, ganhoNivelar: 4, volume: 1.2 }), 'volume=4.0dB,volume=1.200');
  assert.strictEqual(AA.ganhoTotalDb(4, 1), 4);
  assert.ok(Math.abs(AA.ganhoLinear(6, 1) - 1.995) < 0.01);
  assert.strictEqual(AJ.mudarVolume(1, 1), 1.1);
  assert.strictEqual(AJ.mudarVelocidade(1, -1), 0.95);
});
