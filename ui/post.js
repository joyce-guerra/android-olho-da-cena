/* Olho da Cena 3.0: tela Criar post (post único, story único, carrossel e stories em sequência, com texto dentro da moldura).
   Etapa 1: pasta do post. Etapa 2: formato e proporção. Etapa 3: moldura. Etapa 4: figurinha. Etapa 5: texto e salvar (Alt S).
   As imagens saem numeradas na pasta, na ordem de postar. Módulo à parte: os nomes daqui não se misturam com os de outras telas. */

const $ = (id) => document.getElementById(id);
const FT = window.Fotos;

const st = {
  aberto: false, etapa: 1, preparado: false, pasta: null, formato: '', prop: '', moldura: '', molduras: null, resultado: null, salvando: false,
  aviso: 'ok', anuncios: [], legendas: [], lista: [], calc: null, chaveCalc: '', salvo: false, figurinha: '', figOnde: 'todos', figOndeAuto: true, figOndeAviso: '', capaQuer: 'nao', capaSalva: null, retomando: false, legendaFeita: false,
};
window.__post = st; // usado só pelos testes automáticos

// --- Fala ---------------------------------------------------------------------------------------------

let alterna = false;
function falar(msg, { aviso = false } = {}) {
  alterna = !alterna;
  $('status').textContent = msg ? msg + (alterna ? ' ' : '') : '';
  if (msg) (aviso ? st.legendas : st.anuncios).push(msg);
}
let adiada = null;
function falarDepois(msg, ms = 250) { clearTimeout(adiada); adiada = setTimeout(() => falar(msg), ms); }
const bipe = (t) => { try { if (window.gravarTela && window.gravarTela.bipe) window.gravarTela.bipe(t); } catch (_) { /* sem som, segue */ } };

// --- Grupos de opções ------------------------------------------------------------------------------------

function criarRadio(o, nome, escolhido, aoMudar) {
  const d = document.createElement('div');
  d.className = 'radio';
  const inp = document.createElement('input');
  inp.type = 'radio'; inp.name = nome; inp.value = o.valor; inp.id = `${nome}-${o.valor}`;
  if (o.texto) inp.setAttribute('aria-describedby', `${inp.id}-desc`);
  inp.checked = o.valor === escolhido;
  const lab = document.createElement('label');
  lab.htmlFor = inp.id; lab.textContent = o.nome;
  d.append(inp, lab);
  if (o.texto) { const p = document.createElement('p'); p.className = 'desc'; p.id = `${inp.id}-desc`; p.textContent = o.texto; d.append(p); }
  if (o.detalhes) d._itens = o.detalhes;
  inp.addEventListener('change', () => { if (inp.checked) aoMudar(o.valor); });
  return d;
}
function montarGrupo(idGrupo, nome, opcoes, escolhido, aoMudar) {
  const g = $(idGrupo);
  g.querySelectorAll('.radio, details').forEach((d) => d.remove());
  for (const o of opcoes) g.appendChild(criarRadio(o, nome, escolhido, aoMudar));
}
/** Opções em seções que abrem e fecham, com subcategorias quando houver. A seção do escolhido já vem aberta. */
function montarArvore(idGrupo, nome, categorias, opcoes, escolhido, aoMudar, primeiras = []) {
  const g = $(idGrupo);
  g.querySelectorAll('.radio, details').forEach((d) => d.remove());
  for (const o of primeiras) g.appendChild(criarRadio(o, nome, escolhido, aoMudar));
  const secao = (cat, pai) => {
    const det = document.createElement('details');
    det.className = 'secao';
    const sum = document.createElement('summary');
    det.appendChild(sum);
    if (cat.subs) {
      sum.textContent = `${cat.nome}, ${cat.subs.length === 1 ? '1 subcategoria' : cat.subs.length + ' subcategorias'}`;
      for (const sub of cat.subs) secao(sub, det);
      if (cat.subs.some((x) => x.itens.includes(escolhido))) det.open = true;
    } else {
      sum.textContent = `${cat.nome}, ${cat.itens.length === 1 ? '1 opção' : cat.itens.length + ' opções'}`;
      for (const v of cat.itens) { const o = opcoes.find((x) => x.valor === v); if (o) det.appendChild(criarRadio(o, nome, escolhido, aoMudar)); }
      if (cat.itens.includes(escolhido)) det.open = true;
    }
    pai.appendChild(det);
  };
  for (const cat of categorias) secao(cat, g);
}

// --- Dados do que está escolhido ---------------------------------------------------------------------------

const formato = () => FT.acharFormatoPost(st.formato);
const proporcao = () => FT.acharProporcaoPost(st.prop);
const medidor = () => document.createElement('canvas').getContext('2d');
const multi = () => !!(formato() && formato().multi);
const kit = () => !!(formato() && formato().kit);
const PROPS_KIT = ['retrato-45', 'story', 'quadrada'];
const propsDeSaida = () => (kit() ? PROPS_KIT.map((v) => FT.acharProporcaoPost(v)) : [proporcao()]);
const textoDoPost = () => $('po-texto').value;
const plural = (n, um, varios) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);
const nomeLimpo = (n) => String(n || '').replace(/\.(jpe?g|png|mp4|txt)$/i, '').replace(/^(\d+)-/, (_, d) => `${Number(d)}, `).replace(/-/g, ' ');
const quantosArquivos = (n) => (n === 1 ? '1 imagem' : `${n} imagens`);
const soImagens = (lista) => (lista || []).filter((n) => /\.jpe?g$/i.test(n)).length;

// --- Etapas ---------------------------------------------------------------------------------------------------

