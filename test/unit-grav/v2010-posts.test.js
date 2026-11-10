'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../../src/fotos');

// Medidor simples, sem canvas: cada letra mede metade do tamanho da fonte.
const ctx = () => { const c = { font: '600 40px x', measureText(t) { const n = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)[1]); return { width: String(t).length * n * 0.5 }; } }; return c; };

test('formatos: nomes, descrição completa e proporções que existem', () => {
  assert.deepStrictEqual(F.FORMATOS_POST.map((f) => f.nome), ['Post único', 'Story único', 'Carrossel', 'Stories em sequência', 'Kit de data comemorativa']);
  assert.deepStrictEqual(F.FORMATOS_POST.filter((f) => f.disponivel).map((f) => f.valor), ['post-unico', 'story-unico', 'carrossel', 'stories-sequencia']); // o kit saiu da lista
  assert.deepStrictEqual(F.FORMATOS_POST.filter((f) => f.multi).map((f) => [f.valor, f.min, f.max]), [['carrossel', 2, 20], ['stories-sequencia', 2, 20]]);
  for (const f of F.FORMATOS_POST) {
    assert.match(f.texto, /Tom: .*Indicação: .*Contraindicação: .*Descrição: .*Você vai precisar de: .*Capa: .*Onde serve: /);
    assert.ok(f.proporcoes.every((p) => F.acharProporcaoPost(p)));
  }
  assert.strictEqual(F.acharFormatoPost('carrossel').max, 20);
  assert.match(F.acharFormatoPost('story-unico').texto, /Só o Instagram.*Não serve no Threads/);
  assert.match(F.acharFormatoPost('post-unico').texto, /Instagram e Threads/);
});
test('proporções do post: tamanhos do Instagram e margens do story', () => {
  const [a, b, c] = ['retrato-45', 'quadrada', 'story'].map(F.acharProporcaoPost);
  assert.deepStrictEqual([a.largura, a.altura, b.largura, b.altura, c.largura, c.altura], [1080, 1350, 1080, 1080, 1080, 1920]);
  for (const p of [a, b, c]) assert.match(p.texto, /Indicação: .*Contraindicação: .*Descrição: /);
  const m = F.acharMoldura('grafite-fio');
  const cx = F.caixaDoPost(1080, 1920, m, c);
  assert.ok(cx.y >= 250 && cx.y + cx.h <= 1920 - 250 + 0.01, 'o texto fica fora dos 250 pontos de cima e de baixo');
  assert.ok(cx.x >= 100 && cx.x + cx.w <= 1080 - 100, 'e longe das bordas dos lados');
  const cq = F.caixaDoPost(1080, 1080, m, b);
  assert.ok(cq.y < 100, 'fora do story, usa quase a imagem toda');
});
test('o texto cresce quando é curto e encolhe quando é longo, e avisa quando não cabe', () => {
  const m = F.acharMoldura('azul-calmo'), p = F.acharProporcaoPost('quadrada'), cx = F.caixaDoPost(1080, 1080, m, p);
  const curto = F.ajustarTextoPost(ctx(), 'Oi, tudo bem?', cx, 1080), longo = F.ajustarTextoPost(ctx(), 'palavra '.repeat(18), cx, 1080);
  assert.ok(curto.ok && longo.ok && curto.tam > longo.tam);
  assert.ok(longo.tam >= Math.round(1080 * 0.055), 'nunca abaixo do limite de leitura no celular');
  assert.strictEqual(F.ajustarTextoPost(ctx(), 'palavra '.repeat(2000), cx, 1080).ok, false);
  assert.ok(curto.linhas.length >= 1 && F.ajustarTextoPost(ctx(), 'a\n\nb', cx, 1080).linhas.length === 2, 'parágrafos do texto colado são mantidos');
  const enorme = F.ajustarTextoPost(ctx(), 'x'.repeat(500), cx, 1080);
  assert.ok(enorme.linhas.length > 1, 'palavra gigante é quebrada em vez de vazar da caixa');
});
test('capacidade: o story comporta mais linhas que o quadrado, e o limite é o da leitura no celular', () => {
  const m = F.acharMoldura('azul-calmo');
  const q = F.capacidadePost(ctx(), 1080, 1080, m, F.acharProporcaoPost('quadrada'));
  const r = F.capacidadePost(ctx(), 1080, 1350, m, F.acharProporcaoPost('retrato-45'));
  const s = F.capacidadePost(ctx(), 1080, 1920, m, F.acharProporcaoPost('story'));
  assert.ok(q.maxCaracteres < r.maxCaracteres && r.maxCaracteres < s.maxCaracteres);
  for (const c of [q, r, s]) assert.ok(c.maxCaracteres > 50 && c.maxLinhas > 5 && c.tamMin === Math.round(1080 * 0.055));
  assert.match(F.falaDaCapacidade(F.acharProporcaoPost('quadrada'), q), /^Nesta moldura, em Quadrada, 1 por 1, cabem cerca de \d+ caracteres, em até \d+ linhas\. É o limite para ler bem no celular\. Texto maior fica melhor em mais de um slide\.$/);
});
test('molduras do post: sem cenário, sem as que não combinam, com a seção de minimalistas e aviso', () => {
  const p = F.acharProporcaoPost('retrato-45'), r = F.moldurasDoPost(ctx(), p);
  assert.strictEqual(F.MOLDURAS.length, 37);
  assert.strictEqual(r.disponiveis.length, 27);
  assert.ok(['parque', 'futurista', 'outono', 'escritorio', 'praia-lua-cheia'].every((v) => !r.disponiveis.some((m) => m.valor === v)));
  assert.ok(['serpentinas', 'estrelas', 'tropical', 'natal', 'pascoa', 'confete'].every((v) => r.disponiveis.some((m) => m.valor === v)), 'as de data entram no post');
  const datas = r.categorias.find((c) => c.nome === 'Datas comemorativas');
  assert.deepStrictEqual(datas && datas.itens.sort(), ['ano-novo', 'natal', 'pascoa', 'sao-joao', 'serpentinas']);
  const festas = r.categorias.find((c) => c.valor === 'festas');
  assert.deepStrictEqual(festas && festas.itens.sort(), ['casamento', 'confete']);
  const vibes = r.categorias.find((c) => c.valor === 'vibes');
  const comem = vibes && vibes.subs.find((s) => s.nome === 'Comemorações');
  assert.deepStrictEqual(comem && comem.itens.sort(), ['coracoes', 'estrelas'], 'as comemorações sem data ficam em Minhas vibes');
  assert.strictEqual(r.escondidas.length, 10);
  const lisas = r.categorias.find((c) => c.valor === 'lisas');
  assert.ok(lisas && lisas.itens.length === 5 && lisas.nome === 'Minimalistas e lisas');
  assert.ok(r.disponiveis.some((m) => m.valor === 'preto-vermelho'), 'o preto aparece no post');
  assert.ok(!F.moldurasPara('retrato').disponiveis.some((m) => m.valor === 'preto-vermelho'), 'e não aparece na foto');
  assert.match(F.avisoMoldurasPost(r), /^27 molduras compatíveis com este formato\. 10 ficaram de fora, porque .*desenhos no fundo/);
  const s = F.moldurasDoPost(ctx(), F.acharProporcaoPost('story'));
  assert.ok(s.escondidas.some((x) => x.moldura.valor === 'medalha' && /não combina/.test(x.motivo)), 'medalha não combina com stories');
  assert.ok(F.moldurasDoPost(ctx(), F.acharProporcaoPost('quadrada')).disponiveis.some((m) => m.valor === 'medalha'));
});
test('as 5 molduras lisas novas têm tom, indicação, contraindicação e descrição', () => {
  for (const v of ['preto-vermelho', 'azul-calmo', 'rosa-quartzo', 'verde-sage', 'manteiga']) {
    const m = F.acharMoldura(v);
    assert.ok(m && m.tom && /Tom: .*Indicação: .*Contraindicação: .*Descrição: /.test(m.texto), v);
    assert.strictEqual(m.fundoReal, 'substitui');
  }
});
test('nomes de arquivo e de pasta: número, descrição, sem caracteres proibidos, nunca sobrescreve', () => {
  assert.strictEqual(F.nomeDoArquivoPost({ numero: 1, moldura: 'grafite-fio', texto: 'Hoje eu respirei fundo: e deu certo!' }), '01-texto-grafite-com-fio-branco-hoje-eu-respirei-fundo-e-deu.jpg');
  assert.strictEqual(F.nomeDoArquivoPost({ numero: 12, moldura: 'azul-calmo', texto: 'a/b\\c*d?' , rotulo: 'capa' }), '12-capa-azul-com-fio-branco-a-b-cd.jpg');
  assert.ok(F.nomeDoArquivoPost({ numero: 3, moldura: 'marinho-dourado', texto: 'palavra '.repeat(40) }).length <= 104);
  assert.doesNotMatch(F.nomeDoArquivoPost({ numero: 2, moldura: 'natal', texto: 'Bom dia, e bom recomeço.' }), /[,:;?*"<>|\\/]/);
  assert.strictEqual(F.nomeDaPastaPost('  Episódio 12: a/b?  '), 'Episódio 12 a b');
  assert.strictEqual(F.nomeDaPastaPost('CON'), 'CON post');
  assert.strictEqual(F.nomeDaPastaPost('fim...'), 'fim');
  assert.strictEqual(F.nomeDaPastaPost('x'.repeat(100)).length, 60);
  assert.strictEqual(F.proximoNumeroPost([]), 1);
  assert.strictEqual(F.proximoNumeroPost(['01-a.jpg', '03-b.jpg', 'legenda.txt', 'x.jpg']), 4);
  assert.strictEqual(F.proximoNumeroPost(['09-a.jpg', '10-b.jpg']), 11);
});
test('descrição automática do post fala moldura, linhas, cor da letra e o texto', () => {
  const p = F.acharProporcaoPost('quadrada');
  const d = F.descricaoDoPost({ moldura: 'preto-vermelho', texto: 'Bom dia', prop: p, resultado: { tam: 130, linhas: 2, escura: true } });
  assert.match(d, /Imagem na proporção quadrada, 1 por 1, de 1080 por 1080 pontos\. Moldura Preto com fio vermelho: .* O texto ocupa 2 linhas, centralizado, em letras claras grandes sobre fundo escuro\. Texto: Bom dia$/);
  assert.doesNotMatch(F.descricaoDoPost({ moldura: 'natal', texto: 'x', prop: p, resultado: { tam: 50, linhas: 1, escura: false } }), /faixa translúcida/);
  assert.match(F.descricaoDoPost({ moldura: 'natal', texto: 'x', prop: p, resultado: { tam: 50, linhas: 1, escura: false } }), /uma linha.*pequenas/);
});

test('marcações: título, subtítulo, destaque, listas e parágrafos viram blocos', () => {
  const t = '# Título\n\nUm parágrafo com *destaque* e **negrito**.\nSegunda linha.\n\n## Sub\n\n1. um\n2. dois\n\n- a\n- b\n\n* c\n* d';
  const b = F.parseTextoPost(t);
  assert.deepStrictEqual(b.map((x) => x.tipo), ['h1', 'p', 'h2', 'lista', 'lista', 'lista']);
  assert.deepStrictEqual(b[1].linhas, ['Um parágrafo com *destaque* e **negrito**.', 'Segunda linha.']);
  assert.deepStrictEqual(b[3].itens.map((i) => i.marca), ['1.', '2.']);
  assert.deepStrictEqual(b[4].itens.map((i) => i.marca), ['•', '•']);
  assert.strictEqual(F.parseTextoPost('*palavra* no começo').length, 1, 'asterisco colado na palavra é destaque, não lista');
  assert.strictEqual(F.parseTextoPost('*palavra* no começo')[0].tipo, 'p');
  assert.strictEqual(F.semMarcasPost('# T\n*a* **b**\n- x\n1. y'), 'T\na b\nx\ny');
  assert.strictEqual(F.resumoDoTexto('# Bom dia: *a/b*, tudo bem com você?', 4), 'Bom dia a b,');
  assert.deepStrictEqual(F.parseTextoPost('   \n\n'), []);
});
test('o título é maior que o corpo, e o texto com marcações cabe ou não cabe como o texto simples', () => {
  const m = F.acharMoldura('azul-calmo'), p = F.acharProporcaoPost('quadrada'), cx = F.caixaDoPost(1080, 1080, m, p), c = ctx();
  const a = F.ajustarTextoPost(c, '# Título\n\nCorpo do texto com *destaque*.', cx, 1080);
  assert.ok(a.ok && a.linhas.length >= 2);
  const h = a.linhas.find((l) => l.peso === 800), corpo = a.linhas.find((l) => l.peso === 500);
  assert.ok(h.tam > corpo.tam && h.alinha === 'centro');
  assert.ok(a.linhas.some((l) => l.segs.some((s) => s.b)), 'destaque em negrito');
  const lista = F.ajustarTextoPost(c, '1. um\n2. dois', cx, 1080);
  assert.ok(lista.linhas.every((l) => l.alinha === 'esq') && lista.linhas[0].marca === '1.' && lista.linhas[1].marca === '2.');
  assert.strictEqual(F.ajustarTextoPost(c, 'palavra '.repeat(2000), cx, 1080).ok, false);
  assert.strictEqual(F.ajustarTextoPost(c, '', cx, 1080).ok, true);
});
test('dividir em slides: a estrutura do texto manda, e nada se perde', () => {
  const m = F.acharMoldura('verde-sage'), p = F.acharProporcaoPost('quadrada'), cx = F.caixaDoPost(1080, 1080, m, p), c = ctx();
  const cabe = (t) => F.cabeNoMinimoPost(c, t, cx, 1080);
  assert.deepStrictEqual(F.dividirEmSlides(c, '   ', cx, 1080), { slides: [], modo: 'vazio' });
  assert.deepStrictEqual(F.dividirEmSlides(c, 'Um texto curto.', cx, 1080), { slides: ['Um texto curto.'], modo: 'um' });
  // um parágrafo por slide, mesmo que cada um seja curtinho
  const r1 = F.dividirEmSlides(c, 'Primeiro.\n\nSegundo.\n\nTerceiro.', cx, 1080);
  assert.deepStrictEqual(r1.slides, ['Primeiro.', 'Segundo.', 'Terceiro.']); assert.strictEqual(r1.modo, 'blocos');
  // título vai junto do bloco seguinte
  const r2 = F.dividirEmSlides(c, '# Abertura\n\nO começo da história.\n\n## Parte 2\n\n1. um\n2. dois\n\nFim.', cx, 1080);
  assert.deepStrictEqual(r2.slides, ['# Abertura\n\nO começo da história.', '## Parte 2\n\n1. um\n2. dois', 'Fim.']);
  // título sozinho no fim vira slide
  assert.deepStrictEqual(F.dividirEmSlides(c, 'A.\n\n# Fim', cx, 1080).slides, ['A.', '# Fim']);
  // parágrafo longo é dividido nas frases
  const frase = 'Respirar fundo antes de responder é o melhor jeito de não se arrepender depois. ';
  const longo = frase.repeat(14);
  const r3 = F.dividirEmSlides(c, longo, cx, 1080);
  assert.strictEqual(r3.modo, 'enchendo'); assert.ok(r3.slides.length >= 3 && r3.slides.every(cabe));
  assert.strictEqual(r3.slides.join(' ').replace(/\s+/g, ' '), longo.trim(), 'nenhuma palavra se perde nem se repete');
  assert.ok(r3.slides.slice(0, -1).every((x) => /[.!?…]$/.test(x)), 'cortes nas frases');
  // lista grande é dividida entre os itens, mantendo os números
  const itens = Array.from({ length: 30 }, (_, i) => `${i + 1}. item número ${i + 1} da lista`).join('\n');
  const r4 = F.dividirEmSlides(c, itens, cx, 1080);
  assert.ok(r4.slides.length >= 2 && r4.slides.every(cabe) && r4.slides.join('\n') === itens);
  // sem pontuação, parte por palavras
  const r5 = F.dividirEmSlides(c, 'palavra '.repeat(200), cx, 1080);
  assert.ok(r5.slides.length >= 2 && r5.slides.every(cabe) && r5.slides.join(' ') === 'palavra '.repeat(200).trim());
  // título junto do primeiro pedaço de um parágrafo grande
  const r6 = F.dividirEmSlides(c, '# Capítulo\n\n' + longo, cx, 1080);
  assert.ok(r6.slides[0].startsWith('# Capítulo\n\n') && r6.slides.slice(1).every((x) => !x.startsWith('#')) && r6.slides.every(cabe));
});
test('moldura soPost: o preto não aparece na foto, só no post', () => {
  assert.strictEqual(F.acharMoldura('preto-vermelho').soPost, true);
  for (const pr of ['quadrada', 'feed', 'retrato', 'cartao', 'stories', 'capa', 'capa-quadrada']) assert.ok(!F.moldurasPara(pr).disponiveis.some((m) => m.soPost), pr);
});

test('figurinhas: rótulo com a frase e o que mostra, e quatro detalhes que abrem um a um', () => {
  assert.ok(F.FIGURINHAS.every((f) => f.legenda && f.rotulo === `“${f.legenda}” ${f.nome}.`));
  assert.strictEqual(F.acharFigurinha('n-corredor').rotulo, '“A linha de chegada é só onde o descanso começa a cobrar juros.” Corredor em salto cortado pela linha de chegada.');
  for (const f of F.FIGURINHAS) {
    assert.deepStrictEqual(f.detalhes.map((d) => d.r), ['Tom', 'Indicação', 'Descrição', 'Contraindicação'], f.valor);
    assert.ok(f.detalhes.every((d) => d.t.length > 3 && /\.$/.test(d.t) && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(d.t)), f.valor);
  }
});
test('figurinha combinando com a moldura: grupos e estilos da tabela aprovada', () => {
  const grupos = F.GRUPOS_DE_MOLDURA_POST;
  assert.deepStrictEqual(grupos.sobria, ['grafite-fio', 'marinho-dourado', 'branco-gelo', 'madeira-quadro', 'revista', 'preto-vermelho']);
  assert.deepStrictEqual(grupos.lisa, ['azul-calmo', 'rosa-quartzo', 'verde-sage', 'manteiga']);
  assert.strictEqual(grupos.afetiva.length, 9);
  const todos = Object.values(grupos).flat();
  const r = F.moldurasDoPost(ctx(), F.acharProporcaoPost('quadrada'));
  assert.ok(r.disponiveis.every((m) => todos.includes(m.valor)), 'toda moldura do post está num grupo');
  const nomeDe = (v) => F.categoriasDeFigurinhasPara(v).map((c) => c.valor);
  assert.deepStrictEqual(nomeDe('grafite-fio'), ['classicas', 'minimalista']);
  assert.deepStrictEqual(F.figurinhasParaMoldura('grafite-fio').filter((v) => !v.startsWith('n-')).sort(), ['balao', 'caneta', 'livro', 'maquina', 'papeis', 'xicara']);
  assert.deepStrictEqual(nomeDe('preto-vermelho'), ['classicas', 'anime', 'minimalista', 'jogos', 'rpg']);
  assert.deepStrictEqual(nomeDe('azul-calmo'), ['classicas', 'retro', 'anime', 'minimalista', 'jogos', 'rpg']);
  assert.deepStrictEqual(nomeDe('aquarela'), ['classicas', 'retro', 'vida-real', 'minimalista']);
  const mini = F.categoriasDeFigurinhasPara('aquarela').find((c) => c.valor === 'minimalista');
  assert.deepStrictEqual(mini.subs.map((s) => s.valor), ['mini-musica'], 'só as minimalistas de música nas afetivas');
  assert.deepStrictEqual(F.figurinhasParaMoldura('medalha'), []);
  assert.deepStrictEqual(F.categoriasDeFigurinhasPara('medalha'), []);
  assert.ok(!F.figurinhasParaMoldura('grafite-fio').some((v) => v.startsWith('r-') || v.startsWith('a-') || v.startsWith('g-')), 'nada de retrô, anime ou RPG nas sóbrias');
  assert.ok(F.figurinhasParaMoldura('preto-vermelho').includes('g-mago') && !F.figurinhasParaMoldura('grafite-fio').includes('g-mago'));
  assert.ok(F.figurinhasParaMoldura('manteiga').includes('r-golden'));
});
test('a figurinha ocupa um espaço embaixo, e o texto fica acima dela', () => {
  const m = F.acharMoldura('azul-calmo'), p = F.acharProporcaoPost('quadrada');
  const sem = F.caixaDoPost(1080, 1080, m, p), com = F.caixaDoPost(1080, 1080, m, p, 'coracao'), retro = F.caixaDoPost(1080, 1080, m, p, 'r-golden');
  assert.ok(com.h < sem.h && retro.h < com.h, 'a figurinha retrô é maior que a clássica');
  assert.strictEqual(com.y, sem.y); assert.ok(com.fig && Math.abs(com.fig.cx - (com.x + com.w / 2)) < 0.01);
  assert.ok(com.fig.cy - com.fig.t / 2 >= com.y + com.h - 0.01, 'o selo começa onde o texto termina');
  const s = F.acharProporcaoPost('story'), cs = F.caixaDoPost(1080, 1920, m, s, 'r-golden');
  assert.ok(cs.fig.cy + cs.fig.t / 2 <= 1920 - 250 + 0.01, 'no story, a figurinha também fica fora dos 250 pontos de baixo');
  const c = ctx();
  assert.ok(F.capacidadePost(c, 1080, 1080, m, p, 'r-golden').maxCaracteres < F.capacidadePost(c, 1080, 1080, m, p).maxCaracteres, 'com figurinha cabe menos texto');
  assert.match(F.descricaoDoPost({ moldura: 'azul-calmo', texto: 'Oi', prop: p, resultado: { tam: 130, linhas: 1, escura: false }, figurinha: 'coracao' }), /Figurinha embaixo, no centro: “Sentir bonito também é coisa séria\.” Coração\./);
});

test('kit de data: formato, molduras de data e figurinhas só clássicas e retrô', () => {
  const k = F.acharFormatoPost('kit-data');
  assert.ok(k.kit && !k.disponivel && k.max === 1 && k.proporcoes.join() === 'retrato-45,story,quadrada');
  assert.match(k.texto, /Tom: .*Indicação: .*Contraindicação: .*Descrição: .*Você vai precisar de: .*Capa: Não tem capa\. Onde serve: .*story é só do Instagram/);
  assert.deepStrictEqual(F.MOLDURAS_DO_KIT, ['natal', 'pascoa', 'serpentinas', 'confete', 'estrelas', 'tropical', 'coracoes', 'flores']);
  const r = F.moldurasDoKit(ctx(), '');
  assert.deepStrictEqual(r.disponiveis.map((m) => m.valor), F.MOLDURAS_DO_KIT);
  assert.strictEqual(r.categorias[0].nome, 'Datas comemorativas');
  for (const m of r.disponiveis) assert.ok(r.capacidades.get(m.valor).maxCaracteres >= 100, m.valor);
  const um = F.capacidadePost(ctx(), 1080, 1350, F.acharMoldura('natal'), F.acharProporcaoPost('retrato-45'));
  assert.ok(r.capacidades.get('natal').maxCaracteres <= um.maxCaracteres, 'o kit vale o menor entre as três');
  const comFig = F.moldurasDoKit(ctx(), 'r-golden').capacidades.get('natal').maxCaracteres;
  assert.ok(comFig < r.capacidades.get('natal').maxCaracteres, 'a figurinha reduz o espaço no kit também');
  const fig = F.figurinhasParaMoldura('natal', { kit: true });
  assert.ok(fig.includes('coracao') && fig.includes('r-golden') && !fig.includes('g-mago') && !fig.includes('n-clave') && !fig.includes('r-ursos-costas'));
  assert.ok(F.categoriasDeFigurinhasPara('natal', { kit: true }).every((c) => ['classicas', 'retro'].includes(c.valor)));
  const figNatal = F.figurinhasParaMoldura('natal');
  assert.ok(figNatal.includes('coracao') && figNatal.includes('r-golden') && !figNatal.includes('g-mago'), 'as de data, no post comum, também recebem clássicas e retrô');
});
test('molduras de data têm margens próprias para fugir dos enfeites', () => {
  const p = F.acharProporcaoPost('quadrada');
  const normal = F.caixaDoPost(1080, 1080, F.acharMoldura('azul-calmo'), p);
  for (const v of ['natal', 'serpentinas', 'pascoa']) {
    const c = F.caixaDoPost(1080, 1080, F.acharMoldura(v), p);
    assert.ok(c.w < F.caixaDoPost(1080, 1080, F.acharMoldura('confete'), { ...p }).w + 200 && c.h < normal.h + 60, v);
  }
  const ser = F.caixaDoPost(1080, 1080, F.acharMoldura('serpentinas'), p), pas = F.caixaDoPost(1080, 1080, F.acharMoldura('pascoa'), p);
  assert.ok(ser.y > normal.y + 200, 'o texto das serpentinas começa abaixo delas');
  assert.ok(pas.y + pas.h < normal.y + normal.h - 150, 'o texto da Páscoa termina acima do coelho');
});
test('visão geral do conjunto: sensação, organização e alinhamento', () => {
  const p = F.acharProporcaoPost('quadrada');
  const um = F.panoramaDoPost({ moldura: 'azul-calmo', figurinha: '', prop: p, itens: [{ texto: 'Oi', linhas: 1, tam: 130 }], temCapa: false });
  assert.match(um, /^Uma imagem, na proporção quadrada, 1 por 1\. Sensação: sereno e confiável\. A moldura é a mesma em todas: Azul com fio branco\. Sem figurinha\. Organização: o texto ocupa uma linha\. Alinhamento: tudo centralizado, dentro das margens seguras\.$/);
  const varios = F.panoramaDoPost({ moldura: 'verde-sage', figurinha: 'coracao', prop: F.acharProporcaoPost('story'), itens: [{ texto: '# T\n\nA', linhas: 3, tam: 100 }, { texto: '- a\n- b', linhas: 2, tam: 80 }], temCapa: true });
  assert.match(varios, /^3 imagens, a primeira é a capa com a sua foto, na proporção tela cheia, 9 por 16\./);
  assert.match(varios, /A figurinha, também igual em todas, é de tom afetuoso\./);
  assert.match(varios, /Organização: 2 imagens de texto, na ordem de postar\. Os textos ocupam de 2 a 3 linhas, e a letra varia um pouco/);
  assert.match(varios, /as listas alinhadas à esquerda, com marcadores, dentro das margens seguras dos stories, longe do topo e da base onde ficam os botões\. Os títulos são maiores e em negrito\./);
  assert.match(F.panoramaDoPost({ moldura: 'natal', figurinha: '', prop: p, itens: [{ texto: 'x', linhas: 1, tam: 1 }], kit: true }), /^Kit de três imagens, do mesmo texto: post em 4 por 5, story em 9 por 16 e quadrada\./);
});
test('formatos com capa opcional: só carrossel e stories em sequência', () => {
  assert.deepStrictEqual(F.FORMATOS_POST.filter((f) => f.capaOpcional).map((f) => f.valor), ['carrossel', 'stories-sequencia']);
});

test('o descritor analisa a composição: pedido com o contexto, moldura, escrito e figurinha, sem gênero', () => {
  const D = require('../../src/descritor');
  const p = D.pedidoDe('pt', 'composicao', 'Moldura: Parque de diversões. Escrito na imagem: "oi".');
  assert.match(p, /O que o programa aplicou nesta imagem: Moldura: Parque de diversões\. Escrito na imagem: "oi"\./);
  assert.match(p, /fale da moldura.*orna e combina.*briga com alguma coisa/s);
  assert.match(p, /Se não houver moldura, não fale de moldura/);
  assert.match(p, /Se houver escrito.*Se houver figurinha.*alinhada/s);
  assert.match(p, /conjunto está bom para postar/);
  assert.match(p, /Nunca use as palavras homem, mulher/);
  assert.doesNotMatch(D.pedidoDe('pt', 'composicao', ''), /O que o programa aplicou/);
  assert.notStrictEqual(D.pedidoDe('pt', 'quadro'), p);
});

test('onde a figurinha entra nos slides: todos, só no primeiro e no último, ou só no último; e o sugerido pelo número', () => {
  const dos = (onde, n) => Array.from({ length: n }, (_, i) => F.figurinhaDoSlide(onde, i, n, 'coracao') ? 1 : 0).join('');
  assert.strictEqual(dos('todos', 4), '1111');
  assert.strictEqual(dos('extremos', 4), '1001');
  assert.strictEqual(dos('extremos', 7), '1000001');
  assert.strictEqual(dos('ultimo', 4), '0001');
  assert.strictEqual(F.figurinhaDoSlide('todos', 0, 3, ''), '', 'sem figurinha escolhida, nenhum slide leva');
  assert.deepStrictEqual([2, 3, 5, 6, 8, 20].map(F.ondeSugerido), ['todos', 'todos', 'todos', 'extremos', 'extremos', 'extremos']);
  assert.deepStrictEqual(Object.keys(F.NOMES_ONDE_FIGURINHA), ['todos', 'extremos', 'ultimo']);
  assert.match(F.panoramaDoPost({ moldura: 'azul-calmo', figurinha: 'coracao', prop: F.acharProporcaoPost('quadrada'), itens: [{ texto: 'a', linhas: 1, tam: 100 }, { texto: 'b', linhas: 1, tam: 100 }, { texto: 'c', linhas: 1, tam: 100 }], onde: 'extremos' }), /A figurinha, só no primeiro e no último slide, é de tom/);
  assert.match(F.panoramaDoPost({ moldura: 'azul-calmo', figurinha: 'coracao', prop: F.acharProporcaoPost('quadrada'), itens: [{ texto: 'a', linhas: 1, tam: 100 }, { texto: 'b', linhas: 1, tam: 100 }], onde: 'extremos' }), /A figurinha, também igual em todas, é de tom/, 'com 2 slides, extremos é o mesmo que todos');
});

test('a fala dos slides: até 8 palavras inteiros, mais longos com as 6 primeiras, até, e as 2 últimas; completo lê tudo', () => {
  const casa = 'eu quero uma casa no campo,\nonde eu possa compor muitos rocks rurais.';
  assert.strictEqual(F.falaDosSlides([casa]), 'Slide 1: eu quero uma casa no campo, até rocks rurais.');
  assert.strictEqual(F.falaDosSlides(['# Título\n\nCurto aqui.', 'Exatamente oito palavras neste slide, nem uma a mais', 'O final de verdade']),
    'Slide 1: Título Curto aqui. Slide 2: Exatamente oito palavras neste slide, nem até a mais. Slide 3: O final de verdade.', 'nove palavras já resumem; menos de nove ficam inteiras');
  assert.strictEqual(F.falaDosSlides(['um dois três quatro cinco seis sete oito']), 'Slide 1: um dois três quatro cinco seis sete oito.', 'oito palavras: inteiro');
  const longo = 'Respirar fundo antes de responder é o melhor jeito de não se arrepender depois, e a gente aprende isso com o tempo, devagarinho, sem pressa nenhuma.';
  const c = F.falaDosSlides(['a b c', longo], true);
  assert.strictEqual(c, `Slide 1 de 2: a b c. Slide 2 de 2: ${longo}`);
  assert.ok(c.endsWith('sem pressa nenhuma.'), 'o final de cada slide nunca é cortado no modo completo');
  assert.ok(!/\.\.\./.test(F.falaDosSlides([longo])), 'sem reticências que pareçam texto cortado');
});
