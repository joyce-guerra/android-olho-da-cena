/* Olho da Cena 3.0.2: posts em vídeo dentro do Criar post (Reel, vídeo de feed e stories em vídeo).
   Etapa 1 é a da pasta, em post.js. Aqui: etapa 2, formato e capa; etapa 3, o vídeo (gravar, sugerir ou escolher), que passa pelas
   telas de áudio; e etapa 4, a finalização, com a análise do tempo, o ajuste, a legenda, os cartões e o Alt S.
   O programa só prepara os arquivos na pasta Posts, Vídeos. Quem posta é você. */
const $ = (id) => document.getElementById(id);
const aux = () => window.__postAux;
const falar = (m, o) => aux().falar(m, o);
const FORMATOS = [
  { valor: 'reel', nome: 'Reel', texto: 'Vídeo vertical, 9 por 16, com legenda em estilo curto e chamativo. Combina com vídeos de até uns 90 segundos.', prop: 'story' },
  { valor: 'video-feed', nome: 'Vídeo de feed', texto: 'Vídeo no feed, em 4 por 5 ou quadrado, com legenda em estilo mais discreto. Aceita vídeos mais longos.', prop: 'retrato-45' },
  { valor: 'story-video', nome: 'Stories em vídeo', texto: 'Vídeo vertical dividido em stories de até 60 segundos cada, numerados na ordem de postar.', prop: 'story' }
];
const CORES = [
  { valor: 'cartao-coral', nome: 'Coral vivo', texto: 'Fundo vermelho alaranjado, forte e alegre.' },
  { valor: 'cartao-azul-royal', nome: 'Azul royal', texto: 'Fundo azul forte, de letra branca.' },
  { valor: 'cartao-esmeralda', nome: 'Verde esmeralda', texto: 'Fundo verde vivo e fresco.' },
  { valor: 'cartao-amarelo-sol', nome: 'Amarelo sol', texto: 'Fundo amarelo brilhante, de letra escura.' },
  { valor: 'cartao-violeta', nome: 'Violeta', texto: 'Fundo roxo intenso, de letra branca.' },
  { valor: 'cartao-laranja', nome: 'Laranja', texto: 'Fundo laranja forte e quente.' },
  { valor: 'cartao-pink', nome: 'Rosa pink', texto: 'Fundo rosa vibrante, de letra branca.' },
  { valor: 'azul-calmo', nome: 'Azul calmo', texto: 'Fundo azul claro e suave.' },
  { valor: 'rosa-quartzo', nome: 'Rosa quartzo', texto: 'Fundo rosado e acolhedor.' },
  { valor: 'verde-sage', nome: 'Verde sálvia', texto: 'Fundo verde acinzentado e tranquilo.' },
  { valor: 'manteiga', nome: 'Manteiga', texto: 'Fundo amarelo claro e quente.' }
];
const v = { formato: '', prop: '', capaQuer: 'sim', capaSalva: null, video: null, edicao: null, analise: null, ajuste: 'borrado', legendar: 'nao', moldura: 'cartao-azul-royal', whisper: false, ocupado: false, feito: false, etapa: 0 };
window.__postVideo = v;

const formatoAtual = () => FORMATOS.find((f) => f.valor === v.formato);
const prop = () => aux().FT.acharProporcaoPost(v.prop);
function mostrar(n) {
  v.etapa = n;
  for (let i = 1; i <= 5; i++) $('po-e' + i).hidden = true;
  for (let i = 1; i <= 3; i++) $('po-v' + i).hidden = n !== i;
  window.scrollTo(0, 0);
  $('po-v' + n + '-titulo').focus();
}
function grupo(id, nome, ops, escolhido, aoMudar) { aux().montarGrupo(id, nome, ops, escolhido, aoMudar); }

