'use strict';
// Olho da Cena 1.0: avisos novos do Alt E, ajuste do áudio no Editar, fades e textos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const EQ = require('../../src/enquadramento');
const CO = require('../../src/cortar');
const AJ = require('../../src/ajuste');
const { escalarSrt } = require('../../src/render');
const TX = require('../../src/textos');
const RAIZ = path.join(__dirname, '..', '..');

/** Pose de 33 pontos, todos invisíveis, com alguns pontos definidos. */
function pose(pontos) {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 2, v: 0 }));
  for (const [i, x, y, v = 0.9] of pontos) p[i] = { x, y, v };
  return p;
}
const CORPO = [[0, 0.5, 0.35], [7, 0.56, 0.33], [8, 0.44, 0.33], [11, 0.62, 0.6], [12, 0.38, 0.6]];

test('Alt E: mão na frente do rosto (com e sem caixa do rosto)', () => {
  const rosto = { x: 0.42, y: 0.2, w: 0.16, h: 0.28 };
  assert.strictEqual(EQ.maoNoRosto(pose([...CORPO, [19, 0.5, 0.3]]), rosto, 1920, 1080), true);
  assert.strictEqual(EQ.maoNoRosto(pose([...CORPO, [19, 0.85, 0.8]]), rosto, 1920, 1080), false);
  // Sem rosto: perto do nariz.
  assert.strictEqual(EQ.maoNoRosto(pose([...CORPO, [20, 0.51, 0.36]]), null, 1920, 1080), true);
  // Mão pouco visível não conta.
  assert.strictEqual(EQ.maoNoRosto(pose([...CORPO, [19, 0.5, 0.3, 0.2]]), rosto, 1920, 1080), false);
  const d = EQ.descreverEnquadramento({ rostos: [rosto], pose: pose([...CORPO, [19, 0.5, 0.3]]) });
  assert.strictEqual(d.dados.maoNoRosto, true);
  assert.match(d.texto, /Mão na frente do rosto\./);
});

test('Alt E: braço cortado na lateral, do ponto de vista da pessoa, respeitando o espelho', () => {
  const rosto = { x: 0.42, y: 0.2, w: 0.16, h: 0.28 };
  // Cotovelo na borda esquerda da imagem = direita da pessoa (câmera sem espelho).
  const p = pose([...CORPO, [14, 0.0, 0.7]]);
  assert.deepStrictEqual(EQ.bracosCortados(p), ['direita']);
  let d = EQ.descreverEnquadramento({ rostos: [rosto], pose: p });
  assert.deepStrictEqual(d.dados.bracoCortado, ['direita']);
  assert.match(d.texto, /Braço cortado na lateral, à sua direita/);
  // Imagem espelhada: o mesmo ponto fica do outro lado.
  d = EQ.descreverEnquadramento({ rostos: [rosto], pose: p, espelhada: true });
  assert.match(d.texto, /Braço cortado na lateral, à sua esquerda/);
  // Dois lados.
  d = EQ.descreverEnquadramento({ rostos: [rosto], pose: pose([...CORPO, [14, -0.05, 0.7], [15, 1.02, 0.8]]) });
  assert.match(d.texto, /dos dois lados/);
  // Braço cortado embaixo não é corte lateral; sem ombros, nada.
  assert.deepStrictEqual(EQ.bracosCortados(pose([...CORPO, [14, 0.3, 1.2]])), []);
  assert.deepStrictEqual(EQ.bracosCortados(pose([[14, 0.0, 0.7]])), []);
  // Braços dentro da imagem: nada.
  d = EQ.descreverEnquadramento({ rostos: [rosto], pose: pose([...CORPO, [13, 0.7, 0.8], [14, 0.3, 0.8]]) });
  assert.doesNotMatch(d.texto, /Braço cortado|Mão na frente/);
});

test('velocidade: legenda acompanha (tempos divididos pela velocidade)', () => {
  const srt = '1\n00:00:10,000 --> 00:00:12,500\nOi\n';
  assert.strictEqual(escalarSrt(srt, 1), srt);
  assert.match(escalarSrt(srt, 2), /00:00:05,000 --> 00:00:06,250/);
  assert.match(escalarSrt(srt, 0.5), /00:00:20,000 --> 00:00:25,000/);
});

test('Editar: sem ajuste nem fade, o comando de salvar é o mesmo de antes', () => {
  const base = { entrada: 'e.mp4', mantidos: [{ de: 0, ate: 5 }, { de: 8, ate: 12 }], temAudio: true, saida: 's.mp4', duracao: 12, legenda: null, altura: 1080 };
  const a = CO.argsCortar(base).join(' ');
  const b = CO.argsCortar({ ...base, ajuste: AJ.normalizarAjuste({}), fadesJuncao: null }).join(' ');
  assert.strictEqual(a, b);
  assert.doesNotMatch(a, /setpts=PTS\/|atempo|volume=/);
});

