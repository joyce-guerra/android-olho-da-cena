'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../../src/fotos');

test('37 molduras e 19 fundos em 10 seções, todos diferentes, com Indicação, Contraindicação e Descrição', () => {
  assert.strictEqual(F.MOLDURAS.length, 37);
  assert.strictEqual(new Set(F.MOLDURAS.map((m) => m.valor)).size, 37);
  assert.strictEqual(new Set(F.MOLDURAS.map((m) => m.nome)).size, 37);
  const T = require('../../src/textos');
  assert.strictEqual(F.CATEGORIAS_VISUAL.length, 10);
  const todosItens = (c) => (c.subs ? c.subs.flatMap((x) => x.itens) : c.itens);
  assert.deepStrictEqual(F.CATEGORIAS_VISUAL.flatMap(todosItens).sort(), [...T.FUNDOS.map((f) => 'f:' + f.valor), ...F.MOLDURAS.map((m) => 'm:' + m.valor)].sort());
  assert.ok(F.CATEGORIAS_VISUAL.every((c) => todosItens(c).length >= 2), 'nenhuma seção com menos de 2 opções');
  assert.strictEqual(F.CATEGORIAS_VISUAL[0].nome, 'Formais e profissionais');
  for (const m of F.MOLDURAS) assert.match(m.texto, /^Tom: .*Indicação: .*Contraindicação: .*Descrição: /, m.valor);
  for (const v of ['coracoes', 'natal', 'pascoa', 'sao-joao', 'casamento', 'ano-novo', 'lua', 'toalete', 'floresta-vagalumes', 'praia-lua-cheia', 'outono', 'escritorio']) assert.ok(F.acharMoldura(v), v);
  assert.strictEqual(F.acharMoldura('craft'), null);
});
test('8 proporções, com a razão certa e a descrição padrão', () => {
  assert.strictEqual(F.PROPORCOES_FOTO.length, 8);
  for (const p of F.PROPORCOES_FOTO) {
    assert.ok(Math.abs(p.w / p.h - p.largura / p.altura) < 0.01, p.valor);
    assert.match(p.texto, /Indicação:.*Contraindicação:.*Descrição:/);
  }
});
test('recorteRazao centra, acompanha o rosto e não passa das bordas', () => {
  const meio = F.recorteRazao(1920, 1080, 3 / 4);
  assert.strictEqual(meio.sh, 1080); assert.strictEqual(meio.sw, 810);
  assert.strictEqual(F.recorteRazao(1920, 1080, 3 / 4, 0).sx, 0);
  assert.strictEqual(F.recorteRazao(1920, 1080, 3 / 4, 1).sx + 810, 1920);
  const alta = F.recorteRazao(1080, 1920, 16 / 9);
  assert.strictEqual(alta.sw, 1080); assert.strictEqual(alta.sh, 608);
});
test('escrito tem no máximo 40 caracteres e figurinhas têm nome', () => {
  assert.strictEqual(F.LIMITE_TEXTO, 40);
  assert.strictEqual(F.limparTexto('  Muito    espaço   aqui  '), 'Muito espaço aqui');
  assert.strictEqual(F.limparTexto('x'.repeat(80)).length, 40);
  assert.deepStrictEqual(F.itensDasCategorias(F.CATEGORIAS_FIGURINHA).sort(), F.FIGURINHAS.map((f) => f.valor).sort());
  assert.ok(F.FIGURINHAS.some((f) => f.valor === 'gato') && ['maquina', 'vassoura', 'lata', 'violao'].every((v) => F.acharFigurinha(v)));
  assert.ok(F.FIGURINHAS.length >= 8 && F.FIGURINHAS.every((f) => f.nome && typeof f.desenhar === 'function'));
  assert.ok(F.FIGURINHAS.every((f) => /Tom: .*Indicação: .*Contraindicação: .*Descrição: /.test(f.texto)), 'toda figurinha tem descrição');
  assert.ok(F.FIGURINHAS.filter((f) => f.legenda).every((f) => f.texto.startsWith(f.nome + '.') && f.legenda.length <= 80), 'figurinha retrô: nome e frase');
});
test('nome da foto e formato do fundo pronto', () => {
  assert.strictEqual(F.nomeDaFoto({ efeitoNome: 'Natal', proporcao: 'retrato' }), 'Foto - Natal - retrato.jpg');
  assert.strictEqual(F.nomeDaFoto({ efeitoNome: '', proporcao: 'capa' }), 'Foto - capa.jpg');
  assert.strictEqual(F.nomeDaFoto({ efeitoNome: 'a/b:c', proporcao: 'feed' }), 'Foto - abc - feed.jpg');
  assert.strictEqual(F.formatoDoFundo(16 / 9), 'horizontal');
  assert.strictEqual(F.formatoDoFundo(1), 'quadrado');
  assert.strictEqual(F.formatoDoFundo(9 / 16), 'vertical');
});

test('molduras que não combinam somem da proporção e o aviso diz quais', () => {
  assert.strictEqual(F.moldurasPara('retrato').disponiveis.length, 36);
  const capa = F.moldurasPara('capa');
  assert.deepStrictEqual(capa.escondidas.map((m) => m.valor).sort(), ['medalha', 'polaroide', 'revista']);
  assert.match(F.avisoMolduras('capa'), /3 molduras não aparecem.*Polaroide.*Capa de revista.*Medalha/);
  assert.strictEqual(F.avisoMolduras('retrato'), '');
  assert.match(F.avisoMolduras('stories'), /uma moldura não aparece.*Medalha/);
});
test('limite de caracteres do escrito por proporção', () => {
  for (const p of F.PROPORCOES_FOTO) { const n = F.limiteTexto(p.valor); assert.ok(n >= 8 && n <= 40, p.valor); }
  assert.strictEqual(F.limiteTexto('capa'), 40);
  assert.ok(F.limiteTexto('retrato') < 40);
});

