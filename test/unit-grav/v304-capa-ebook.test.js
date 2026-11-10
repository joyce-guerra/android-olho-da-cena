'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../../src/fotos');

test('3.0.4: Capa de ebook, 5 por 8, sai sempre com 1600 por 2560', () => {
  const p = F.acharProporcao('capa-ebook');
  assert.ok(p);
  assert.strictEqual(p.nome, 'Capa de ebook, 5 por 8');
  assert.deepStrictEqual([p.w, p.h, p.largura, p.altura], [5, 8, 1600, 2560]);
  assert.strictEqual(p.largura / p.altura, p.w / p.h);
  assert.strictEqual(p.fixo, true);
  assert.ok(p.grande);
  assert.ok(/Amazon/.test(p.indicacao) && /Central de Escrita/.test(p.indicacao));
  assert.ok(!/aproximad|pode cortar/i.test(p.texto));
  assert.ok(/Indicação: .+ Contraindicação: .+ Descrição: /.test(p.texto));
});
test('3.0.4: a câmera deitada de 1280 por 720 dá um recorte 5 por 8 sem deformar', () => {
  const r = F.recorteRazao(1280, 720, 5 / 8, 0.5);
  assert.strictEqual(r.sh, 720);
  assert.ok(Math.abs(r.sw / r.sh - 5 / 8) < 0.01);
});
test('3.0.4: só a Medalha some no formato Capa de ebook', () => {
  assert.deepStrictEqual(F.moldurasPara('capa-ebook').escondidas.map((m) => m.valor), ['medalha']);
});
test('3.0.4: tipo de escrito Capa, com Tom, Indicação, Contraindicação e Descrição, só no formato novo', () => {
  const t = F.TIPOS_ESCRITO.find((x) => x.valor === 'capa');
  assert.ok(t && t.nome === 'Capa' && t.soEm === 'capa-ebook');
  assert.ok(/^Tom: .+ Indicação: .+ Contraindicação: .+ Descrição: .+ebook|capa para ebook/.test(t.texto) || /capa para ebook/i.test(t.texto));
  assert.ok(F.TIPOS_ESCRITO.filter((x) => x.valor !== 'capa').every((x) => !x.soEm));
});
test('3.0.4: limites da capa, título e nome', () => {
  assert.strictEqual(F.limiteTexto('capa-ebook', 'capa'), 28);
  assert.strictEqual(F.limiteTexto('capa-ebook', 'autor'), 30);
  assert.strictEqual(F.LIMITE_CAPA_TITULO, 28);
  assert.strictEqual(F.LIMITE_CAPA_AUTOR, 30);
});
test('3.0.4: nome do arquivo "Capa - título.jpg"', () => {
  assert.strictEqual(F.nomeDaCapa('A casa do lago'), 'Capa - A casa do lago.jpg');
  assert.strictEqual(F.nomeDaCapa('Por quê? Sim/não: "talvez"'), 'Capa - Por quê Simnão talvez.jpg');
  assert.strictEqual(F.nomeDaCapa('   '), 'Capa.jpg');
});
test('3.0.4: todas as molduras da Central estão disponíveis no formato novo, menos a Medalha', () => {
  const disp = new Set(F.moldurasPara('capa-ebook').disponiveis.map((m) => m.nome));
  for (const nome of ['Aquarela', 'Polaroide', 'Casamento', 'Estrelas douradas', 'Confete']) {
    assert.ok([...disp].some((n) => n.includes(nome)), nome);
  }
});