const NOMES = ['', 'Pasta do post', 'Formato e proporção', 'Moldura', 'Figurinha, opcional', 'Texto e salvar'];
function irParaEtapa(n, { fala = true } = {}) {
  st.etapa = n;
  for (let i = 1; i <= 5; i++) $('po-e' + i).hidden = i !== n;
  for (const id of ['po-v1', 'po-v2', 'po-v3']) $(id).hidden = true;
  if (n === 3) montarMolduras();
  if (n === 4) montarFigurinhas();
  if (n === 5) prepararTexto();
  window.scrollTo(0, 0);
  $(`po-e${n}-titulo`).focus();
  if (fala && n !== 3) falarDepois(`Etapa ${n} de 5: ${NOMES[n]}.`);
  if (window.olho && window.olho.aoMudarEtapaFoto) window.olho.aoMudarEtapaFoto(n);
}

async function etapa1() {
  const nome = $('po-pasta').value;
  if (!nome.trim()) { falar('Antes de continuar, escreva o nome da pasta do post.'); $('po-pasta').focus(); return; }
  st.tipo = (document.querySelector('input[name="po-tipo"]:checked') || {}).value === 'video' ? 'video' : 'imagem';
  const r = await window.api.postPreparar({ nome, tipo: st.tipo });
  if (!r.ok) { falar('Não consegui preparar a pasta. ' + r.erro); return; }
  st.pasta = r.valor; st.lista = r.valor.lista;
  const v = r.valor;
  const dito = v.existia
    ? `A pasta ${v.nome} já existe e tem ${quantosArquivos(soImagens(v.lista))}. O próximo arquivo será o número ${v.proximo}.`
    : `A pasta ${v.nome} será criada em Posts. O primeiro arquivo será o número 1.`;
  if (st.tipo === 'video') {
    const q = v.existia ? `A pasta ${v.nome} já existe em Posts, Vídeos, e tem ${v.lista.length === 1 ? '1 arquivo' : v.lista.length + ' arquivos'}. O próximo arquivo será o número ${v.proximo}.` : `A pasta ${v.nome} será criada em Posts, Vídeos. O primeiro arquivo será o número 1.`;
    return window.postVideo.iniciar(q);
  }
  irParaEtapa(2, { fala: false });
  falarDepois(`${dito} Etapa 2 de 5: ${NOMES[2]}. Escolha o formato do post.`, 200);
}
function etapa2() {
  if (!formato()) { falar('Antes de continuar, escolha o formato do post.'); const r = document.querySelector('input[name="po-formato"]'); if (r) r.focus(); return; }
  if (!proporcao()) { falar('Antes de continuar, escolha a proporção da imagem.'); const r = document.querySelector('input[name="po-prop"]'); if (r) r.focus(); return; }
  if (formato().capaOpcional && st.capaQuer === 'sim' && !st.capaSalva) return abrirCapa();
  irParaEtapa(3, { fala: false });
  falarDepois(`Etapa 3 de 5: ${NOMES[3]}. Escolha ${kit() ? 'a data, que traz a sua moldura' : 'uma moldura'}, em seções que abrem e fecham.`, 200);
}
/** A capa é uma foto do Tirar fotos, na proporção do post. Ao salvar, volta para cá e a foto já está na pasta do post, como a primeira imagem. */
function abrirCapa() {
  const p = proporcao();
  window.fotoTela.pedirCapa({ propFoto: p.propFoto, pasta: st.pasta.pasta, nomePasta: st.pasta.nome, aoTerminar: (info) => retomarDaCapa(info) });
  falar('Abrindo o Tirar fotos para a capa, na mesma proporção do post.');
  window.olho.mostrarTela('foto');
}
function retomarDaCapa(info) {
  st.retomando = true;
  st.capaSalva = info || null;
  if (st.tipo === 'video') st.retomandoVideo = true;
  if (!info) st.capaQuer = 'nao';
  window.olho.mostrarTela('post');
}
function etapa3() {
  if (!st.moldura) { falar('Antes de continuar, escolha uma moldura.'); const r = document.querySelector('input[name="po-moldura"]'); if (r) { const d = r.closest('details'); if (d) d.open = true; r.focus(); } return; }
  irParaEtapa(4, { fala: false });
  falarDepois(`Etapa 4 de 5: ${NOMES[4]}. ${$('po-fig-info').textContent}`, 200);
}
function etapa4() {
  irParaEtapa(5, { fala: false });
  const f = formato();
  const dito = multi()
    ? `Cole o texto, com os parágrafos separados por uma linha em branco. O programa calcula os slides, de ${f.min} a ${f.max}.`
    : kit()
      ? `O texto vira três imagens, e cabem cerca de ${capacidadeAtual().maxCaracteres} caracteres, o menor valor entre elas. Escreva ou cole o texto.`
      : `${FT.falaDaCapacidade(proporcao(), capacidadeAtual())} Escreva ou cole o texto.`;
  falarDepois(`Etapa 5 de 5: ${NOMES[5]}. ${st.figurinha ? 'Com figurinha. ' : 'Sem figurinha. '}${dito}`, 200);
}
function continuar() {
  if (st.etapa === 1) return etapa1();
  if (st.etapa === 2) return etapa2();
  if (st.etapa === 3) return etapa3();
  if (st.etapa === 4) return etapa4();
}
function voltar() {
  if (st.etapa > 1) irParaEtapa(st.etapa - 1);
}
function fechar() { if (window.olho) window.olho.mostrarTela('inicial'); }

// --- Formato, proporção e moldura -----------------------------------------------------------------------------

