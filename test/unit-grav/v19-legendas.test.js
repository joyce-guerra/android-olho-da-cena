'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../../src/legendas');

// Palavras como o whisper-cli devolve com -ml 1 -sow -oj (tempos em milissegundos).
function json(palavras) {
  let t = 0;
  return { transcription: [{ offsets: { from: 0, to: 0 }, text: '' }, ...palavras.map((p) => {
    const dur = p.dur || 300; const from = t + (p.pausa || 0); t = from + dur;
    return { offsets: { from, to: t }, text: ' ' + p.t };
  })] };
}
const frase = (texto, extra = {}) => texto.split(' ').map((t) => ({ t, ...extra }));

test('1.9: quatro estilos, cada um com uso, pontos fortes e quando evitar', () => {
  assert.deepStrictEqual(L.ESTILOS.map((e) => e.id), ['youtube', 'shorts', 'conto', 'aula']);
  for (const e of L.ESTILOS) for (const k of ['nome', 'uso', 'fortes', 'evitar']) assert.ok(e[k] && e[k].length > 10, `${e.id}.${k}`);
});

test('1.9: nenhum estilo usa a parte de cima do vídeo (título e logo ficam lá)', () => {
  for (const e of L.ESTILOS) {
    for (const [w, h] of [[1920, 1080], [1080, 1920]]) {
      const ass = L.assDasLegendas([{ inicio: 0, fim: 2, texto: 'teste' }], e.id, w, h);
      const campos = /^Style: (.*)$/m.exec(ass)[1].split(',');
      assert.strictEqual(campos[18], '2', `${e.id}: alinhado embaixo`);
      const margem = Number(campos[21]), fonte = Number(campos[2]);
      // Duas linhas de letra a partir da margem de baixo: o topo da legenda fica abaixo dos 35% de cima.
      assert.ok(h - margem - 2.6 * fonte > 0.35 * h, `${e.id} ${w}x${h}: topo da legenda em ${h - margem - 2.6 * fonte}`);
    }
  }
});

test('1.9: palavras vazias do whisper saem, tempos em segundos', () => {
  const p = L.palavrasDoWhisper(json(frase('Era uma vez')));
  assert.deepStrictEqual(p.map((x) => x.texto), ['Era', 'uma', 'vez']);
  assert.strictEqual(p[1].inicio, 0.3);
});

test('1.9: YouTube: até 2 linhas de 42 letras, quebra no fim da frase', () => {
  const p = L.palavrasDoWhisper(json(frase('Era uma vez uma menina que morava perto do rio. Todas as manhãs ela descia até a margem para ouvir os pássaros cantando bem cedo.')));
  const c = L.legendasDasPalavras(p, 'youtube');
  assert.ok(c[0].texto.endsWith('rio.'), c[0].texto);
  for (const x of c) {
    const linhas = L.quebrar(x.texto, 42, 2);
    assert.ok(linhas.length <= 2 && linhas.every((l) => l.length <= 42), JSON.stringify(linhas));
    assert.ok(x.fim - x.inicio <= 6.01);
  }
});

test('1.9: Shorts: de 2 a 4 palavras, sem terminar em palavra fraca', () => {
  const p = L.palavrasDoWhisper(json(frase('Hoje eu vou mostrar para vocês como fazer um bolo de cenoura com cobertura de chocolate em casa.')));
  const c = L.legendasDasPalavras(p, 'shorts');
  for (const x of c) {
    const n = x.texto.split(' ').length;
    assert.ok(n >= 2 && n <= 5, x.texto);
    assert.ok(!/ (de|um|uma|com|para|o|a)$/.test(x.texto), x.texto);
  }
});

test('1.9: pausa longa na fala abre uma legenda nova', () => {
  const p = L.palavrasDoWhisper(json([...frase('Primeira parte da fala'), { t: 'segunda', pausa: 1500 }, ...frase('parte depois')]));
  const c = L.legendasDasPalavras(p, 'youtube');
  assert.strictEqual(c.length, 2);
  assert.strictEqual(c[1].texto, 'segunda parte depois');
});

test('1.9: legendas não se sobrepõem e duram pelo menos o mínimo quando há espaço', () => {
  const p = L.palavrasDoWhisper(json([{ t: 'Oi.', dur: 200 }, { t: 'Tudo', pausa: 2000 }, { t: 'bem?' }]));
  const c = L.legendasDasPalavras(p, 'aula');
  assert.ok(c[0].fim - c[0].inicio >= 1.2 - 1e-9);
  for (let i = 0; i < c.length - 1; i++) assert.ok(c[i].fim <= c[i + 1].inicio);
});

test('1.9: SRT de fora fica como veio, menos no Shorts, que divide de novo', () => {
  const cues = [{ inicio: 0, fim: 4, linhas: ['Uma frase comprida que vai virar', 'várias legendas curtas no Shorts.'] }];
  assert.strictEqual(L.legendasDoSrt(cues, 'youtube').length, 1);
  const s = L.legendasDoSrt(cues, 'shorts');
  assert.ok(s.length >= 3 && s.every((x) => x.texto.split(' ').length <= 5), JSON.stringify(s));
  assert.ok(Math.abs(s[s.length - 1].fim - 4) < 0.6);
});

test('1.9: SRT e ASS escritos com tempos e texto certos', () => {
  const c = [{ inicio: 1.5, fim: 3.25, texto: 'Olá {mundo}' }];
  assert.match(L.srtDasLegendas(c, 'youtube'), /^1\n00:00:01,500 --> 00:00:03,250\nOlá \{mundo\}\n/);
  const ass = L.assDasLegendas(c, 'youtube', 1920, 1080);
  assert.match(ass, /PlayResX: 1920\nPlayResY: 1080/);
  assert.match(ass, /Dialogue: 0,0:00:01\.50,0:00:03\.25,Olho,,0,0,0,,Olá \\\{mundo\\\}/);
  assert.match(ass, /,4,\d+,0,2,/); // tarja única (estilo 4) no YouTube
});

test('1.9: transcrição em parágrafos nas pausas longas depois do fim da frase', () => {
  const p = L.palavrasDoWhisper(json([...frase('Primeira frase.'), { t: 'Segunda', pausa: 2000 }, ...frase('frase.')]));
  assert.strictEqual(L.textoDaTranscricao(p), 'Primeira frase.\n\nSegunda frase.\n');
});

test('1.9: nome sem repetir numera qualquer extensão (antes, um .srt repetido travava o programa)', () => {
  const TP = require('../../src/tempo');
  const tem = new Set(['v - legenda.srt', 'v - transcrição.txt', 'v - transcrição 2.txt', 'a editado.mp3']);
  assert.strictEqual(TP.nomeSemRepetir('v - legenda.srt', (n) => tem.has(n)), 'v - legenda 2.srt');
  assert.strictEqual(TP.nomeSemRepetir('v - transcrição.txt', (n) => tem.has(n)), 'v - transcrição 3.txt');
  assert.strictEqual(TP.nomeSemRepetir('a editado.mp3', (n) => tem.has(n)), 'a editado 2.mp3');
});
