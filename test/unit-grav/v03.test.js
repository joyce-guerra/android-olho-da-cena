'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const OB = require('../../src/objetos');
const TP = require('../../src/tempo');
const EQ = require('../../src/enquadramento');
const TX = require('../../src/textos');
const AJ = require('../../src/ajuste');
const MH = require('../../src/melhorar');
const RAIZ = path.join(__dirname, '..', '..');

// --- Objetos (Alt E) ---
test('objetos: nomes em português, sem pessoa, só com confiança, contados e com "e" no fim', () => {
  const r = OB.descreverObjetos([
    { rotulo: 'laptop', score: 0.8 }, { rotulo: 'cup', score: 0.7 }, { rotulo: 'cell phone', score: 0.66 },
    { rotulo: 'person', score: 0.95 }, { rotulo: 'book', score: 0.49 }, { rotulo: 'tv', score: 0.55 }]);
  assert.strictEqual(r.texto, 'Na imagem: notebook, xícara e celular.');
  assert.strictEqual(OB.descreverObjetos([{ rotulo: 'person', score: 0.99 }]).texto, '');
  assert.strictEqual(OB.descreverObjetos([]).texto, '');
  assert.strictEqual(OB.descreverObjetos([{ rotulo: 'book', score: 0.6 }, { rotulo: 'book', score: 0.7 }, { rotulo: 'cup', score: 0.5 }]).texto,
    'Na imagem: dois livros e xícara.');
  assert.strictEqual(OB.nomeDoObjeto('cup', 2), 'duas xícaras');
  assert.strictEqual(OB.nomeDoObjeto('cell phone', 3), 'três celulares');
  assert.strictEqual(OB.nomeDoObjeto('potted plant', 2), 'dois vasos de planta');
  assert.strictEqual(OB.nomeDoObjeto('desconhecido'), null);
  const muitos = ['laptop', 'cup', 'chair', 'book', 'clock', 'vase', 'bottle', 'keyboard'].map((r, i) => ({ rotulo: r, score: 0.9 - i * 0.01 }));
  assert.strictEqual(OB.descreverObjetos(muitos).itens.length, 6);
});
test('objetos: todos os 80 rótulos COCO (menos pessoa) têm nome', () => {
  const coco = 'bicycle,car,motorcycle,airplane,bus,train,truck,boat,traffic light,fire hydrant,stop sign,parking meter,bench,bird,cat,dog,horse,sheep,cow,elephant,bear,zebra,giraffe,backpack,umbrella,handbag,tie,suitcase,frisbee,skis,snowboard,sports ball,kite,baseball bat,baseball glove,skateboard,surfboard,tennis racket,bottle,wine glass,cup,fork,knife,spoon,bowl,banana,apple,sandwich,orange,broccoli,carrot,hot dog,pizza,donut,cake,chair,couch,potted plant,bed,dining table,toilet,tv,laptop,mouse,remote,keyboard,cell phone,microwave,oven,toaster,sink,refrigerator,book,clock,vase,scissors,teddy bear,hair drier,toothbrush'.split(',');
  assert.strictEqual(coco.length, 79);
  for (const c of coco) assert.ok(OB.nomeDoObjeto(c), c);
});
test('Alt E junta os objetos no fim da frase do enquadramento', () => {
  const r = EQ.descreverEnquadramento({ rostos: [{ x: 0.45, y: 0.2, w: 0.1, h: 0.18 }], brilho: 120, objetos: 'Na imagem: celular.' });
  assert.match(r.texto, /Na imagem: celular\.$/);
});