function escolherFormato(v) {
  st.formato = v;
  resetarPost();
  const f = formato();
  const props = f.proporcoes.map((p) => FT.acharProporcaoPost(p));
  st.capaQuer = 'nao'; st.capaSalva = null;
  $('po-grupo-capa').hidden = !f.capaOpcional;
  if (f.capaOpcional) montarGrupo('po-grupo-capa', 'po-capa', [
    { valor: 'nao', nome: 'Não, sem capa', texto: 'O primeiro slide é o primeiro arquivo da pasta.' },
    { valor: 'sim', nome: 'Sim, tirar uma foto de capa agora', texto: 'Ao continuar, o programa abre o Tirar fotos já na proporção do post. Quando você salvar a foto, ela vai para a pasta do post como a primeira imagem, a capa, e o programa volta para cá.' }
  ], 'nao', (x) => { st.capaQuer = x; falar(x === 'sim' ? 'Com capa. Ao continuar, abre o Tirar fotos.' : 'Sem capa.'); });
  if (f.kit) {
    st.prop = 'retrato-45';
    $('po-grupo-prop').hidden = true; $('po-prop-unica').hidden = false;
    $('po-prop-unica').textContent = 'O kit gera três imagens do mesmo texto: post em 4 por 5, story em 9 por 16 e uma quadrada, 1 por 1.';
    // 3.0.3: o nome e a descrição do formato já vêm da própria opção; aqui só o que o programa decidiu, e só quando a pessoa para de andar pela lista.
    falarDepois('Gera três imagens: 4 por 5, 9 por 16 e 1 por 1.', 700);
    st.moldura = '';
    return;
  }
  const unica = props.length === 1;
  $('po-grupo-prop').hidden = unica;
  $('po-prop-unica').hidden = !unica;
  if (unica) {
    st.prop = props[0].valor;
    $('po-prop-unica').textContent = `${f.nome} usa a proporção ${props[0].nome}. ${props[0].texto}`;
    falarDepois(`Proporção ${props[0].nome}, escolhida pelo programa.`, 700);
  } else {
    st.prop = '';
    montarGrupo('po-grupo-prop', 'po-prop', props.map((p) => ({ valor: p.valor, nome: p.nome, texto: p.texto })), '', (x) => { st.prop = x; st.moldura = ''; });
    clearTimeout(adiada); // a proporção aparece logo abaixo; nada é dito a cada tecla
  }
  st.moldura = '';
}
function montarMolduras() {
  const p = proporcao();
  st.molduras = kit() ? FT.moldurasDoKit(medidor(), st.figurinha) : FT.moldurasDoPost(medidor(), p);
  // A lista das molduras que ficaram de fora não é dita nem mostrada: só confundiria com a das disponíveis.
  $('po-aviso').hidden = true; $('po-aviso').textContent = '';
  if (st.moldura && !st.molduras.disponiveis.some((m) => m.valor === st.moldura)) st.moldura = '';
  // A quantidade de texto só entra na descrição quando o desenho da moldura realmente limita: ela comporta bem menos que as melhores.
  const caps = st.molduras.disponiveis.map((m) => st.molduras.capacidades.get(m.valor).maxCaracteres);
  const melhor = Math.max(...caps);
  const opcoes = st.molduras.disponiveis.map((m) => {
    const c = st.molduras.capacidades.get(m.valor).maxCaracteres;
    const limita = !multi() && c < melhor * 0.85;
    return { valor: m.valor, nome: m.nome, texto: limita ? `${m.texto} Por causa do desenho, comporta menos texto que as outras: cerca de ${c} caracteres.` : m.texto };
  });
  montarArvore('po-grupo-moldura', 'po-moldura', st.molduras.categorias, opcoes, st.moldura, (v) => { st.moldura = v; if (!FT.figurinhasParaMoldura(v, { kit: kit() }).includes(st.figurinha)) st.figurinha = ''; });
}
/** Em quais imagens a figurinha entra, de acordo com o formato. */
function ondeEntraAFigurinha() {
  if (multi()) return 'Ela entra em todos os slides, no mesmo lugar. Depois que você escrever o texto, se der 3 slides ou mais, o programa oferece outras opções: só no primeiro e no último, ou só no último. A capa com a sua foto, se houver, não leva figurinha.';
  if (kit()) return 'Ela entra nas três imagens do kit, no mesmo lugar.';
  return 'Ela entra na imagem do post.';
}
function montarFigurinhas() {
  const compat = FT.figurinhasParaMoldura(st.moldura, { kit: kit() }), cats = FT.categoriasDeFigurinhasPara(st.moldura, { kit: kit() });
  if (!compat.includes(st.figurinha)) st.figurinha = '';
  // 3.0.2: a figurinha da capa já vem escolhida, uma vez só, se combinar com a moldura. A pessoa troca ou tira quando quiser.
  st.avisoFigCapa = '';
  const dela = st.capaSalva && st.capaSalva.figurinha;
  if (dela && !st.figCapaAplicada) {
    st.figCapaAplicada = true;
    const f = FT.acharFigurinha(dela);
    if (compat.includes(dela)) { if (!st.figurinha) { st.figurinha = dela; st.avisoFigCapa = ` A figurinha da capa, ${f ? f.rotulo : 'a mesma'}, já vem escolhida. Troque ou escolha Sem figurinha, se preferir.`; } }
    else st.avisoFigCapa = ` A figurinha da capa, ${f ? f.rotulo : 'a escolhida na foto'}, não combina com esta moldura, então nenhuma vem escolhida.`;
  }
  const opcoes = FT.FIGURINHAS.filter((f) => compat.includes(f.valor)).map((f) => ({ valor: f.valor, nome: f.rotulo, detalhes: f.detalhes }));
  $('po-grupo-figurinha').hidden = !compat.length;
  montarArvore('po-grupo-figurinha', 'po-figurinha', cats, opcoes, st.figurinha, (v) => {
    st.figurinha = v; st.salvo = false;
    const f = FT.acharFigurinha(v);
    falar(f ? `Figurinha escolhida: ${f.rotulo}` : 'Sem figurinha.');
  }, [{ valor: '', nome: 'Sem figurinha', texto: 'O post sai só com o texto, e a figurinha não ocupa espaço.' }]);
  const m = FT.acharMoldura(st.moldura), nCat = cats.length;
  $('po-fig-info').textContent = compat.length
    ? `${compat.length} figurinhas combinam com a moldura ${m ? m.nome : ''}, em ${nCat === 1 ? '1 seção' : nCat + ' seções'}. A figurinha fica pequena, embaixo, no meio, e o texto fica acima dela. ${ondeEntraAFigurinha()} Cada figurinha aparece com a frase e o que ela mostra, e os detalhes abrem separados: tom, indicação, descrição e contraindicação.`
    : `Nenhuma figurinha combina com a moldura ${m ? m.nome : ''}, então o post sai só com o texto.`;
  $('po-fig-info').textContent += st.avisoFigCapa || '';
}