function iniciar(fraseDaPasta) {
  Object.assign(v, { formato: '', prop: '', capaQuer: 'sim', capaSalva: null, video: null, edicao: null, analise: null, ajuste: 'borrado', legendar: 'nao', feito: false });
  $('po-v-sugestoes').hidden = true; $('po-v-prop').hidden = true; $('po-v-capa').hidden = true; $('po-v-ajuste').hidden = true; $('po-v-legenda').hidden = true; $('po-v-alternativas').hidden = true;
  $('po-v-info').textContent = ''; $('po-v-analise').textContent = '';
  for (const id of ['po-v-nome', 'po-v-abertura', 'po-v-fecho', 'po-v-link']) $(id).value = '';
  $('po-v-salvo').textContent = '';
  grupo('po-v-formato', 'po-vformato', FORMATOS.map((f) => ({ valor: f.valor, nome: f.nome, texto: f.texto })), '', escolherFormato);
  grupo('po-v-moldura', 'po-vmoldura', CORES, v.moldura, (x) => { v.moldura = x; });
  mostrar(1);
  aux().falarDepois(`${fraseDaPasta} Etapa 2 de 4: Formato do vídeo e capa. Escolha o formato.`, 200);
}
function escolherFormato(x) {
  v.formato = x;
  const f = formatoAtual();
  v.prop = f.prop;
  $('po-v-prop').hidden = x !== 'video-feed';
  if (x === 'video-feed') grupo('po-v-prop', 'po-vprop', [
    { valor: 'retrato-45', nome: 'Retrato, 4 por 5', texto: 'Ocupa mais espaço no feed. É o mais usado.' },
    { valor: 'quadrada', nome: 'Quadrado, 1 por 1', texto: 'Cabe bem em qualquer lugar do perfil.' }
  ], 'retrato-45', (p) => { v.prop = p; falar(`Proporção ${p === 'quadrada' ? 'quadrada' : '4 por 5'}.`); });
  $('po-v-capa').hidden = false;
  grupo('po-v-capa', 'po-vcapa', [
    { valor: 'sim', nome: 'Sim, tirar uma foto de capa agora', texto: 'Ao continuar, o programa abre o Tirar fotos já na proporção do vídeo. A foto vai para a pasta do post, como a primeira imagem.' },
    { valor: 'nao', nome: 'Não, sem capa', texto: 'O vídeo é o primeiro arquivo da pasta.' }
  ], v.capaQuer, (c) => { v.capaQuer = c; falar(c === 'sim' ? 'Com capa. Ao continuar, abre o Tirar fotos.' : 'Sem capa.'); });
  falar(`${f.nome}. ${f.texto} Agora, o grupo de capa: o padrão é tirar uma foto de capa antes.`);
}
function continuar1() {
  if (!v.formato) { falar('Antes de continuar, escolha o formato do vídeo.'); const r = document.querySelector('input[name="po-vformato"]'); if (r) r.focus(); return; }
  if (v.capaQuer === 'sim' && !v.capaSalva) {
    falar('Abrindo o Tirar fotos para a capa, na mesma proporção do vídeo.');
    return aux().abrirCapaDoVideo(prop());
  }
  irParaVideo();
}
const FALA_VIDEO = 'Etapa 3 de 4: Vídeo. Alt G grava um vídeo agora, Alt U sugere um vídeo que você já tem, e Alt E escolhe outro arquivo.';
function irParaVideo() {
  mostrar(2);
  aux().falarDepois(FALA_VIDEO, 200);
  $('po-v-gravar').focus();
}
/** Volta do Tirar fotos (capa), do Gravar vídeo ou das telas de áudio. */
function retomar() {
  const g = aux().st.videoGravado;
  if (g !== undefined) {
    aux().st.videoGravado = undefined;
    mostrar(2);
    if (!g) { aux().falarDepois(`Nada foi escolhido. ${FALA_VIDEO}`, 300); return; }
    receberVideo(g);
    return;
  }
  v.capaSalva = aux().st.capaSalva;
  if (!aux().st.capaSalva) v.capaQuer = 'nao';
  const c = v.capaSalva;
  mostrar(2);
  aux().falarDepois(`${c ? `Capa salva como ${aux().nomeLimpo(c.nome)}, na pasta ${aux().st.pasta.nome}.` : 'Sem capa.'} ${FALA_VIDEO}`, 300);
}
const dur = (s) => { const m = Math.floor(s / 60), x = Math.round(s % 60); return m ? `${m} min ${x} s` : `${x} s`; };

