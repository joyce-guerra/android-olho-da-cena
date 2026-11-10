/* Olho da Cena 1.9: tela de legenda, a mesma no Montar vídeo e no Gravar vídeo.
   Passo 1: de onde vem a legenda (inserir SRT ou gerar com o modelo).
   Passo 2: baixar um modelo, se ainda não houver nenhum (opcional; nada vem no setup).
   Passo 3: com o modelo, gerar só a transcrição em texto ou um SRT com os tempos.
   Passo 4: pra onde é esse vídeo? O estilo da legenda (src/legendas.js).
   Em qualquer passo, Salvar e continuar sem legenda segue o caminho normalmente. */

const $ = (id) => document.getElementById(id);
const LG = window.Legendas;

let F = null; // { falar, alertar, chamar }
const lg = { opcoes: null, cues: null, palavras: null, chavePalavras: null, nomeSrt: '', modelo: null, estado: null,
  ocupado: null, voltarDoEstilo: 'lg-origem', avisado: -1, faseAvisada: null };

const PASSOS = ['lg-origem', 'lg-baixar', 'lg-gerar', 'lg-estilo', 'lg-revisar'];
function mostrarPasso(id, foco) {
  for (const p of PASSOS) $(p).hidden = p !== id;
  // A revisão do texto fica antes do Passo 4 e não tem link próprio: marca o Passo 4.
  const marcado = id === 'lg-revisar' ? 'lg-estilo' : id;
  PASSOS.slice(0, 4).forEach((p, i) => {
    if (p === marcado) $('lg-nav-' + (i + 1)).setAttribute('aria-current', 'page'); else $('lg-nav-' + (i + 1)).removeAttribute('aria-current');
  });
  (foco || $(id + '-titulo')).focus();
}
const passoAtual = () => PASSOS.find((p) => !$(p).hidden) || 'lg-origem';

// 1.9.1: enquanto baixa ou transcreve, um bipe curto a cada 4 segundos diz que o programa está
// trabalhando; quando para, um bipe de dois tons diz que terminou. Com "Só som" nas Configurações
// (só a fala), não há bipe.
let bipes = null;
const comBipe = () => (window.__olhoConfig || {}).confirmacao !== 'som' && F.bipe;
function comecarBipes() {
  pararBipes();
  if (comBipe()) bipes = setInterval(() => F.bipe('andamento'), 4000);
}
function pararBipes(terminou) {
  if (bipes) { clearInterval(bipes); bipes = null; }
  if (terminou && comBipe()) F.bipe('concluido');
}

/** 1.9.1: andamento falado como o resultado do Alt F: a região de fala é limpa e a frase entra um
   instante depois, para o NVDA ler mesmo com a tela parada e sem foco mudando. */
function falarAndamento(msg) {
  const r = $('status');
  if (r) r.textContent = '';
  setTimeout(() => F.falar(msg), 150);
}

function ocupadoAgora() {
  if (!lg.ocupado) return false;
  F.falar(`Aguarde, ${lg.ocupado}. Para parar, use Cancelar.`);
  return true;
}
function terminar(resultado) {
  if (ocupadoAgora()) return;
  const op = lg.opcoes;
  lg.opcoes = null;
  if (op) op.aoTerminar(resultado);
}
function fechar() {
  if (ocupadoAgora()) return;
  F.chamar('appSair').catch(() => {});
}

// --- Passo 1 ----------------------------------------------------------------------------------