// --- Espelho ---
test('espelhada: os lados se invertem em relação à 0.2', () => {
  const rosto = [{ x: 0.1, y: 0.2, w: 0.12, h: 0.2 }]; // rosto no lado esquerdo da imagem
  const normal = EQ.descreverEnquadramento({ rostos: rosto, brilho: 120 });
  const esp = EQ.descreverEnquadramento({ rostos: rosto, brilho: 120, espelhada: true });
  assert.match(normal.texto, /para a sua direita\. Vá para a sua esquerda/);
  assert.match(esp.texto, /para a sua esquerda\. Vá para a sua direita/);
  const cortado = [{ x: 0, y: 0.2, w: 0.12, h: 0.2 }];
  assert.match(EQ.descreverEnquadramento({ rostos: cortado, brilho: 120 }).texto, /cortado à sua direita/);
  assert.match(EQ.descreverEnquadramento({ rostos: cortado, brilho: 120, espelhada: true }).texto, /cortado à sua esquerda/);
  const centro = [{ x: 0.44, y: 0.2, w: 0.12, h: 0.2 }];
  assert.strictEqual(EQ.descreverEnquadramento({ rostos: centro, brilho: 120, espelhada: true }).texto,
    EQ.descreverEnquadramento({ rostos: centro, brilho: 120 }).texto);
});
test('teste do espelho: mão direita levantada de um lado ou do outro', () => {
  const pose = (pulsoX) => {
    const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, v: 0.9 }));
    p[0] = { x: 0.5, y: 0.3, v: 0.99 }; p[11] = { x: 0.6, y: 0.5, v: 0.9 }; p[12] = { x: 0.4, y: 0.5, v: 0.9 };
    p[15] = { x: 0.6, y: 0.9, v: 0.9 }; p[16] = { x: 0.4, y: 0.9, v: 0.9 };
    p[pulsoX < 0.5 ? 16 : 15] = { x: pulsoX, y: 0.25, v: 0.9 };
    return p;
  };
  assert.strictEqual(EQ.testarEspelho(pose(0.3)), false); // aparece à esquerda da imagem: câmera não espelha
  assert.strictEqual(EQ.testarEspelho(pose(0.7)), true);
  const nenhuma = pose(0.3); nenhuma[16] = { x: 0.3, y: 0.9, v: 0.9 };
  assert.strictEqual(EQ.testarEspelho(nenhuma), null);
  const duas = pose(0.3); duas[15] = { x: 0.7, y: 0.25, v: 0.9 };
  assert.strictEqual(EQ.testarEspelho(duas), null);
  assert.strictEqual(EQ.testarEspelho(null), null);
});

// --- Nomes ---
test('nome do vídeo melhorado: dia-mês, proporção, 30 quadros e o fundo; sem parênteses', () => {
  const d = new Date(2026, 9, 27, 10);
  assert.strictEqual(TP.nomeMelhorado3({ data: d, formato: 'vertical', sufixo: 'fundo praia' }), '27-10 vertical 30 quadros fundo praia.mp4');
  assert.strictEqual(TP.nomeMelhorado3({ data: d, formato: 'horizontal', sufixo: 'fundo borrado' }), '27-10 horizontal 30 quadros fundo borrado.mp4');
  assert.strictEqual(TP.nomeMelhorado3({ data: new Date(2026, 0, 5), formato: 'quadrado', sufixo: 'fundo carro', amostra: true }), '05-01 quadrado 30 quadros fundo carro amostra.mp4');
  assert.strictEqual(TP.nomeMelhorado3({ data: d, formato: 'quadrado', audio: true }), '27-10 quadrado 30 quadros áudio melhorado.mp4');
  assert.doesNotMatch(TP.nomeMelhorado3({ data: d, formato: 'vertical', sufixo: 'fundo neutro' }), /[()]/);
  const existentes = new Set(['a.mp4', 'a 2.mp4']);
  assert.strictEqual(TP.nomeSemRepetir('a.mp4', (n) => existentes.has(n)), 'a 3.mp4');
  assert.strictEqual(TP.nomeSemRepetir('b.mp4', () => false), 'b.mp4');
  // O nome do original não mudou.
  assert.match(TP.nomeDoVideo(d, 'horizontal'), /^Vídeo 2026-10-27 10h00m00s \(horizontal\)\.mp4$/);
});

// --- Textos: neutros, sem psicologia, 4 fundos ---
test('textos: sem psicologia e sem flexão no feminino para quem usa', () => {
  const todos = JSON.stringify(TX) + fs.readFileSync(path.join(RAIZ, 'ui', 'gravar.js'), 'utf8') + fs.readFileSync(path.join(RAIZ, 'ui', 'renderer.js'), 'utf8') + fs.readFileSync(path.join(RAIZ, 'ui', 'index.html'), 'utf8') +
    fs.readFileSync(path.join(RAIZ, 'src', 'enquadramento.js'), 'utf8');
  // "pronta" concordando com coisa (parte do vídeo), não com quem usa, vem do Gerador e pode ficar.
  const todosSemCoisas = todos.replace(/parte já estava pronta|partes já estavam prontas|fundo desfocado, pronta/g, '');
  assert.doesNotMatch(todosSemCoisas, /você (está|fica|estiver) \w+ad[ao]|sentad[ao]|\bpronta\b|bem-vind[ao]|obrigad[ao]/i);
  assert.doesNotMatch(todos, /psic|consultório|terap|paciente/i);
  assert.ok(TX.FUNDOS.find((f) => f.valor === 'carro' && /irreverente|bem-humorad/.test(f.descricao)));
  assert.strictEqual(TX.FUNDOS.find((f) => f.valor === 'escritorio').nome, 'Escritório');
  assert.strictEqual(TX.FUNDOS.find((f) => f.valor === 'escritorio').sufixo, 'fundo escritório');
  const g = TX.FUNDOS.find((f) => f.valor === 'grafite');
  assert.strictEqual(g.nome, 'Grafite com neon');
  assert.strictEqual(g.sufixo, 'fundo grafite');
});