// --- Etapa 3: o vídeo ----------------------------------------------------------------------------------------------
/** Grava na hora: o Gravar vídeo abre já na proporção do post, com a orientação só deste formato. Depois vêm as telas de áudio. */
async function gravarVideo() {
  if (v.ocupado) return;
  const quadrado = v.formato === 'video-feed' && v.prop === 'quadrada';
  let orientacao = '';
  try { const r = await window.api.postvideoOrientacao({ formato: v.formato, proporcao: v.prop }); if (r.ok) orientacao = r.valor; } catch (_) { orientacao = ''; }
  falar('Abrindo o Gravar vídeo.');
  aux().abrirGravarDoVideo(quadrado ? 'quadrado' : 'vertical', orientacao);
}
/** Procura na raiz da pasta Olho da Cena os vídeos que servem a este formato, e mostra com o motivo. */
async function sugerirVideo() {
  if (v.ocupado) return;
  falar('Procurando na pasta Olho da Cena, um instante.');
  const r = await window.api.postvideoSugerir({ formato: v.formato, proporcao: v.prop });
  if (!r.ok) return falar('Não consegui procurar. ' + r.erro);
  const lista = r.valor.sugestoes;
  $('po-v-sugestoes').hidden = !lista.length;
  if (!lista.length) return falar(`Não achei vídeo que sirva na pasta Olho da Cena, entre ${r.valor.olhadas} olhados. Grave um com Alt G, ou escolha outro arquivo com Alt E.`);
  aux().montarGrupo('po-v-sugestoes', 'po-vsug', lista.map((s) => ({ valor: s.arquivo, nome: `${s.nome}`, texto: s.motivo })), '', (arq) => {
    const s = lista.find((x) => x.arquivo === arq);
    if (s) seguirParaAudio({ arquivo: s.arquivo, nome: s.nome, duracao: s.duracao });
  });
  const bem = lista.filter((s) => s.nivel === 'bem').length;
  falar(`Achei ${lista.length === 1 ? '1 vídeo que serve' : lista.length + ' vídeos que servem'}${bem ? `, ${bem === 1 ? '1 serve' : bem + ' servem'} sem ajuste` : ', todos com o fundo borrado'}. Use as setas na lista para ouvir cada um, e escolha o que quiser.`);
  const p = document.querySelector('input[name="po-vsug"]'); if (p) p.focus();
}
async function escolherVideo() {
  if (v.ocupado) return;
  const r = await window.api.postvideoEscolher();
  if (!r.ok) return falar('Não consegui abrir o vídeo. ' + r.erro);
  if (!r.valor) return falar('Nenhum vídeo escolhido.');
  seguirParaAudio({ arquivo: r.valor.arquivo, nome: r.valor.nome, duracao: r.valor.duracao });
}
/** Um vídeo que já existe passa pelas mesmas telas de áudio, e a pessoa decide se segue direto para o post. */
function seguirParaAudio(video) {
  falar(`Vídeo ${video.nome}. Abrindo as telas de áudio. Em cada uma, o botão Ir para o post pula o resto.`);
  aux().abrirAudioDoVideo(video);
}