// --- Texto e prévia ------------------------------------------------------------------------------------------

function desenhar() {
  const p = proporcao(); if (!p || !st.moldura) return;
  const c = $('po-final');
  if (c.width !== p.largura || c.height !== p.altura) { c.width = p.largura; c.height = p.altura; }
  const t = multi() ? ((calcular().slides[0]) || '') : textoDoPost();
  st.resultado = FT.comporPost(c.getContext('2d'), p.largura, p.altura, { moldura: st.moldura, texto: t, prop: p, figurinha: st.figurinha });
}
/** Calcula os slides do texto (só no carrossel e nos stories em sequência), guardando o resultado enquanto o texto não muda. */
function calcular() {
  const p = proporcao(), m = FT.acharMoldura(st.moldura), t = textoDoPost();
  const chave = [st.formato, st.prop, st.moldura, st.figurinha, t].join('\u0001');
  if (st.calc && st.chaveCalc === chave) return st.calc;
  st.calc = FT.dividirEmSlides(medidor(), t, FT.caixaDoPost(p.largura, p.altura, m, p, st.figurinha), p.largura);
  st.chaveCalc = chave;
  return st.calc;
}
function capacidadeAtual() {
  const m = FT.acharMoldura(st.moldura), ps = propsDeSaida();
  if (!m || !ps[0]) return null;
  const cs = ps.map((p) => FT.capacidadePost(medidor(), p.largura, p.altura, m, p, st.figurinha));
  return { maxCaracteres: Math.min(...cs.map((c) => c.maxCaracteres)), maxLinhas: Math.min(...cs.map((c) => c.maxLinhas)), tamMin: cs[0].tamMin };
}
/** Com figurinha e vários slides, o programa oferece onde ela entra: em todos, só no primeiro e no último, ou só no último. */
function atualizarFigOnde(k) {
  const g = $('po-grupo-fig-onde');
  const deve = multi() && !!st.figurinha && k >= 3 && k <= formato().max;
  if (!deve) { g.hidden = true; st.figOnde = 'todos'; st.figOndeAuto = true; return; }
  const padrao = FT.ondeSugerido(k), apareceu = g.hidden;
  const mudouPadrao = st.figOndeAuto && st.figOnde !== padrao;
  if (!apareceu && !mudouPadrao) return;
  if (st.figOndeAuto) st.figOnde = padrao;
  montarGrupo('po-grupo-fig-onde', 'po-fig-onde', [
    { valor: 'todos', nome: 'Em todos os slides', texto: 'Todos os slides levam a figurinha, no mesmo lugar. Combina com poucos slides.' },
    { valor: 'extremos', nome: 'Só no primeiro e no último slide', texto: 'A figurinha abre e fecha a série, e os slides do meio ficam só com o texto. Combina com muitos slides.' },
    { valor: 'ultimo', nome: 'Só no último slide', texto: 'Só o último slide leva a figurinha, como um fechamento.' }
  ], st.figOnde, (v) => { st.figOnde = v; st.figOndeAuto = false; st.salvo = false; falar(`A figurinha entra ${FT.NOMES_ONDE_FIGURINHA[v]}.`); });
  g.hidden = false;
  falar(`Deu ${k} slides, e você escolheu uma figurinha. Escolhi ${FT.NOMES_ONDE_FIGURINHA[st.figOnde]}${k > 5 ? ', porque são muitos slides e a mesma figurinha em todos cansa' : ''}. Se preferir outro jeito, escolha em Onde a figurinha entra nos slides, logo abaixo do texto.`);
}
function contador() {
  // 3.0.3: os sinais de formatação, como # no título, asteriscos no negrito e hífen na lista, não aparecem na imagem e não entram na conta.
  const n = FT.semMarcasPost(textoDoPost()).length, cap = capacidadeAtual();
  if (!cap) return;
  let estado = 'ok', msg;
  if (multi()) {
    const f = formato(), r = n ? calcular() : { slides: [] }, k = r.slides.length;
    atualizarFigOnde(k);
    if (k > f.max) { estado = 'demais'; msg = `${n} caracteres. Daria ${k} slides, e o máximo do ${f.nome} é ${f.max}. Corte uma parte do texto.`; }
    else if (n && k === 1) { estado = 'um'; msg = `${n} caracteres. Esse texto cabe num slide só, e o ${f.nome} precisa de pelo menos ${f.min}. Escreva mais parágrafos, separados por uma linha em branco.`; }
    else msg = k ? `${n} caracteres. Vai dar ${k} slides. Alt T lê a lista.` : `${n} caracteres. Separe os parágrafos por uma linha em branco: cada um vira um slide.`;
  } else if (n > 0 && (kit() ? !imagensDoPost().every((x) => pintarPara(x.texto, x.prop, x.figurinha).res.ok) : (st.resultado && !st.resultado.ok))) {
    estado = 'passou';
    const sobra = Math.max(0, n - cap.maxCaracteres);
    const carrossel = FT.acharFormatoPost('carrossel').disponivel ? ', ou use o formato Carrossel, que divide o texto em vários slides' : '';
    msg = `${n} caracteres. Passou do limite para ler bem no celular${sobra ? ` em cerca de ${sobra} caracteres` : ''}. Apague algumas palavras${carrossel}.`;
  } else msg = `${n} caracteres. Cabem cerca de ${cap.maxCaracteres}, que é o limite para ler bem no celular.`;
  $('po-contador').textContent = msg;
  if (estado !== st.aviso) { st.aviso = estado; if (estado !== 'ok') falar(msg); }
}
function prepararTexto() {
  st.aviso = 'ok';
  const f = formato(), cap = capacidadeAtual(), m = multi();
  $('po-capacidade').textContent = m
    ? `${f.nome}: de ${f.min} a ${f.max} slides, todos na mesma moldura. Cole o texto com os parágrafos separados por uma linha em branco: cada parágrafo vira um slide, e o programa calcula quantos serão.`
    : kit()
      ? `${f.nome}: o texto vira três imagens, o post em 4 por 5, o story em 9 por 16 e a quadrada. Cabem cerca de ${cap.maxCaracteres} caracteres, o menor valor entre elas, e é o limite para ler bem no celular.`
      : FT.falaDaCapacidade(proporcao(), cap);
  $('po-calcular').hidden = !m;
  $('po-salvar').textContent = m ? 'Salvar todos os slides, Alt S' : 'Salvar o post, Alt S';
  $('po-ordem').textContent = m ? 'Ouvir a lista dos slides, Alt L' : 'Ouvir a ordem de postar, Alt L';
  $('po-texto-rotulo').textContent = m ? 'Texto dos slides, cole com os parágrafos separados por uma linha em branco' : 'Texto do post, você pode escrever ou colar';
  $('po-salvo').textContent = '';
  desenhar(); contador();
  $('po-texto').focus();
}
let quadro = 0;
function aoDigitar() {
  st.salvo = false;
  cancelAnimationFrame(quadro);
  quadro = requestAnimationFrame(() => { desenhar(); contador(); });
}