async function inserirSrt() {
  if (ocupadoAgora()) return;
  let r;
  try { r = await F.chamar('legendaAbrirsrt'); } catch (e) { return F.alertar('Não consegui abrir a legenda. ' + e.message); }
  if (!r) return;
  lg.cues = r.cues; lg.palavras = null; lg.nomeSrt = r.nome;
  const ajustes = r.ajustes ? (r.ajustes === 1 ? ' Foi ajustado 1 ponto' : ` Foram ajustados ${r.ajustes} pontos`) + ', como quebra de linha, palavra cortada ou duração.' : ' Não precisou de nenhum ajuste.';
  $('lg-origem-info').textContent = `Legenda ${r.nome}: ${r.cues.length === 1 ? '1 legenda' : r.cues.length + ' legendas'}.${ajustes}`;
  lg.voltarDoEstilo = 'lg-origem';
  abrirRevisar('Pronto: ' + $('lg-origem-info').textContent);
}
async function comModelo() {
  if (ocupadoAgora()) return;
  try { lg.estado = await F.chamar('legendaEstado'); } catch (e) { return F.alertar(e.message); }
  if (lg.estado.modelos.some((m) => m.instalado)) abrirGerar();
  else abrirBaixar('Adicionar legenda através de um modelo. Ainda não há modelo instalado.');
}

// --- Passo 2 ----------------------------------------------------------------------------------

function abrirBaixar(aviso) {
  $('lg-baixar-estado').textContent = '';
  const est = lg.estado || { modelos: [] };
  for (const m of est.modelos) {
    const b = $('lg-baixar-' + m.id);
    b.disabled = m.instalado;
    b.textContent = m.instalado ? `O ${m.nome} já está instalado` : `Baixar o ${m.nome}, ${m.tamanhoTexto}`;
  }
  mostrarPasso('lg-baixar');
  F.falar(`${aviso ? aviso + ' ' : ''}Passo 2 de 4: Baixar um modelo.`);
}
async function baixar(id) {
  if (ocupadoAgora()) return;
  const m = (lg.estado || { modelos: [] }).modelos.find((x) => x.id === id);
  if (!m || m.instalado) return;
  lg.ocupado = `estou baixando o ${m.nome}`;
  lg.avisado = -1; lg.faseAvisada = null;
  $('lg-baixar-cancelar').hidden = false;
  $('lg-baixar-barra').hidden = false;
  $('lg-baixar-estado').textContent = `Baixando o ${m.nome}. Pode levar alguns minutos.`;
  F.falar($('lg-baixar-estado').textContent);
  comecarBipes();
  try {
    lg.estado = await F.chamar('legendaBaixar', { modelo: id });
    pararBipes(true);
    lg.ocupado = null;
    lg.modelo = id;
    abrirGerar(`O ${m.nome} foi baixado e ficou guardado no computador.`);
  } catch (e) {
    lg.ocupado = null;
    if (e.message === 'CANCELADO') { $('lg-baixar-estado').textContent = 'Download cancelado. Nada ficou pela metade no computador.'; F.falar($('lg-baixar-estado').textContent); }
    else F.alertar(`Não consegui baixar o ${m.nome}: ${e.message} Confira a internet e tente de novo.`);
  } finally {
    pararBipes();
    $('lg-baixar-cancelar').hidden = true;
    $('lg-baixar-barra').hidden = true;
  }
}
function naoBaixar() {
  if (ocupadoAgora()) return;
  $('lg-origem-info').textContent = 'Nenhum modelo baixado. Você pode inserir um SRT ou seguir sem legenda, com Salvar e continuar.';
  mostrarPasso('lg-origem');
  F.falar($('lg-origem-info').textContent);
}

// --- Passo 3 ----------------------------------------------------------------------------------