// --- Etapa 4: a finalização ----------------------------------------------------------------------------------------
/** Chega aqui o vídeo e, se houve, o plano das telas de áudio: cortes, silêncios e trilha. */
async function receberVideo({ video, edicao }) {
  const r = await window.api.postvideoInfo({ arquivo: video.arquivo });
  if (!r.ok) { mostrar(2); return falar('Não consegui abrir o vídeo. ' + r.erro); }
  v.video = r.valor; v.feito = false;
  v.edicao = edicao && Array.isArray(edicao.planos) && edicao.arquivo ? { planos: edicao.planos, audioArq: edicao.arquivo, duracao: edicao.duracao || r.valor.duracao } : null;
  await prepararFinalizacao();
}
const duracaoFinal = () => (v.edicao ? v.edicao.duracao : v.video.duracao);
async function prepararFinalizacao(aviso = '') {
  const d = v.video;
  const [W, H] = [prop().largura, prop().altura];
  const mesma = Math.abs(d.largura / d.altura - W / H) < 0.02;
  v.ajuste = mesma ? 'nenhum' : 'borrado';
  $('po-v-ajuste').hidden = mesma;
  if (!mesma) grupo('po-v-ajuste', 'po-vajuste', [
    { valor: 'borrado', nome: 'Vídeo inteiro, com o fundo borrado', texto: 'Nada do vídeo é cortado. As sobras da tela ficam preenchidas com uma versão desfocada do próprio vídeo. É o padrão.' },
    { valor: 'cortar', nome: 'Preencher a tela, cortando as bordas', texto: 'O vídeo ocupa a tela toda, e o que passa das bordas é cortado. Pode cortar rosto ou texto que esteja perto da borda.' }
  ], 'borrado', (x) => { v.ajuste = x; falar(x === 'cortar' ? 'Preencher a tela, cortando as bordas.' : 'Vídeo inteiro, com fundo borrado.'); });
  // A legenda escrita só existe com o Whisper instalado e se o vídeo tiver som.
  let pode = false;
  try { const e = await window.api.legendaEstado(); pode = !!(e.ok && e.valor.motor && e.valor.modelos.some((m) => m.instalado)); } catch (_) { pode = false; }
  v.whisper = pode && d.temAudio;
  $('po-v-legenda').hidden = !v.whisper;
  v.legendar = v.whisper ? 'sim' : 'nao';
  if (v.whisper) grupo('po-v-legenda', 'po-vleg', [
    { valor: 'sim', nome: 'Sim, escrever a fala na imagem', texto: 'O programa transcreve a fala e escreve na imagem, no estilo do formato. Demora um pouco, e o texto vai também para o arquivo legenda.txt. É o padrão.' },
    { valor: 'nao', nome: 'Não, sem legenda na imagem', texto: 'O vídeo sai sem texto escrito.' }
  ], 'sim', (x) => { v.legendar = x; falar(x === 'sim' ? 'Com legenda escrita na imagem.' : 'Sem legenda na imagem.'); });
  $('po-v-info').textContent = `Vídeo ${d.nome}, ${dur(duracaoFinal())}${v.edicao ? ', já com os cortes e o áudio que você marcou' : ''}, ${d.largura} por ${d.altura}, ${d.temAudio ? 'com som' : 'sem som'}.${mesma ? ' Já está na proporção do post.' : ''}${!pode && d.temAudio ? ' A legenda na imagem precisa do Whisper instalado, em Configurações.' : ''}`;
  await analisar(aviso);
  mostrar(3);
  aux().falarDepois(`Etapa 4 de 4: Finalização do post. ${v.analise ? v.analise.texto : ''} Preencha o que quiser e use Alt S para preparar e salvar.`, 250);
}
/** O tempo do vídeo contra o formato escolhido: ok, perto do limite, passou, dividir ou excede, e o que fazer quando excede. */
async function analisar(aviso = '') {
  const d = v.video;
  const r = await window.api.postvideoAnalise({ formato: v.formato, proporcao: v.prop, duracao: duracaoFinal(), largura: d.largura, altura: d.altura, temAudio: d.temAudio });
  v.analise = r.ok ? r.valor : null;
  const a = v.analise;
  $('po-v-analise').textContent = a ? `${aviso}${a.texto}` : '';
  const caixa = $('po-v-alternativas');
  caixa.textContent = '';
  const excede = !!a && a.nivel === 'excede';
  caixa.hidden = !excede;
  if (excede) {
    const botao = (rotulo, aoClicar, atalho) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = rotulo; if (atalho) b.dataset.atalho = atalho; b.addEventListener('click', aoClicar); caixa.appendChild(b); };
    botao('Gravar de novo, Alt G', () => gravarVideo(), 'G');
    for (const alt of a.alternativas) botao(`Mudar para ${alt.nome}. ${alt.motivo}`, () => mudarTipo(alt.formato));
    if (!a.alternativas.length) { const p = document.createElement('p'); p.tabIndex = 0; p.textContent = 'Este vídeo não cabe em nenhum dos tipos de post em vídeo. Grave de novo, mais curto.'; caixa.appendChild(p); }
  }
}
async function mudarTipo(formato) {
  const f = FORMATOS.find((x) => x.valor === formato);
  if (!f) return;
  v.formato = formato; v.prop = f.prop;
  falar(`Agora o post é ${f.nome}.`);
  await prepararFinalizacao(`Agora o post é ${f.nome}. `);
}