// Listas: depois de uma linha como "1. item", "- item" ou "* item", Enter abre o próximo item; Enter numa linha vazia termina a lista.
function continuarLista(e) {
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
  const ta = $('po-texto');
  if (ta.selectionStart !== ta.selectionEnd) return;
  const pos = ta.selectionStart, ini = ta.value.lastIndexOf('\n', pos - 1) + 1;
  const linha = ta.value.slice(ini, pos);
  const m = /^(\s*)(?:([-*+])|(\d+)\.)\s+(.*)$/.exec(linha), vazia = /^(\s*)(?:([-*+])|(\d+)\.)\s*$/.exec(linha);
  if (!m && !vazia) return;
  e.preventDefault();
  if (vazia) { ta.setRangeText('', ini, pos, 'end'); ta.setRangeText('\n', ini, ini, 'end'); falar('Lista terminada.'); }
  else {
    const proxima = m[3] ? `${Number(m[3]) + 1}. ` : `${m[2]} `;
    ta.setRangeText('\n' + m[1] + proxima, pos, pos, 'end');
    falar(m[3] ? `Item ${Number(m[3]) + 1}.` : 'Novo item da lista.');
  }
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

// --- Dicas de escrita ---------------------------------------------------------------------------------------

function abrirDicas() {
  const m = multi();
  const itens = [
    m ? 'Frases curtas leem melhor no celular e dividem melhor entre os slides.' : 'Frases curtas leem melhor no celular.',
    m ? 'Separe as ideias por uma linha em branco: cada parágrafo, cada lista e cada título com o que vem depois dele vira um slide. É você quem manda na sequência.' : 'Um post único mostra uma ideia só. Se o texto tiver várias, use o Carrossel.',
    'Para abrir com um título, comece a linha com # e um espaço. Para um subtítulo, use ## e um espaço.',
    'Para dar destaque, ponha a palavra entre asteriscos, como *destaque*. Ela sai em negrito.',
    'Para listas, comece a linha com 1. e um espaço, ou com um hífen e um espaço, ou com um asterisco e um espaço. Ao apertar Enter, o programa continua a lista. Enter numa linha vazia termina.',
    'Uma frase que não cabe num slide é partida nos pontos finais. Quanto mais curtas as frases, mais limpa a divisão.',
    m ? 'Carrossel de 3 a 8 slides costuma funcionar melhor, e o máximo é 20.' : 'Se um texto não couber, escolha outra moldura ou apague algumas palavras.',
    'Alt T calcula os slides e lê quantos deram. Alt L lê o começo de cada um.'
  ].filter((x, i) => m || i !== 7);
  const box = $('po-dicas-texto'); box.textContent = '';
  itens.forEach((t) => { const p = document.createElement('p'); p.textContent = t; box.appendChild(p); });
  $('po-dicas').showModal();
  $('po-dicas-titulo').focus();
  falar('Dicas de escrita do seu texto.');
}
function fecharDicas() { $('po-dicas').close(); $('po-dicas-abrir').focus(); }

// --- Calcular os slides, salvar, resumo, descrição e ordem --------------------------------------------------

function falarSlides() {
  if (!multi()) return falar('Alt T calcula os slides no Carrossel e nos Stories em sequência. Neste formato, o texto fica numa imagem só.');
  if (st.etapa !== 5) return falar('Alt T calcula os slides na Etapa 5, Texto e salvar.');
  const f = formato();
  if (!textoDoPost().trim()) return falar('Cole ou escreva o texto antes de calcular os slides.');
  const r = calcular(), k = r.slides.length;
  if (k > f.max) return falar(`O texto daria ${k} slides, e o máximo do ${f.nome} é ${f.max}. Corte uma parte do texto.`);
  if (k < f.min) return falar(`O texto cabe num slide só, e o ${f.nome} precisa de pelo menos ${f.min}. Escreva mais parágrafos, separados por uma linha em branco, ou escolha Post único.`);
  const como = r.modo === 'blocos' ? 'um para cada parágrafo, lista ou título com o que vem depois, e os que não cabiam foram divididos nas frases' : 'enchendo cada um até o limite de leitura no celular';
  falar(`Vão ser ${k} slides, ${como}. ${FT.falaDosSlides(r.slides)} Alt L lê todos os slides por inteiro.`);
}

const pintarPara = (texto, prop, figurinha = st.figurinha) => {
  const p = prop || proporcao(), c = document.createElement('canvas');
  c.width = p.largura; c.height = p.altura;
  const res = FT.comporPost(c.getContext('2d'), p.largura, p.altura, { moldura: st.moldura, texto, prop: p, figurinha });
  return { c, res };
};
/** As imagens que o post vai gerar, na ordem de postar: { texto, prop, rotulo }. */
function imagensDoPost() {
  const texto = textoDoPost();
  if (kit()) return PROPS_KIT.map((v, i) => ({ texto, prop: FT.acharProporcaoPost(v), rotulo: ['post', 'story', 'quadrada'][i], figurinha: st.figurinha }));
  if (multi()) { const sl = calcular().slides; return sl.map((t, i) => ({ texto: t, prop: proporcao(), rotulo: 'slide', figurinha: FT.figurinhaDoSlide(st.figOnde, i, sl.length, st.figurinha) })); }
  return [{ texto, prop: proporcao(), rotulo: 'texto', figurinha: st.figurinha }];
}
async function salvar() {
  if (st.etapa !== 5) return falar(st.etapa < 5 ? 'Alt S salva na Etapa 5. Use Salvar e continuar para chegar lá.' : 'Alt S salva na Etapa 5, Texto e salvar. Use Salvar e continuar até chegar lá.');
  if (st.salvando) return;
  const f = formato(), texto = textoDoPost();
  if (!texto.trim()) { falar(multi() || kit() ? 'Cole ou escreva o texto antes de salvar.' : 'Escreva o texto antes de salvar.'); $('po-texto').focus(); return; }
  if (st.salvo) return falar('Este texto já está salvo. Mude alguma coisa para salvar de novo, ou use Alt O para começar outro post.');
  const imgs = imagensDoPost();
  if (multi() && imgs.length > f.max) { falar(`O texto daria ${imgs.length} slides, e o máximo do ${f.nome} é ${f.max}. Não salvei. Corte uma parte do texto.`); $('po-texto').focus(); return; }
  if (multi() && imgs.length < f.min) { falar(`O texto cabe num slide só, e o ${f.nome} precisa de pelo menos ${f.min}. Não salvei. Escreva mais parágrafos, separados por uma linha em branco.`); $('po-texto').focus(); return; }
  for (let i = 0; i < imgs.length; i++) {
    if (!pintarPara(imgs[i].texto, imgs[i].prop, imgs[i].figurinha).res.ok) {
      contador();
      const quem = multi() ? `O slide ${i + 1}` : kit() ? `O texto no formato ${imgs[i].prop.nome}` : 'O texto';
      falar(`${quem} não cabe nesta moldura, então não salvei nada. Apague algumas palavras${multi() || kit() ? '' : ' ou escolha outra moldura'}.`); $('po-texto').focus(); return;
    }
  }
  st.salvando = true;
  try {
    let ultimo = null, primeiro = null; const numeros = [];
    for (let i = 0; i < imgs.length; i++) {
      const { c } = pintarPara(imgs[i].texto, imgs[i].prop, imgs[i].figurinha);
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
      const dados = new Uint8Array(await blob.arrayBuffer());
      const r = await window.api.postSalvar({ pasta: st.pasta.pasta, moldura: st.moldura, texto: imgs[i].texto, rotulo: imgs[i].rotulo, dados });
      if (!r.ok) throw new Error(`${multi() ? `o slide ${i + 1}` : `a imagem ${i + 1}`} não foi salvo: ${r.erro}`);
      ultimo = r.valor; numeros.push(r.valor.numero); if (!primeiro) primeiro = r.valor;
    }
    st.lista = ultimo.lista; st.ultimoSalvo = ultimo; st.salvo = true;
    const n = imgs.length;
    const base = n === 1
      ? `Post salvo como ${nomeLimpo(ultimo.nome)}, número ${ultimo.numero}, na pasta ${st.pasta.nome}. A pasta tem agora ${quantosArquivos(soImagens(ultimo.lista))}. Para postar, siga a ordem dos números.`
      : kit()
        ? `Kit salvo na pasta ${st.pasta.nome}: o post em 4 por 5 é o número ${numeros[0]}, o story é o ${numeros[1]} e a quadrada é a ${numeros[2]}. A pasta tem agora ${quantosArquivos(soImagens(ultimo.lista))}.`
        : `${n} slides salvos na pasta ${st.pasta.nome}, do número ${numeros[0]} ao ${numeros[n - 1]}. A pasta tem agora ${quantosArquivos(soImagens(ultimo.lista))}. Para postar, siga a ordem dos números.`;
    const t = `${base} Alt L lê a ordem, e Alt G dá a visão geral do conjunto. A legenda está sendo escrita em segundo plano, e eu aviso quando ficar pronta.`;
    $('po-salvo').textContent = t;
    bipe('concluido');
    falar(t);
    gerarLegenda(imgs.map((x) => x.texto), primeiro.caminho);
  } catch (e) { falar('Não consegui salvar. ' + (e.message || e)); } finally { st.salvando = false; }
}
/** A legenda do post é escrita em segundo plano e guardada em legenda.txt, na pasta do post. */
async function gerarLegenda(textos, imagem) {
  const inicio = Date.now();
  const esperar = () => new Promise((ok) => setTimeout(ok, Math.max(0, (window.__post.atrasoLegenda === undefined ? 7000 : window.__post.atrasoLegenda) - (Date.now() - inicio))));
  try {
    const r = await window.api.postLegenda({ pasta: st.pasta.pasta, textos, imagem });
    await esperar(); // dá tempo de ouvir o aviso de que o post foi salvo antes de falar da legenda
    if (!r.ok) return falar('Não consegui guardar a legenda. ' + r.erro, { aviso: true });
    const v = r.valor; st.legendaFeita = true; st.ultimaLegenda = v;
    const limite = v.caracteres > 500 ? ' Ela passa de 500 caracteres, que é o limite do Threads, então lá precisa ficar menor.' : '';
    falar(v.origem === 'gemma'
      ? `Legenda pronta e guardada em ${v.nome}, com ${v.caracteres} caracteres. Leia, corrija o que quiser e cole na hora de postar.${limite}`
      : `O Gemma não escreveu a legenda. ${v.motivo} Guardei em ${v.nome} um rascunho com o texto do post, com ${v.caracteres} caracteres.${limite}`, { aviso: true });
  } catch (e) { falar('Não consegui escrever a legenda. ' + (e.message || e), { aviso: true }); }
}
function resumo() {
  if (st.etapa < 3) return falar('O resumo fala como o post ficou. Ele vale a partir da Etapa 3.');
  if (st.etapa === 3) { const m = FT.acharMoldura(st.moldura); return falar(m ? `Moldura escolhida: ${m.nome}. ${m.descricao}` : 'Nenhuma moldura escolhida ainda.'); }
  desenhar();
  const imgs = imagensDoPost();
  const t = imgs[0] ? imgs[0].texto : '';
  const intro = kit() ? 'Kit de três imagens, todas no mesmo estilo. A primeira, o post: ' : multi() ? `${imgs.length} slides, todos iguais no estilo. O primeiro: ` : '';
  falar(`${intro}${FT.descricaoDoPost({ moldura: st.moldura, texto: t, prop: imgs[0] ? imgs[0].prop : proporcao(), resultado: st.resultado, figurinha: st.figurinha })}`);
}
/** Alt G: a visão geral do conjunto, com a sensação, a organização e o alinhamento. */
function panorama() {
  if (st.etapa < 3) return falar('Alt G descreve o conjunto de imagens do post. Ele vale a partir da Etapa 3.');
  const m = FT.acharMoldura(st.moldura);
  if (st.etapa < 5 || !textoDoPost().trim()) return falar(m ? `Ainda sem texto. Por enquanto: moldura ${m.nome}, de sensação ${m.tom}.${st.figurinha ? ' Com figurinha.' : ''}` : 'Escolha uma moldura primeiro.');
  const itens = imagensDoPost().map((x) => { const r = pintarPara(x.texto, x.prop, x.figurinha).res; return { texto: x.texto, linhas: r.linhas, tam: r.tam }; });
  falar(FT.panoramaDoPost({ moldura: st.moldura, figurinha: st.figurinha, prop: proporcao(), itens, temCapa: !!st.capaSalva, kit: kit(), onde: st.figOnde }));
}
async function descrever() {
  if (st.etapa !== 5) return falar('Alt Q descreve o post na Etapa 5, Texto e salvar.');
  if (!textoDoPost().trim()) return falar('Escreva o texto antes de pedir a descrição.');
  desenhar();
  const blob = await new Promise((ok) => $('po-final').toBlob(ok, 'image/png'));
  const r = await window.api.quadroSalvar({ dados: new Uint8Array(await blob.arrayBuffer()) });
  if (!r.ok) return falar('Não consegui preparar a imagem. ' + r.erro);
  const m = FT.acharMoldura(st.moldura), fig = FT.acharFigurinha(st.figurinha);
  const contexto = `Post só de texto, sem foto de pessoa, montado em uma moldura: ${m ? `${m.nome}. ${m.descricao}` : ''} Texto escrito na imagem: "${FT.semMarcasPost(textoDoPost()).trim().slice(0, 400)}".${fig ? ` Figurinha embaixo, no meio: ${fig.rotulo}` : ''}`;
  if (window.olho && window.olho.descreverQuadro) await window.olho.descreverQuadro(r.valor.caminho, contexto);
}
async function ordem() {
  if (!st.pasta) return falar('Escolha a pasta do post primeiro.');
  if (multi() && !st.salvo && st.etapa === 5) {
    const t = textoDoPost();
    if (!t.trim()) return falar('Ainda não tem texto, então não tem slides.');
    const sl = calcular().slides;
    return falar(`${sl.length === 1 ? '1 slide' : sl.length + ' slides'}, lidos por inteiro. ${FT.falaDosSlides(sl, true)}`);
  }
  const r = await window.api.postListar({ pasta: st.pasta.pasta });
  if (!r.ok) return falar('Não consegui ler a pasta. ' + r.erro);
  const imgs = r.valor.lista.filter((n) => /\.jpe?g$/i.test(n));
  falar(imgs.length ? `Postar nesta ordem: ${imgs.map(nomeLimpo).join('; ')}.` : 'A pasta ainda não tem imagens.');
}
function resetarPost() {
  st.calc = null; st.chaveCalc = ''; st.salvo = false; st.aviso = 'ok'; st.figOnde = 'todos'; st.figOndeAuto = true;
  $('po-grupo-fig-onde').hidden = true;
  $('po-texto').value = '';
}
function outroPost() {
  if (st.etapa !== 5) return falar('Alt O começa outro post, em outra pasta, depois de salvar na Etapa 5.');
  entrar();
}

// --- Entrada e saída da tela -----------------------------------------------------------------------------------

function entrar() {
  st.aberto = true;
  if (!st.preparado) preparar();
  if (st.retomando && st.retomandoVideo) {
    st.retomando = false; st.retomandoVideo = false;
    window.postVideo.retomar();
    return;
  }
  if (st.retomando) {
    st.retomando = false;
    irParaEtapa(3, { fala: false });
    const c = st.capaSalva;
    falarDepois(`${c ? `Capa salva como ${nomeLimpo(c.nome)}, na pasta ${st.pasta.nome}. Ela é a primeira imagem do post.` : 'Sem capa.'} Etapa 3 de 5: ${NOMES[3]}. Escolha uma moldura, em seções que abrem e fecham.`, 300);
    return;
  }
  st.figCapaAplicada = false; st.pasta = null; st.lista = []; st.formato = ''; st.prop = ''; st.moldura = ''; st.molduras = null; st.figurinha = ''; st.capaQuer = 'nao'; st.capaSalva = null; st.legendaFeita = false;
  $('po-grupo-capa').hidden = true;
  resetarPost(); $('po-pasta').value = ''; $('po-salvo').textContent = '';
  montarGrupo('po-grupo-formato', 'po-formato', FT.FORMATOS_POST.filter((f) => f.disponivel).map((f) => ({ valor: f.valor, nome: f.nome, texto: f.texto })), '', escolherFormato);
  $('po-grupo-prop').hidden = true; $('po-prop-unica').hidden = true;
  irParaEtapa(1, { fala: false });
  falarDepois(st.pasta === null && st.anuncios.length ? 'Etapa 1 de 5: Pasta do post. Escreva o nome da pasta do novo post. Se ela já existir, o programa continua a numeração.' : 'Criar post. Etapa 1 de 5: Pasta do post. Escreva o nome da pasta onde ficará o post.', 300);
  $('po-pasta').focus();
}
function sair() { st.aberto = false; }

function preparar() {
  st.preparado = true;
  $('po-e1-continuar').addEventListener('click', continuar);
  $('po-e2-continuar').addEventListener('click', continuar);
  $('po-e3-continuar').addEventListener('click', continuar);
  $('po-e2-voltar').addEventListener('click', voltar);
  $('po-e3-voltar').addEventListener('click', voltar);
  $('po-e4-continuar').addEventListener('click', continuar);
  $('po-e4-voltar').addEventListener('click', voltar);
  $('po-e5-voltar').addEventListener('click', voltar);
  $('po-e1-fechar').addEventListener('click', fechar);
  $('po-e5-fechar').addEventListener('click', fechar);
  $('po-salvar').addEventListener('click', salvar);
  $('po-resumo').addEventListener('click', resumo);
  $('po-panorama').addEventListener('click', panorama);
  $('po-descrever').addEventListener('click', descrever);
  $('po-ordem').addEventListener('click', ordem);
  $('po-outro').addEventListener('click', outroPost);
  $('po-calcular').addEventListener('click', falarSlides);
  $('po-dicas-abrir').addEventListener('click', abrirDicas);
  $('po-dicas-fechar').addEventListener('click', fecharDicas);
  $('po-dicas').addEventListener('close', () => { if (!$('tela-post').hidden) $('po-dicas-abrir').focus(); });
  $('po-texto').addEventListener('keydown', continuarLista);
  $('po-texto').addEventListener('input', aoDigitar);
  $('po-pasta').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); continuar(); } });
  document.addEventListener('keydown', (e) => {
    if (!st.aberto || $('tela-post').hidden || document.querySelector('dialog[open]')) return;
    if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey)) return;
    const emVideo = ['po-v1', 'po-v2', 'po-v3'].some((id) => !$(id).hidden);
    if (emVideo) return; // post-video.js cuida das teclas desta parte
    const acao = e.code === 'KeyS' ? salvar : e.code === 'KeyD' ? resumo : e.code === 'KeyQ' ? descrever : e.code === 'KeyL' ? ordem : e.code === 'KeyO' ? outroPost : e.code === 'KeyG' ? panorama : e.code === 'KeyT' ? falarSlides : null;
    if (!acao) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) acao();
  }, true);
}

window.__postAux = { abrirGravarDoVideo: (formato, orientacao) => {
  window.gravarTela.pedirVideoPost({ formato, orientacao, aoTerminar: (info) => { st.retomando = true; st.retomandoVideo = true; st.videoGravado = info || false; window.olho.mostrarTela('post'); } });
  window.olho.mostrarTela('gravar');
}, abrirAudioDoVideo: (video) => {
  window.gravarTela.audioDoPost(video, {
    aoTerminar: (salvo) => { st.retomando = true; st.retomandoVideo = true; st.videoGravado = { video, edicao: salvo }; window.olho.mostrarTela('post'); },
    aoVoltar: () => { st.retomando = true; st.retomandoVideo = true; st.videoGravado = false; window.olho.mostrarTela('post'); }
  });
}, falar, falarDepois, montarGrupo, bipe, nomeLimpo, st, FT, irParaEtapa, fechar, abrirCapaDoVideo: (p) => {
  window.fotoTela.pedirCapa({ propFoto: p.propFoto, pasta: st.pasta.pasta, nomePasta: st.pasta.nome, aoTerminar: (info) => retomarDaCapa(info) });
  window.olho.mostrarTela('foto');
} };
window.postTela = { entrar, sair, irParaEtapa, estado: st };