function abrirGerar(aviso) {
  const est = lg.estado || { modelos: [] };
  const instalados = est.modelos.filter((m) => m.instalado);
  if (!lg.modelo || !instalados.some((m) => m.id === lg.modelo)) lg.modelo = (instalados[0] || {}).id || null;
  const g = $('lg-grupo-modelo');
  g.querySelectorAll('.radio').forEach((d) => d.remove());
  g.hidden = instalados.length < 2;
  for (const m of instalados) {
    const d = document.createElement('div'); d.className = 'radio';
    const inp = document.createElement('input');
    inp.type = 'radio'; inp.name = 'lg-modelo'; inp.id = 'lg-modelo-' + m.id; inp.value = m.id; inp.checked = m.id === lg.modelo;
    inp.addEventListener('change', () => { if (inp.checked) lg.modelo = m.id; });
    const lab = document.createElement('label'); lab.htmlFor = inp.id; lab.textContent = m.nome.charAt(0).toUpperCase() + m.nome.slice(1);
    d.append(inp, lab); g.appendChild(d);
  }
  $('lg-outro-modelo').hidden = instalados.length === est.modelos.length;
  $('lg-gerar-estado').textContent = '';
  mostrarPasso('lg-gerar');
  const nome = (est.modelos.find((m) => m.id === lg.modelo) || {}).nome;
  F.falar(`${aviso ? aviso + ' ' : ''}Passo 3 de 4: Gerar com o ${nome}.`);
}
/** Transcreve uma vez por áudio e modelo; as duas opções do passo 3 usam o mesmo resultado. */
async function transcrever() {
  const chave = `${lg.opcoes.audio}|${lg.modelo}`;
  if (lg.palavras && lg.chavePalavras === chave) return lg.palavras;
  lg.ocupado = 'estou fazendo a transcrição';
  lg.avisado = -1; lg.faseAvisada = null;
  $('lg-gerar-cancelar').hidden = false;
  $('lg-gerar-barra').hidden = false;
  $('lg-gerar-estado').textContent = 'Transcrevendo o áudio.';
  F.falar($('lg-gerar-estado').textContent);
  // Sem notícia por 30 segundos, avisa que continua trabalhando.
  lg.ultimoAviso = Date.now();
  comecarBipes();
  const vivo = setInterval(() => { if (Date.now() - lg.ultimoAviso >= 29000) { lg.ultimoAviso = Date.now(); falarAndamento('Ainda transcrevendo, aguarde.'); } }, 5000);
  try {
    const r = await F.chamar('legendaTranscrever', { arquivo: lg.opcoes.audio, modelo: lg.modelo });
    lg.palavras = r.palavras; lg.chavePalavras = chave; lg.cues = null;
    pararBipes(true);
    return lg.palavras;
  } finally {
    pararBipes();
    clearInterval(vivo);
    lg.ocupado = null;
    $('lg-gerar-cancelar').hidden = true;
    $('lg-gerar-barra').hidden = true;
  }
}
async function gerar(tipo) {
  if (ocupadoAgora()) return;
  let palavras;
  try { palavras = await transcrever(); } catch (e) {
    if (e.message === 'CANCELADO') { $('lg-gerar-estado').textContent = 'Transcrição cancelada.'; return F.falar('Transcrição cancelada.'); }
    return F.alertar('Não consegui fazer a transcrição. ' + e.message);
  }
  if (tipo === 'texto') {
    try {
      const r = await F.chamar('legendaSalvartexto', { palavras, nome: lg.opcoes.nome });
      $('lg-gerar-estado').textContent = `Pronto: transcrição salva, com ${r.linhas === 1 ? '1 linha' : r.linhas + ' linhas'} e ${palavras.length} palavras, na pasta ${r.documentos}, Olho da Cena, com o nome ${r.nome.replace(/\.txt$/i, '')}. Para pôr legenda no vídeo, gere também o SRT; para seguir sem legenda, use Salvar e continuar.`;
      falarAndamento($('lg-gerar-estado').textContent);
    } catch (e) { F.alertar('Não consegui salvar a transcrição. ' + e.message); }
    return;
  }
  lg.voltarDoEstilo = 'lg-gerar';
  const falas = contarFalas(palavras);
  $('lg-gerar-estado').textContent = `Pronto: SRT gerado, com ${falas === 1 ? '1 fala cronometrada' : falas + ' falas cronometradas'}, ${palavras.length} palavras.`;
  abrirRevisar($('lg-gerar-estado').textContent);
}