test('capa quadrada do Spotify: 3000 por 3000, tamanho fixo, escrito grande e molduras compatíveis', () => {
  const c = F.acharProporcao('capa-quadrada');
  assert.ok(c && c.largura === 3000 && c.altura === 3000 && c.w === c.h && c.fixo && c.grande);
  assert.match(c.texto, /Indicação:.*Contraindicação:.*Descrição:.*3000.*640 a 10000/);
  assert.strictEqual(F.limiteTexto('capa-quadrada', true), 28);
  assert.strictEqual(F.limiteTexto('capa-quadrada'), 34);
  assert.deepStrictEqual(F.TIPOS_ESCRITO.map((t) => t.valor), ['legenda', 'frase', 'titulo', 'capa']);
  assert.strictEqual(F.limiteTexto('retrato', 'frase'), 80);
  assert.deepStrictEqual(F.moldurasPara('capa-quadrada').escondidas.map((m) => m.valor).sort(), ['filme', 'polaroide', 'revista']);
  assert.ok(F.PROPORCOES_FOTO.length === 8);
});

test('cores da roupa e do cabelo falam em português e o contraste avisa', () => {
  assert.strictEqual(F.nomeDaCor(20, 30, 70), 'azul escura');
  assert.strictEqual(F.nomeDaCor(0, 0, 0), 'preta');
  assert.strictEqual(F.nomeDaCor(245, 245, 245), 'branca');
  assert.strictEqual(F.nomeDaCor(200, 40, 40), 'vermelha');
  assert.strictEqual(F.nomeDoCabelo(20, 15, 12), 'preto');
  assert.strictEqual(F.nomeDoCabelo(60, 40, 25), 'castanho escuro');
  const c = { cabelo: { l: 0.07, nome: 'preto' }, roupa: { l: 0.12, nome: 'azul escura' } };
  assert.match(F.falaDasCores(c), /cabelo parece preto.*roupa parece azul escura.*estimativa/);
  assert.match(F.falaDoContraste(c, 0.05), /contraste baixo.*cabelo e a roupa se confundem.*mais claro/);
  assert.match(F.falaDoContraste(c, 0.85), /Contraste bom.*claro/);
  assert.strictEqual(F.falaDoContraste(null, 0.5), '');
});

test('figurinhas retrô, vida real, jogos e RPG: 84 originais em cartão, com frase, descrição e tamanho maior', () => {
  const todas = F.CATEGORIAS_FIGURINHA.flatMap((c) => (c.subs ? c.subs : [c]));
  const cat = (v) => todas.find((c) => c.valor === v);
  assert.strictEqual(cat('retro').itens.length, 13);
  assert.strictEqual(cat('vida-real').itens.length, 10);
  assert.strictEqual(cat('anime-criaturas').itens.length, 10);
  assert.strictEqual(cat('magicas').itens.length, 9);
  assert.strictEqual(cat('elemental').itens.length, 8);
  const anime = F.CATEGORIAS_FIGURINHA.find((c) => c.valor === 'anime');
  assert.ok(anime && anime.nome === 'Anime' && anime.subs.length === 3, 'Anime com 3 subcategorias');
  assert.strictEqual(cat('jogos').itens.length, 5);
  assert.strictEqual(cat('rpg').itens.length, 11);
  const comFrase = F.FIGURINHAS.filter((f) => f.legenda && f.escala > 1);
  assert.strictEqual(comFrase.length, 84);
  assert.strictEqual(F.FIGURINHAS.length, 106);
  assert.ok(F.FIGURINHAS.every((f) => f.legenda), 'toda figurinha tem frase');
  assert.strictEqual(F.CATEGORIAS_FIGURINHA.find((c) => c.valor === 'classicas').itens.length, 22);
  assert.ok(!F.CATEGORIAS_FIGURINHA.some((c) => ['escrita', 'casa', 'musica', 'bichinhos', 'simbolos'].includes(c.valor)));
  for (const f of comFrase) { assert.ok(f.escala > 1 && f.legenda.length <= 80 && f.texto.startsWith(f.nome + '. Tom: ')); }
  assert.strictEqual(new Set(F.FIGURINHAS.map((f) => f.legenda)).size, 106, 'frases diferentes');
  assert.ok(!comFrase.some((f) => /Hello Kitty|Garfield|Care Bears|Ursinhos Carinhosos|Moranguinho|Baby Sinclair|Sarah Kay|Pok[eé]mon|Pikachu|Jigglypuff|Charmander|Squirtle|Gastly|Eevee|Bulbasaur|Sailor Moon|Madoka|Kyubey|Cardcaptor|Sakura Card|Genshin|Teyvat|Arconte|Archon|Paimon|Lumine|Venti|Xiao|Raiden|Klee|Ganyu|Ayaka|Kazuha|Dainsleif|Barão Coelhinho/i.test(f.nome + f.texto + f.legenda)), 'só personagens originais');
});