const mudoOuCartao = (texto, link) => [texto, link].filter((x) => x && x.trim()).join('\n\n');
function cartao(texto, link) {
  const p = prop();
  const c = document.createElement('canvas'); c.width = p.largura; c.height = p.altura;
  const res = aux().FT.comporPost(c.getContext('2d'), p.largura, p.altura, { moldura: v.moldura, texto: mudoOuCartao(texto, link), prop: p, figurinha: '' });
  return { c, ok: res && res.ok !== false };
}
const png = async (c) => new Uint8Array(await (await new Promise((ok) => c.toBlob(ok, 'image/png'))).arrayBuffer());

async function salvar() {
  if (v.etapa !== 3) return falar('Alt S prepara e salva o vídeo na Etapa 4, Finalização do post.');
  if (v.ocupado) return;
  if (!v.video) { falar('Antes, grave ou escolha o vídeo, na Etapa 3.'); return; }
  if (v.analise && v.analise.nivel === 'excede') { falar('O vídeo passou do limite deste tipo de post. Grave de novo ou mude o tipo de post, nos botões no começo desta tela.'); $('po-v-alternativas').querySelector('button').focus(); return; }
  if (v.feito) return falar('Este vídeo já foi preparado. Use Alt O para começar outro post.');
  const d = v.video;
  const ab = $('po-v-abertura').value.trim(), fe = $('po-v-fecho').value.trim(), link = $('po-v-link').value.trim();
  let abertura = null, fecho = null;
  if (ab) { const x = cartao(ab, ''); if (!x.ok) { falar('O texto do cartão de abertura não cabe. Use menos palavras.'); $('po-v-abertura').focus(); return; } abertura = await png(x.c); }
  if (fe || link) { const x = cartao(fe, link); if (!x.ok) { falar('O texto do cartão de fecho não cabe. Use menos palavras, ou encurte o endereço.'); $('po-v-fecho').focus(); return; } fecho = await png(x.c); }
  v.ocupado = true;
  const desinscrever = window.api.aoAndamentoPostVideo ? window.api.aoAndamentoPostVideo((a) => { if (a.editando) falar('Aplicando os cortes e o áudio no vídeo.'); else if (a.de > 1) falar(`Preparando a parte ${a.parte} de ${a.de}.`); }) : null;
  try {
    let palavras = null;
    if (v.whisper && v.legendar === 'sim') {
      falar('Escrevendo a fala do vídeo. Isso pode demorar alguns minutos, e eu aviso quando terminar.');
      const e = await window.api.legendaEstado();
      const modelo = e.valor.modelos.find((m) => m.instalado).id;
      // Com edição, a fala é lida no áudio já editado, para os tempos baterem com o vídeo cortado.
      const t = await window.api.legendaTranscrever({ arquivo: v.edicao ? v.edicao.audioArq : d.arquivo, modelo });
      if (t.ok) palavras = t.valor.palavras;
      else falar('Não consegui transcrever a fala, então o vídeo sai sem legenda na imagem. ' + t.erro, { aviso: true });
    }
    falar(`Preparando o vídeo${abertura ? ', com abertura' : ''}${fecho ? ' e fecho' : ''}. Aguarde o aviso de pronto.`);
    const r = await window.api.postvideoPreparar({
      pasta: aux().st.pasta.pasta, arquivo: d.arquivo, formato: v.formato, proporcao: v.prop, ajuste: v.ajuste, palavras,
      abertura, fecho, rotulo: $('po-v-nome').value, duracao: duracaoFinal(), largura: d.largura, altura: d.altura, temAudio: d.temAudio,
      edicao: v.edicao ? { planos: v.edicao.planos, audioArq: v.edicao.audioArq } : null
    });
    if (!r.ok) { falar('Não consegui preparar o vídeo. ' + r.erro); return; }
    v.feito = true;
    const s = r.valor.saidas, n = s.length;
    const msg = n === 1
      ? `Vídeo salvo como ${aux().nomeLimpo(s[0].nome)}, número ${s[0].numero}, na pasta ${aux().st.pasta.nome}${r.valor.legendado ? ', com a fala escrita na imagem' : ''}.`
      : `${n} stories salvos na pasta ${aux().st.pasta.nome}, do número ${s[0].numero} ao ${s[n - 1].numero}, de até 60 segundos cada${r.valor.legendado ? ', com a fala escrita na imagem' : ''}. Poste na ordem dos números.`;
    $('po-v-salvo').textContent = msg;
    aux().bipe('concluido');
    falar(`${msg} Para postar, abra o Instagram e escolha ${v.formato === 'story-video' ? 'os arquivos' : 'o arquivo'} na pasta.`);
    if (palavras || link) legendaTexto(palavras, link);
  } catch (e) { falar('Não consegui preparar o vídeo. ' + (e.message || e)); }
  finally { v.ocupado = false; if (desinscrever) desinscrever(); }
}
async function legendaTexto(palavras, link) {
  const inicio = Date.now();
  try {
    const capa = v.capaSalva && v.capaSalva.caminho;
    const r = await window.api.postvideoLegendaTexto({ pasta: aux().st.pasta.pasta, palavras, link, imagem: capa || '' });
    const espera = v.atrasoLegenda === undefined ? 7000 : v.atrasoLegenda;
    await new Promise((ok) => setTimeout(ok, Math.max(0, espera - (Date.now() - inicio))));
    if (!r.ok) return falar('Não consegui guardar a legenda. ' + r.erro, { aviso: true });
    const x = r.valor;
    if (!x.nome) return;
    v.legendaArquivo = x.nome;
    falar(x.origem === 'gemma' ? `Legenda pronta e guardada em ${x.nome}. Leia, corrija o que quiser e cole na hora de postar.` : `Guardei em ${x.nome} a fala do vídeo${link ? ' e o endereço' : ''}, como rascunho da legenda.${x.motivo ? ' ' + x.motivo : ''}`, { aviso: true });
  } catch (e) { falar('Não consegui escrever a legenda. ' + (e.message || e), { aviso: true }); }
}
function outro() { if (v.etapa !== 3) return falar('Alt O começa outro post depois de preparar o vídeo, na Etapa 4.'); window.postTela.entrar(); }
function voltar1() { aux().irParaEtapa(1); }
function voltar2() { mostrar(1); aux().falarDepois('Etapa 2 de 4: Formato do vídeo e capa.', 200); }
function voltar3() { mostrar(2); aux().falarDepois('Etapa 3 de 4: Vídeo.', 200); }