// --- Ajuste do áudio: no Olho da Cena, fica no Editar vídeo (não no Melhorar) ---
test('ajuste do áudio fica no Editar vídeo, não na tela Melhorar', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'ui', 'index.html'), 'utf8');
  const melhorar = html.slice(html.indexOf('id="tela-melhorar"'), html.indexOf('id="tela-gerar"'));
  assert.doesNotMatch(melhorar, /eq-volume/);
  assert.match(html.slice(html.indexOf('id="tela-cortar"')), /id="c-eq-volume"/);
  // 1.3.1: 'nenhum' voltou como "Fundo original", só no caminho da gravação (sem controles de áudio no Melhorar).
  assert.ok(fs.existsSync(path.join(RAIZ, 'ideias', 'melhorar-audio', 'renderer.js')));
});
test('ajuste de áudio guardado: filtros iguais aos do Voz da Cena', () => {
  assert.strictEqual(AJ.filtroAudio({}), 'anull');
  assert.strictEqual(AJ.filtroAudio({ volume: 1.2, velocidade: 2.5, eq: { graves: -2, medios: 2, agudos: 3 } }),
    'bass=g=-2:f=200:t=s:w=0.6,equalizer=f=1500:t=q:w=1:g=2,treble=g=3:f=5000:t=s:w=0.6,atempo=2,atempo=1.2500,volume=1.200');
  assert.strictEqual(AJ.nomeDoEq({ graves: -4, medios: 0, agudos: 5 }), 'Menos abafada');
  assert.strictEqual(AJ.decibeisFalados(-1), 'menos 1 decibel');
  // Sem ajuste, o Melhorar continua igual à 0.2 (som copiado do original).
  const a = MH.argumentosCompor({ original: 'o.mp4', saida: 's.mp4', efeito: 'borrar', largura: 1920, altura: 1080, mw: 256, mh: 144, inicio: 0, duracao: 5, qualidade: 'alta' });
  assert.ok(a.includes('0:a:0?'));
  assert.strictEqual(a[a.indexOf('-t', a.indexOf('-filter_complex')) + 1], '5');
});

// --- Bipes: não vão para a gravação ---
test('bipes tocam só na saída de som, nunca no destino da gravação; sem silenciar no Alt E', () => {
  const r = fs.readFileSync(path.join(RAIZ, 'ui', 'gravar.js'), 'utf8');
  const bipe = r.slice(r.indexOf('function bipe('), r.indexOf('// --- Quadro do vídeo'));
  assert.match(bipe, /g\.connect\(ctx\.destination\)/);
  assert.doesNotMatch(bipe, /st\.destino/);
  assert.doesNotMatch(r, /silenciarGravacao|devolverSom/);
  for (const t of ['gravar', 'parar', 'pausar', 'retomar']) assert.match(r, new RegExp(`bipe\\('${t}'\\)`));
});

test('modelo de objetos presente e é o escolhido', () => {
  const w = fs.readFileSync(path.join(RAIZ, 'ui', 'visao-worker.js'), 'utf8');
  const m = /MODELO_OBJETOS = '([^']+)'/.exec(w)[1];
  assert.ok(fs.statSync(path.join(RAIZ, 'vendor', 'visao', 'modelos', m)).size > 1e6);
});

test('leitura sombreada: setas (as quatro), Home e End andam pelas frases', () => {
  const r = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'ui', 'gravar.js'), 'utf8');
  assert.match(r, /activeElement === \$\('frase'\) && nada && TECLAS_FRASE\[e\.key\]/);
  for (const k of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.match(r, new RegExp(k + ': '));
  assert.doesNotMatch(r, /testarEspelho/);
});