test('Editar: ajuste muda imagem e som juntos (setpts + atempo) e aplica volume e equalização', () => {
  const base = { entrada: 'e.mp4', mantidos: [{ de: 0, ate: 5 }, { de: 8, ate: 12 }], temAudio: true, saida: 's.mp4', duracao: 12, legenda: null, altura: 1080 };
  const a = CO.argsCortar({ ...base, ajuste: { volume: 1.5, velocidade: 1.25, eq: { graves: -2, medios: 2, agudos: 3 } } });
  const fc = a[a.indexOf('-filter_complex') + 1];
  assert.match(fc, /setpts=PTS\/1\.2500/);
  assert.match(fc, /atempo=1\.2500/);
  assert.match(fc, /volume=1\.500/);
  assert.match(fc, /bass=g=-2/);
  // Os mapas usam os rótulos finais.
  assert.ok(a.includes('[vvel]') || a.some((x) => /\[v/.test(x)), a.join(' '));
});

test('Editar: suavizar fades troca o micro-fade pelo fade da junção, sem passar do trecho', () => {
  const mantidos = [{ de: 0, ate: 5 }, { de: 8, ate: 12 }, { de: 15, ate: 20 }];
  const fj = CO.calcularFadesDeJuncao(mantidos);
  assert.strictEqual(fj.length, 2);
  const meio = CO.fadesDoTrecho(1, 3, mantidos[1], 4, 20, fj);
  assert.match(meio[0], new RegExp(`afade=t=in:st=0:d=${Number(fj[0].toFixed(3))}`));
  assert.match(meio[1], /afade=t=out/);
  const semFade = CO.fadesDoTrecho(1, 3, mantidos[1], 4, 20, null);
  assert.match(semFade[0], new RegExp(`d=${CO.MICRO_FADE}`));
  // Começo do vídeo e fim do vídeo não ganham fade.
  assert.strictEqual(CO.fadesDoTrecho(0, 3, mantidos[0], 5, 20, fj).filter((f) => /t=in/.test(f)).length, 0);
  assert.strictEqual(CO.fadesDoTrecho(2, 3, mantidos[2], 5, 20, fj).filter((f) => /t=out/.test(f)).length, 0);
  const v = CO.argsCortar({ entrada: 'e.mp4', mantidos, temAudio: true, saida: 's.mp4', duracao: 20, altura: 1080, fadesJuncao: fj }).join(' ');
  assert.match(v, new RegExp(`afade=t=in:st=0:d=${Number(fj[0].toFixed(3))}`));
});

test('Salvar áudio: fades separados e ajuste', () => {
  const mantidos = [{ de: 0, ate: 5 }, { de: 8, ate: 12 }];
  const a = CO.argsCortarAudio({ entrada: 'e.mp4', mantidos, duracao: 12, saida: 's.mp3', fadesSeparados: CO.calcularFadesDeJuncao(mantidos), ajuste: { volume: 0.5 } }).join(' ');
  assert.match(a, /afade=t=out/);
  assert.match(a, /volume=0\.500/);
});

test('textos: escritório e grafite; espelho sem botão de teste', () => {
  assert.deepStrictEqual(TX.FUNDOS.map((f) => f.valor), ['escritorio', 'estudio', 'biblioteca', 'sala-de-aula', 'indiano', 'grafite', 'capela', 'carro', 'carro-masculino', 'estacao-espacial', 'anime', 'quarto-feminino', 'quarto-masculino', 'sala', 'sala-dos-gatos', 'jardim', 'praia', 'ceu-estrelado', 'cafe']);
  assert.match(TX.FUNDOS.find((f) => f.valor === 'grafite').descricao, /neon/i);
  assert.doesNotMatch(TX.ESPELHO.descricao, /Testar o espelho|0\.2/);
  const html = fs.readFileSync(path.join(RAIZ, 'ui', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /Testar o espelho|testar-espelho/);
  assert.match(html, /<title>Olho da Cena<\/title>/);
  // 3.0: menu inicial em árvore, com o grupo Vídeo nessa ordem e com esses atalhos.
  const ordem = [...html.matchAll(/id="ir-(gravar|gerar|cortar|dividir|juntar|lote)" data-tecla="(\w)"/g)].map((m) => m[1] + m[2]);
  assert.deepStrictEqual(ordem, ['gravarr', 'gerarg', 'cortare', 'dividird', 'juntarj', 'lotel']);
  assert.doesNotMatch(html.slice(html.indexOf('id="tela-inicial"'), html.indexOf('id="tela-gravar"')), /Melhorar/);
});
