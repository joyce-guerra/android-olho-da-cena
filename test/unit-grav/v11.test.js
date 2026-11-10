'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const TX = require('../../src/textos');
const ABERT = require('../../src/abertura');
const raiz = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(raiz, 'ui/index.html'), 'utf8');
const grav = fs.readFileSync(path.join(raiz, 'ui/gravar.js'), 'utf8');
const rend = fs.readFileSync(path.join(raiz, 'ui/renderer.js'), 'utf8');

test('1.1: fundos na ordem das categorias internas', () => {
  assert.deepStrictEqual(TX.FUNDOS.map((f) => f.valor), ['escritorio', 'estudio', 'biblioteca', 'sala-de-aula', 'indiano', 'grafite', 'capela', 'carro',
    'carro-masculino', 'estacao-espacial', 'anime', 'quarto-feminino', 'quarto-masculino', 'sala', 'sala-dos-gatos', 'jardim', 'praia', 'ceu-estrelado', 'cafe']);
  assert.deepStrictEqual([...new Set(TX.FUNDOS.map((f) => f.categoria))], ['profissionais', 'estilo', 'domesticos', 'externos', 'outros']);
});
test('1.1: cada fundo: nome, depois aplicação, depois descrição; e as 3 imagens existem', () => {
  for (const f of TX.FUNDOS) {
    assert.ok(f.nome && f.aplicacao.startsWith('Bom para'), f.valor);
    // 2.0: nome, depois indicação, contraindicação e descrição.
    assert.ok(f.descricao.startsWith('Indicação: ') && /Contraindicação: /.test(f.descricao) && f.descricao.includes(' Descrição: ') && f.descricao.endsWith(f.cena), f.valor);
    for (const fmt of ['horizontal', 'vertical', 'quadrado']) assert.ok(fs.existsSync(path.join(raiz, 'vendor/fundos', `${f.valor}-${fmt}.jpg`)), `${f.valor}-${fmt}`);
  }
});
test('1.1: botões depois de gravar, um por linha, na ordem', () => {
  const sec = html.slice(html.indexOf('id="grav-decidir"'), html.indexOf('id="grav-pronto"'));
  const ids = [...sec.matchAll(/<button type="button" id="([^"]+)">([^<]+)</g)].map((m) => m[2]);
  // 3.0.1: o player (Ouvir, voltar e avançar 5 segundos) vem antes das decisões.
  assert.deepStrictEqual(ids, ['Voltar 5 segundos', 'Avançar 5 segundos', 'Descartar vídeo', 'Salvar e fechar', 'Salvar e continuar', 'Voltar']);
  assert.match(sec, /controles empilhados/);
});
test('1.1: memória do último efeito e fundo', () => {
  assert.match(grav, /st\.config\.fundo \|\| 'escritorio', \(v\) => salvarConfig\(\{ fundo: v \}\)/);
  assert.match(grav, /st\.config\.efeito \|\| 'borrar'/);
});
test('1.1: título e logo no Melhorar', () => {
  assert.match(html, /id="mel-abertura-titulo"/);
  assert.match(html, /id="mel-abertura-logo"/);
  const p = ABERT.planejarAbertura({ largura: 1920, altura: 1080, titulo: 'Meu vídeo', logo: null });
  assert.ok(p.titulo && p.titulo.linhas.length === 1);
});
test('1.1: imagens com o nome original primeiro (sem "Imagem N" antes do nome)', () => {
  assert.doesNotMatch(rend, /`Imagem \$\{i \+ 1\} de/);
  assert.doesNotMatch(rend, /imagem \$\{i \+ 1\}/);
  assert.match(rend, /`\$\{nomeDoArquivo\(caminho\)\}\$\{infoImagem\(caminho\)\}, posição/);
});