// --- 1.9.1: revisar o texto, sem mexer nos tempos ------------------------------------------------
// Cada campo é uma fala: uma frase da transcrição (até o ponto ou uma pausa longa), ou uma legenda do
// SRT inserido. O texto novo ocupa o mesmo tempo da fala; numa transcrição, as palavras novas dividem
// esse tempo pelo tamanho de cada uma. Assim a legenda continua junto da voz.
function falasAtuais() {
  if (!lg.palavras) return (lg.cues || []).map((c, i) => ({ i, inicio: c.inicio, fim: c.fim, texto: c.texto }));
  const falas = []; let ini = 0;
  for (let i = 0; i < lg.palavras.length; i++) {
    const p = lg.palavras[i], prox = lg.palavras[i + 1];
    if (!prox || /[.!?…]["»”']?$/.test(p.texto) || prox.inicio - p.fim > 1) {
      const ps = lg.palavras.slice(ini, i + 1);
      falas.push({ de: ini, ate: i, inicio: ps[0].inicio, fim: ps[ps.length - 1].fim, texto: ps.map((x) => x.texto).join(' ') });
      ini = i + 1;
    }
  }
  return falas;
}
const tempoCurto = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function abrirRevisar(aviso) {
  if (!lg.palavras && !(lg.cues && lg.cues.length)) return mostrarPasso('lg-origem');
  lg.falas = falasAtuais();
  $('lg-revisar-pergunta').hidden = false;
  $('lg-revisar-lista').hidden = true;
  $('lg-revisar-lista').innerHTML = '';
  $('lg-revisar-info').textContent = `${lg.falas.length === 1 ? '1 fala' : lg.falas.length + ' falas'}. Quer editar o texto da legenda? Os tempos não mudam.`;
  mostrarPasso('lg-revisar');
  falarAndamento(`${aviso ? aviso + ' ' : ''}Quer editar o texto da legenda?`);
}
function mostrarCamposRevisar() {
  const lista = $('lg-revisar-lista');
  lista.innerHTML = '';
  lg.falas.forEach((f, k) => {
    const id = 'lg-fala-' + k;
    const lab = document.createElement('label');
    lab.htmlFor = id;
    lab.textContent = `Fala ${k + 1} de ${lg.falas.length}, de ${tempoCurto(f.inicio)} a ${tempoCurto(f.fim)}`;
    const campo = document.createElement('textarea');
    campo.id = id; campo.rows = 2; campo.value = f.texto;
    lista.append(lab, campo);
  });
  $('lg-revisar-pergunta').hidden = true;
  lista.hidden = false;
  const primeiro = $('lg-fala-0');
  if (primeiro) primeiro.focus();
  falarAndamento(`${lg.falas.length === 1 ? '1 fala' : lg.falas.length + ' falas'}.`);
}
/** Troca o texto das falas editadas, mantendo o começo e o fim de cada fala. */
function aplicarRevisao() {
  let mudou = 0;
  const novas = [];
  lg.falas.forEach((f, k) => {
    const campo = $('lg-fala-' + k);
    const texto = campo ? campo.value.replace(/\s+/g, ' ').trim() : f.texto;
    if (texto !== f.texto) mudou++;
    if (!lg.palavras) { if (texto) novas.push({ inicio: f.inicio, fim: f.fim, texto }); return; }
    if (texto === f.texto) { novas.push(...lg.palavras.slice(f.de, f.ate + 1)); return; }
    const ps = texto ? texto.split(' ') : [];
    const letras = ps.reduce((a, p) => a + p.length + 1, 0);
    let t = f.inicio;
    for (const p of ps) { const dur = (f.fim - f.inicio) * (p.length + 1) / letras; novas.push({ inicio: t, fim: t + dur, texto: p }); t += dur; }
  });
  if (lg.palavras) lg.palavras = novas; else lg.cues = novas;
  return mudou;
}
function revisarContinuar() {
  if (ocupadoAgora()) return;
  if ($('lg-revisar-lista').hidden) return abrirEstilo('');
  const mudou = aplicarRevisao();
  if (!lg.palavras && !(lg.cues && lg.cues.length)) { F.alertar('Todas as falas ficaram vazias. Escreva o texto ou volte e siga sem legenda.'); return; }
  abrirEstilo(mudou ? `Texto revisado: ${mudou === 1 ? '1 fala alterada' : mudou + ' falas alteradas'}, com os mesmos tempos.` : 'Nenhuma fala alterada.');
}

// --- Passo 4 ----------------------------------------------------------------------------------

function legendasDoEstilo(id) {
  return lg.palavras ? LG.legendasDasPalavras(lg.palavras, id) : LG.legendasDoSrt(lg.cues || [], id);
}
function estiloEscolhido() { const r = document.querySelector('input[name="lg-estilo"]:checked'); return r ? r.value : ''; }
function resumir() {
  const id = estiloEscolhido();
  if (!id) { $('lg-estilo-resumo').textContent = ''; return; }
  const l = legendasDoEstilo(id);
  $('lg-estilo-resumo').textContent = l.length ? `Com este estilo, ${l.length === 1 ? '1 legenda' : l.length + ' legendas'}. A primeira: ${l[0].texto}` : 'Nenhuma legenda.';
}
/** 1.9.1: aviso (o que acabou de dar certo) e o Passo 4 numa fala só, um instante depois de o
   foco ir para o título do passo: falados separados, o NVDA lia o foco e perdia o aviso. */
function abrirEstilo(aviso) {
  if (!lg.palavras && !(lg.cues && lg.cues.length)) {
    F.falar('Ainda não há legenda: insira um SRT ou gere com o modelo, no Passo 1.');
    return mostrarPasso('lg-origem');
  }
  resumir();
  mostrarPasso('lg-estilo');
  const escolhido = estiloEscolhido();
  falarAndamento(`${aviso ? aviso + ' ' : ''}Passo 4 de 4: Pra onde é esse vídeo?` + (escolhido ? ` Escolhido: ${LG.estilo(escolhido).nome}.` : ''));
}
/** Legenda gerada ou inserida e ainda sem estilo: o Salvar e continuar leva ao Passo 4, em vez de seguir sem legenda. */
function continuarSemPerder() {
  if (ocupadoAgora()) return;
  if (lg.palavras || (lg.cues && lg.cues.length)) return abrirEstilo('A legenda está feita.');
  terminar(null);
}
/** Falas do texto: frases terminadas em ponto, exclamação ou interrogação, ou separadas por uma pausa longa. */
function contarFalas(palavras) {
  let n = 0;
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i], prox = palavras[i + 1];
    if (!prox || /[.!?…]["»”']?$/.test(p.texto) || prox.inicio - p.fim > 1) n++;
  }
  return n;
}
async function estiloContinuar() {
  if (ocupadoAgora()) return;
  const id = estiloEscolhido();
  if (!id) {
    const r = document.querySelector('input[name="lg-estilo"]'); if (r) r.focus();
    return F.alertar('Escolha pra onde é esse vídeo, ou volte e siga sem legenda.');
  }
  const legendas = legendasDoEstilo(id);
  if (!legendas.length) return F.alertar('A legenda ficou vazia.');
  try {
    const r = await F.chamar('legendaSalvarsrt', { legendas, estilo: id, nome: lg.opcoes.nome });
    F.falar(`Legenda salva na pasta ${r.documentos}, Olho da Cena, com o nome ${r.nome.replace(/\.srt$/i, '')}.`);
    terminar({ srt: r.caminho, estilo: id, nome: r.nome, quantas: legendas.length });
  } catch (e) { F.alertar('Não consegui salvar a legenda. ' + e.message); }
}

// --- Abrir e começar ----------------------------------------------------------------------------

/** opcoes: { audio, nome, aoTerminar(r ou null), aoVoltar() } */
export function abrirLegenda(opcoes) {
  const mesmoAudio = lg.opcoes === null && lg.chavePalavras && lg.chavePalavras.startsWith(opcoes.audio + '|');
  lg.opcoes = opcoes;
  if (!mesmoAudio) { lg.palavras = null; lg.chavePalavras = null; }
  lg.cues = mesmoAudio ? lg.cues : null;
  $('lg-origem-info').textContent = '';
  if (window.olho) window.olho.mostrarTela('legenda');
  mostrarPasso('lg-origem');
  F.falar('Legenda. Passo 1 de 4: De onde vem a legenda.');
}

export function iniciarLegenda(funcoes) {
  F = funcoes;
  // Estilos, com a descrição inteira de cada um ligada ao botão de escolha.
  const g = $('lg-grupo-estilo');
  for (const e of LG.ESTILOS) {
    const d = document.createElement('div'); d.className = 'radio';
    const inp = document.createElement('input');
    inp.type = 'radio'; inp.name = 'lg-estilo'; inp.value = e.id; inp.id = 'lg-estilo-' + e.id;
    inp.setAttribute('aria-describedby', `lg-estilo-${e.id}-desc`);
    // O leitor já diz o nome e a descrição do estilo ao escolher. A contagem e o trecho ficam num parágrafo à parte, para quem quiser ouvir com o Tab.
    inp.addEventListener('change', () => { if (inp.checked) resumir(); });
    const lab = document.createElement('label'); lab.htmlFor = inp.id; lab.textContent = e.nome;
    const desc = document.createElement('div'); desc.id = `lg-estilo-${e.id}-desc`; desc.className = 'desc';
    // 2.0: nome (o rótulo), indicação, contraindicação e descrição, como nas outras telas.
    for (const [rot, txt] of [['Indicação', e.uso], ['Contraindicação', e.evitar], ['Descrição', e.fortes]]) {
      const p = document.createElement('p'); p.textContent = `${rot}: ${txt}`; desc.appendChild(p);
    }
    d.append(inp, lab, desc); g.appendChild(d);
  }
  $('lg-inserir-srt').addEventListener('click', inserirSrt);
  $('lg-com-modelo').addEventListener('click', comModelo);
  $('lg-origem-continuar').addEventListener('click', continuarSemPerder);
  $('lg-origem-voltar').addEventListener('click', () => { if (ocupadoAgora()) return; const op = lg.opcoes; lg.opcoes = null; if (op) op.aoVoltar(); });
  $('lg-baixar-pequeno').addEventListener('click', () => baixar('pequeno'));
  $('lg-baixar-grande').addEventListener('click', () => baixar('grande'));
  $('lg-nao-baixar').addEventListener('click', naoBaixar);
  $('lg-baixar-cancelar').addEventListener('click', () => F.chamar('legendaCancelar').catch(() => {}));
  $('lg-baixar-continuar').addEventListener('click', () => terminar(null));
  $('lg-baixar-voltar').addEventListener('click', () => { if (!ocupadoAgora()) mostrarPasso('lg-origem'); });
  $('lg-transcricao').addEventListener('click', () => gerar('texto'));
  $('lg-gerar-srt').addEventListener('click', () => gerar('srt'));
  $('lg-outro-modelo').addEventListener('click', () => { if (!ocupadoAgora()) abrirBaixar(); });
  $('lg-gerar-cancelar').addEventListener('click', () => F.chamar('legendaCancelar').catch(() => {}));
  $('lg-gerar-continuar').addEventListener('click', continuarSemPerder);
  $('lg-gerar-voltar').addEventListener('click', () => { if (!ocupadoAgora()) mostrarPasso('lg-origem'); });
  $('lg-estilo-continuar').addEventListener('click', estiloContinuar);
  $('lg-estilo-voltar').addEventListener('click', () => { if (!ocupadoAgora()) abrirRevisar(''); });
  $('lg-revisar-sim').addEventListener('click', mostrarCamposRevisar);
  $('lg-revisar-nao').addEventListener('click', () => abrirEstilo(''));
  $('lg-revisar-continuar').addEventListener('click', revisarContinuar);
  $('lg-revisar-voltar').addEventListener('click', () => {
    if (ocupadoAgora()) return;
    if (lg.voltarDoEstilo === 'lg-gerar') abrirGerar(); else mostrarPasso('lg-origem');
  });
  for (const id of ['lg-origem-fechar', 'lg-baixar-fechar', 'lg-gerar-fechar', 'lg-estilo-fechar', 'lg-revisar-fechar']) $(id).addEventListener('click', fechar);
  $('lg-nav-1').addEventListener('click', () => { if (!ocupadoAgora()) mostrarPasso('lg-origem'); });
  $('lg-nav-2').addEventListener('click', async () => { if (ocupadoAgora()) return; lg.estado = await F.chamar('legendaEstado'); abrirBaixar(); });
  $('lg-nav-3').addEventListener('click', async () => {
    if (ocupadoAgora()) return;
    lg.estado = await F.chamar('legendaEstado');
    if (!lg.estado.modelos.some((m) => m.instalado)) return abrirBaixar('Ainda não há modelo instalado.');
    abrirGerar();
  });
  $('lg-nav-4').addEventListener('click', () => { if (!ocupadoAgora()) abrirEstilo(''); });
  // Andamento do download e da transcrição, falado de 10 em 10 por cento.
  window.api.aoProgressoLegenda((p) => {
    const barra = p.fase === 'transcricao' ? $('lg-gerar-barra') : $('lg-baixar-barra');
    barra.value = p.pct;
    const degrau = Math.floor(p.pct / 10);
    // Cada fase (motor, modelo, transcrição) conta do zero.
    if (lg.faseAvisada !== p.fase) { lg.faseAvisada = p.fase; lg.avisado = -1; }
    if (degrau <= lg.avisado || p.pct >= 100) return;
    lg.avisado = degrau;
    if (p.pct === 0) return;
    const o = p.fase === 'transcricao' ? 'Transcrição' : p.fase === 'motor' ? 'Preparando o Whisper' : 'Download';
    const msg = `${o}: ${p.pct} por cento.`;
    (p.fase === 'transcricao' ? $('lg-gerar-estado') : $('lg-baixar-estado')).textContent = msg;
    lg.ultimoAviso = Date.now();
    falarAndamento(msg);
  });
}

/** 1.9.1: Alt S na tela de legenda: o SRT (no estilo escolhido, ou como está), senão a transcrição. */
export async function salvarLegendaAgora() {
  if (ocupadoAgora() || !lg.opcoes) return;
  if (!$('lg-revisar-lista').hidden && !$('lg-revisar').hidden) aplicarRevisao();
  const estilo = estiloEscolhido() || 'youtube';
  try {
    if (lg.palavras || (lg.cues && lg.cues.length)) {
      const legendas = legendasDoEstilo(estilo);
      const r = await F.chamar('legendaSalvarsrt', { legendas, estilo, nome: lg.opcoes.nome });
      return falarAndamento(`Salvo: legenda com ${legendas.length === 1 ? '1 fala' : legendas.length + ' falas'}, na pasta ${r.documentos}, Olho da Cena, com o nome ${r.nome.replace(/\.srt$/i, '')}.`);
    }
    falarAndamento('Nada para salvar ainda: insira um SRT ou gere a legenda com o modelo.');
  } catch (e) { F.alertar('Não consegui salvar. ' + e.message); }
}

export function ocupadoLegenda() { return lg.ocupado ? `Aguarde, ${lg.ocupado}.` : null; }
