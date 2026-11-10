'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../../src/fotos-editar');
const F = require('../../src/fotos');

const boa = (extra = {}) => ({ largura: 2000, altura: 3000, nitidez: 150, luz: { media: 0.5, estourada: 0.02 }, rostos: [{ x: 0.35, y: 0.2, w: 0.25, h: 0.2 }], cobertura: 0.4, detalheFundo: 0.03, ...extra });

test('3.0.4: foto boa com uma pessoa é aprovada e aceita todas as ações', () => {
  const r = E.avaliarFoto(boa());
  assert.ok(r.aprovada);
  assert.deepStrictEqual(r.acoes, { fundo: true, moldura: true, formato: true, escrito: true, gemma: true });
  assert.ok(r.itens.some((i) => i.r === 'Pessoas' && /Uma pessoa/.test(i.t)));
});
test('3.0.4: paisagem é aprovada, mas sem troca de fundo', () => {
  const r = E.avaliarFoto(boa({ rostos: [], cobertura: null }));
  assert.ok(r.aprovada);
  assert.strictEqual(r.acoes.fundo, false);
  assert.strictEqual(r.acoes.moldura, true);
  assert.ok(r.itens.some((i) => /Nenhuma pessoa/.test(i.t)));
});
test('3.0.4: na dúvida, diz não, com o motivo', () => {
  const casos = [
    [boa({ largura: 400, altura: 500 }), /Pequena demais/],
    [boa({ nitidez: 10 }), /Tremida ou fora de foco/],
    [boa({ luz: { media: 0.08, estourada: 0 } }), /Escura demais/],
    [boa({ luz: { media: 0.95, estourada: 0 } }), /Clara demais/],
    [boa({ luz: { media: 0.5, estourada: 0.4 } }), /luz estourada/],
    [boa({ rostos: [0, 1, 2, 3].map((i) => ({ x: 0.1 + i * 0.2, y: 0.3, w: 0.1, h: 0.1 })) }), /Gente demais/],
    [boa({ rostos: [{ x: 0, y: 0.2, w: 0.2, h: 0.2 }] }), /Rosto cortado/],
    [boa({ rostos: [{ x: 0.4, y: 0.4, w: 0.02, h: 0.02 }] }), /Rosto pequeno demais/]
  ];
  for (const [m, re] of casos) {
    const r = E.avaliarFoto(m);
    assert.strictEqual(r.aprovada, false);
    assert.ok(r.motivos.some((x) => re.test(x)), re + ' ' + r.motivos.join('|'));
    assert.deepStrictEqual(Object.values(r.acoes).filter(Boolean), []);
  }
});
test('3.0.4: recorte duvidoso da pessoa tira só a troca de fundo', () => {
  const r = E.avaliarFoto(boa({ cobertura: 0.01 }));
  assert.ok(r.aprovada);
  assert.strictEqual(r.acoes.fundo, false);
  assert.strictEqual(r.acoes.moldura, true);
});
test('3.0.4: a descrição é item a item, com o fundo e a luz', () => {
  const r = E.avaliarFoto(boa());
  const rotulos = r.itens.map((i) => i.r);
  for (const x of ['Pessoas', 'Rosto', 'Enquadramento', 'Fundo', 'Luz', 'Nitidez']) assert.ok(rotulos.includes(x), x);
  assert.match(r.itens.find((i) => i.r === 'Rosto').t, /^(Grande|De tamanho médio|Pequeno), (à esquerda|no meio|à direita), (no alto|embaixo|na altura do meio)\.$/);
});
test('3.0.4: o resumo da triagem', () => {
  assert.strictEqual(E.resumoDaTriagem(40, 23), 'De 40 fotos, posso trabalhar com 23 com segurança. 17 ficaram de fora, e o diagnóstico mostra o motivo de cada uma.');
  assert.match(E.resumoDaTriagem(5, 0), /nenhuma é segura/);
  assert.match(E.resumoDaTriagem(0, 0), /Não achei fotos/);
  assert.match(E.resumoDaTriagem(1, 1), /De 1 foto, posso trabalhar com 1 com segurança\.$/);
});
test('3.0.4: aplica nas que servem e avisa as que ficaram de fora', () => {
  const av = [E.avaliarFoto(boa()), E.avaliarFoto(boa({ rostos: [], cobertura: null }))];
  const { servem, ficam } = E.quemAceita(av, true);
  assert.strictEqual(servem.length, 1); assert.strictEqual(ficam.length, 1);
  assert.strictEqual(E.falaDaAplicacao('Fundo', 1, ['paisagem.jpg'], 'sem pessoa para separar'), 'Fundo: feito em 1 de 2. Ficou de fora paisagem.jpg, sem pessoa para separar.');
  assert.strictEqual(E.falaDaAplicacao('Formato', 3, [], ''), 'Formato: feito em todas as 3 fotos.');
});
test('3.0.4: as ações do conjunto contam só as que servem', () => {
  const av = [E.avaliarFoto(boa()), E.avaliarFoto(boa({ rostos: [], cobertura: null }))];
  const acoes = E.acoesDoConjunto(av);
  assert.deepStrictEqual(acoes.map((a) => a.valor), ['fundo', 'formato', 'escrito']);
  assert.strictEqual(acoes.find((a) => a.valor === 'formato').para, 2);
});
test('3.0.4: o formato mais próximo da foto, sem os de tamanho fixo', () => {
  const p = F.PROPORCOES_FOTO;
  assert.strictEqual(E.formatoMaisProximo(p, 4000, 3000).valor, 'capa');
  assert.strictEqual(E.formatoMaisProximo(p, 3000, 4000).valor, 'retrato');
  assert.strictEqual(E.formatoMaisProximo(p, 1000, 1000).valor, 'quadrada');
});
