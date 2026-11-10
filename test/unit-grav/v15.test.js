'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../../ui/index.html'), 'utf8');
const TX = require('../../src/textos.js');

const secao = (id) => { const i = html.indexOf(`<section id="${id}"`); return html.slice(i, html.indexOf('</section>', i)); };
const textos = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// 1.9: o Montar vídeo não tem mais trilhas próprias: o áudio dele passa pelas etapas de áudio,
// e a etapa Efeitos e trilhas guarda os textos da 1.0.0.
test('1.5: os textos da trilha são os do Montar vídeo da 1.0.0, mais as escolhas de começo da 2.0.3', () => {
  const g = textos(secao('au-trilhas'));
  const e = textos(secao('au-trilhas'));
  assert.ok(!html.includes('id="t-trilha"') && !html.includes('id="g-btn-add-trilha"'), 'Montar sem trilhas próprias');
  for (const t of ['Cada trilha entra por baixo do áudio principal', 'Em loop: repete até o fim do vídeo.', 'Estática: toca uma vez só.', 'Desde o começo do vídeo.', 'A partir de um tempo determinado.', 'Marcar aqui', 'Entrar com fade suave (1,5 segundo).', 'Sair com fade suave (3 segundos).',
    'Por baixo de fala, quanto mais baixa melhor: trilha alta engole a voz.', 'Ouvir prévia da mistura aqui (6 segundos)', 'Encerrar a trilha anterior aqui', 'Deixar as duas tocando']) {
    assert.ok(g.includes(t) && e.includes(t), t);
  }
});
test('1.5: sem o tocador de 5 segundos do Montar; com o tocador universal e o fim Salvar e continuar, Voltar, Fechar', () => {
  const e = secao('au-trilhas');
  assert.ok(!/5 segundos/.test(e));
  assert.ok(e.includes('Tocar ou pausar, Espaço') && !/Control Espaço/.test(e));
  assert.match(textos(e), /Salvar e continuar Voltar Fechar\s*$/);
});
test('1.5: a ordem dos links é Cortes, Silêncios e crossfade, Efeitos e trilhas', () => {
  const nav = textos(html.slice(html.indexOf('<nav aria-label="Telas de áudio"'), html.indexOf('</nav>', html.indexOf('<nav aria-label="Telas de áudio"')))).trim();
  assert.strictEqual(nav, 'Etapa 1: Cortes Etapa 2: Silêncios e crossfade Etapa 3: Efeitos e trilhas Etapa 4: Equalização e ajustes'); // 1.8: numeradas como no Montar
});
test('1.5: "Sem fundo" passa a se chamar "Fundo original"; o comportamento (nenhum) continua', () => {
  assert.ok(TX.EFEITOS.find((x) => x.valor === 'nenhum' && x.nome === 'Fundo original'));
  assert.ok(!TX.EFEITOS.some((x) => /Sem fundo/.test(x.nome)));
});
test('1.5: o salvar leva as trilhas junto, uma vez só', () => {
  const a = fs.readFileSync(path.join(__dirname, '../../ui/audio-cortes.js'), 'utf8');
  assert.strictEqual((a.match(/F\.chamar\('audiocortesSalvar'/g) || []).length, 1);
  assert.match(a, /camadas: au\.camadas/);
});

test('1.5: crossfade sobreposto — xfade e acrossfade do mesmo tamanho em cada emenda', () => {
  const C = require('../../src/cortar.js');
  const mantidos = C.alinharAosQuadros([{ de: 0, ate: 5 }, { de: 7, ate: 12 }, { de: 13.5, ate: 20 }], 30);
  const sob = C.calcularSobreposicoes(mantidos, 30);
  assert.deepStrictEqual(sob.map((d) => Math.round(d * 30)), [6, 6]);
  const args = C.argsCortar({ entrada: 'a.mp4', mantidos, temAudio: true, saida: 'b.mp4', duracao: 30, sobreposicoes: sob, fps: 30 });
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.strictEqual((fc.match(/xfade=transition=fade:duration=0\.2000/g) || []).length, 2);
  assert.strictEqual((fc.match(/acrossfade=d=0\.2000/g) || []).length, 2);
  assert.ok(fc.includes('offset=4.8000') && fc.includes('offset=9.6000'));
  assert.ok(!fc.includes('concat='));
  assert.ok(Math.abs(C.remapSobreposto(8, mantidos, sob) - 5.8) < 1e-9);
});