$('po-v1-continuar').addEventListener('click', continuar1);
$('po-v1-voltar').addEventListener('click', voltar1);
$('po-v-escolher').addEventListener('click', escolherVideo);
$('po-v-gravar').addEventListener('click', gravarVideo);
$('po-v-sugerir').addEventListener('click', sugerirVideo);
$('po-v-salvar').addEventListener('click', salvar);
$('po-v-outro').addEventListener('click', outro);
$('po-v2-voltar').addEventListener('click', voltar2);
$('po-v2-fechar').addEventListener('click', () => aux().fechar());
$('po-v3-voltar').addEventListener('click', voltar3);
$('po-v3-fechar').addEventListener('click', () => aux().fechar());
$('po-v-abrir-pasta').addEventListener('click', () => { const p = aux().st.pasta; if (p) window.api.postAbrirpasta({ pasta: p.pasta }); });
window.postVideo = { iniciar, retomar, estado: v };
document.addEventListener('keydown', (e) => {
  if (v.etapa === 0 || $('tela-post').hidden || ['po-v1', 'po-v2', 'po-v3'].every((id) => $(id).hidden) || document.querySelector('dialog[open]')) return;
  if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey)) return;
  const acao = e.code === 'KeyS' ? salvar
    : e.code === 'KeyE' ? (v.etapa === 2 ? escolherVideo : null)
    : e.code === 'KeyG' ? (v.etapa === 2 || (v.etapa === 3 && !$('po-v-alternativas').hidden) ? gravarVideo : null)
    : e.code === 'KeyU' ? (v.etapa === 2 ? sugerirVideo : null)
    : e.code === 'KeyO' ? outro : null;
  if (!acao) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (!e.repeat) acao();
}, true);
