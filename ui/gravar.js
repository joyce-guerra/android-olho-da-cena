import { iniciarAudioCortes, abrirAudioCortes, voltarAosCortes, abrirEqualizacao, sairAudioCortes as sairAudio, salvarAudioComoEsta } from './audio-cortes.js';
import { iniciarLegenda, abrirLegenda, ocupadoLegenda, salvarLegendaAgora } from './legenda-tela.js';
/* Olho da Cena: telas Gravar vídeo e Melhorar o vídeo (vieram do Gravador de Vídeo 0.3).
   Proporção e qualidade, câmera e microfone, leitura sombreada, legenda opcional no vídeo,
   Alt R grava e para, Alt P pausa (com bipes só para quem grava), Alt E fala o enquadramento,
   a mão na frente do rosto, o braço cortado na lateral e os objetos na imagem (antes e durante).
   Depois da gravação (1.3.1): Descartar vídeo, Salvar e fechar, Salvar e continuar (Cortes, depois Alterar plano de fundo), Voltar.
   O Melhorar também abre a partir do Editar vídeo, com o vídeo carregado lá.
   Módulo à parte: os nomes daqui não se misturam com os do renderer.js (Montar, Editar...). */

const $ = (id) => document.getElementById(id);
const PU = window.api.puro;
const st = {
  seguir: { cx: 0.5, alvo: null, ultimo: 0, ocupado: false },
  config: null, cameraStream: null, micStream: null, frases: [], atual: 0,
  gravador: null, gravId: null, cadeia: Promise.resolve(), erroGravar: null, pausado: false,
  inicioTrecho: 0, acumulado: 0, salvando: false, analisando: false, visao: null,
  anuncios: [], ultimoEnquadramento: null, ultimoSalvo: null, legendaCache: null,
  audioCtx: null, fonteAudio: null, ganho: null, destino: null, bipes: [],
  original: null, melhoria: null, ultimaMelhoria: null,
  // Olho da Cena: de onde veio o vídeo do Melhorar ('gravar' ou 'editar'), se a tela está aberta,
  // e se câmera e microfone já foram preparados nesta abertura.
  origem: 'gravar', aberto: false, preparado: false, dispositivosProntos: false, desenho: null
};
window.__gravador = st; // usado só pelos testes automáticos
st.garantirFundoMoldura = (...a) => garantirFundoMoldura(...a);
st.trabalhador = (...a) => trabalhador(...a); // idem

// --- Fala para o leitor de tela --------------------------------------------------

let alternar = false;
let falaAdiada = null;
/** Fala daqui a pouco (depois de o foco mudar), a menos que outra fala venha antes. */
function falarDepois(msg, ms) {
  clearTimeout(falaAdiada);
  falaAdiada = setTimeout(() => falar(msg), ms);
}
function falar(msg) {
  clearTimeout(falaAdiada);
  alternar = !alternar; // repetir a mesma frase também precisa ser anunciado
  $('status').textContent = msg ? msg + (alternar ? '\u00a0' : '') : '';
  if (msg) st.anuncios.push(msg);
}
/** 1.8.4: resultado longo de análise: escrito na tela e lido pelo NVDA (região assertiva, limpa e escreve depois). */
// 1.8.5: exatamente como o Alt E fala: falar() (região de status). O texto fica também na tela.
function anunciarResultado(id, msg) {
  // 1.8.6: limpa antes e fala depois, para o NVDA ler de novo mesmo se o texto for igual ao anterior.
  $(id).textContent = '';
  setTimeout(() => { $(id).textContent = msg; falar(msg); }, 150);
}
function alertar(msg) {
  $('alerta').textContent = '';
  st.anuncios.push('ALERTA: ' + msg);
  setTimeout(() => { $('alerta').textContent = msg; }, 30);
}
async function chamar(nome, dados) {
  const r = await window.api[nome](dados);
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}
const salvarConfig = (c) => chamar('configSalvar', c).then((n) => { st.config = n; }).catch(() => {});
const gravando = () => !!st.gravador && st.gravador.state !== 'inactive';

// --- Escolhas em grupos de opções (cada opção com a descrição de uso) ---------------------

function radioDoGrupo(o, nome, escolhido, aoMudar) {
  const d = document.createElement('div');
  d.className = 'radio';
  const inp = document.createElement('input');
  inp.type = 'radio'; inp.name = nome; inp.value = o.valor; inp.id = `${nome}-${o.valor}`;
  inp.setAttribute('aria-describedby', `${inp.id}-desc`);
  inp.checked = o.valor === escolhido;
  const lab = document.createElement('label');
  lab.htmlFor = inp.id; lab.textContent = o.nome;
  const desc = document.createElement('p');
  desc.className = 'desc'; desc.id = `${inp.id}-desc`; desc.textContent = o.descricao;
  inp.addEventListener('change', () => { if (inp.checked) aoMudar(o.valor); });
  // 1.3.1: miniatura do fundo, só decorativa (o leitor de tela não para nela). As molduras não têm miniatura.
  if (nome === 'fundo' && !String(o.valor).startsWith('m-')) {
    const img = document.createElement('img');
    img.className = 'miniatura'; img.alt = ''; img.setAttribute('aria-hidden', 'true');
    img.src = `app://olho/fundos/mini/${o.valor}.jpg`;
    d.append(img);
  }
  d.append(inp, lab, desc);
  return d;
}
function montarGrupo(idGrupo, nome, opcoes, escolhido, aoMudar) {
  const g = $(idGrupo);
  for (const o of opcoes) g.appendChild(radioDoGrupo(o, nome, escolhido, aoMudar));
}
/** Seções que abrem e fecham, como no Tirar fotos. cats: categorias com itens (valores) ou subs. */
function montarArvoreGrupo(idGrupo, nome, cats, opcoes, escolhido, aoMudar) {
  const g = $(idGrupo);
  g.querySelectorAll('.radio, details').forEach((d) => d.remove());
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
      for (const v of cat.itens) { const o = opcoes.find((x) => x.valor === v); if (o) det.appendChild(radioDoGrupo(o, nome, escolhido, aoMudar)); }
      if (cat.itens.includes(escolhido)) det.open = true;
    }
    pai.appendChild(det);
  };
  for (const cat of cats) secao(cat, g);
}
/** O fundo escolhido: um fundo pronto ou uma moldura com cenário (valor m- mais o nome dela). */
function fundoEscolhido(valor) {
  const v = String(valor || '');
  if (v.startsWith('m-')) { const m = window.Fotos.acharMoldura(v.slice(2)); return m ? { nome: m.nome, sufixo: `moldura ${m.nome.toLowerCase()}` } : null; }
  return PU.FUNDOS.find((x) => x.valor === v) || null;
}
/** Moldura como fundo: a tela desenha o cenário no formato do vídeo e o programa guarda como imagem parada. */
async function garantirFundoMoldura(formato, fundo) {
  const v = String(fundo === undefined ? valorDe('fundo') : fundo || '');
  if (!v.startsWith('m-')) return;
  const FTG = window.Fotos;
  const fmt = formato === 'vertical' || formato === 'quadrado' ? formato : 'horizontal';
  const [W, H] = fmt === 'vertical' ? [720, 1280] : fmt === 'quadrado' ? [960, 960] : [1280, 720];
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const vazio = document.createElement('canvas'); vazio.width = 8; vazio.height = 8;
  FTG.compor(c.getContext('2d'), W, H, { foto: vazio, fw: 8, fh: 8, mascara: vazio, cx: 0.5, rosto: null, grande: false, efeito: 'moldura', moldura: v.slice(2), fundoImg: null, texto: '', figurinha: '', localTexto: '' });
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
  const r = await window.api.fundoSalvarmoldura({ valor: v, formato: fmt, dados: new Uint8Array(await blob.arrayBuffer()) });
  if (!r.ok) throw new Error(r.erro);
}
/** Os fundos do vídeo: os fundos prontos e as molduras com cenário, nas mesmas categorias do Tirar fotos. */
function opcoesDeFundo() {
  const FTG = window.Fotos;
  const fundos = PU.FUNDOS.map((f) => ({ valor: f.valor, nome: f.nome, descricao: FTG.textoDoFundo(f) }));
  const molduras = FTG.MOLDURAS.filter((m) => m.fundoReal === 'substitui' && !m.soPost).map((m) => ({ valor: 'm-' + m.valor, nome: m.nome, descricao: m.texto }));
  const todas = [...fundos, ...molduras];
  const existe = new Set(todas.map((o) => o.valor));
  const chave = (v) => (v.startsWith('f:') ? v.slice(2) : 'm-' + v.slice(2));
  let cats = FTG.filtrarCategoriasVisual(FTG.CATEGORIAS_VISUAL, (v) => existe.has(chave(v)), chave);
  const usados = new Set(cats.flatMap((c) => (c.subs ? c.subs.flatMap((s) => s.itens) : c.itens)));
  const sobra = todas.filter((o) => !usados.has(o.valor)).map((o) => o.valor);
  if (sobra.length) cats = [...cats, { valor: 'outros', nome: 'Outros', itens: sobra }];
  return { cats, opcoes: todas };
}
const valorDe = (nome) => { const r = document.querySelector(`input[name="${nome}"]:checked`); return r ? r.value : ''; };
function focarGrupo(nome) {
  const r = document.querySelector(`input[name="${nome}"]:checked`) || document.querySelector(`input[name="${nome}"]`);
  if (r) r.focus();
}
// --- 1.9: etapas da tela de gravar ------------------------------------------------------
const NOMES_ETAPA_GRAV = ['', 'Proporção e qualidade', 'Câmera e microfone', 'Leitura sombreada', 'Gravar'];
st.gravEtapa = 1;
/** Mostra a etapa n da tela de gravar (1 a 4). O foco vai para o título da etapa. */
function irParaEtapaGrav(n, { silencioso = false, foco = null } = {}) {
  st.gravEtapa = n;
  for (let i = 1; i <= 4; i++) {
    $('grav-e' + i).hidden = i !== n;
    if (i === n) $('grav-nav-' + i).setAttribute('aria-current', 'page'); else $('grav-nav-' + i).removeAttribute('aria-current');
  }
  // 2.0.6: a prévia da câmera só aparece da Etapa 2 em diante, no alto da tela.
  $('previa').hidden = n === 1;
  if (!$('grav-captura').hidden) window.scrollTo(0, 0); // a prévia fica no alto, à vista, ao entrar na etapa
  if ($('grav-captura').hidden) return;
  const alvo = foco || (n === 4 && st.frases.length ? $('frase') : $('grav-e' + n + '-titulo'));
  alvo.focus();
  if (n === 2 || n === 4) atualizarInfoCamera();
  if (!silencioso) falarDepois(`Etapa ${n} de 4: ${NOMES_ETAPA_GRAV[n]}.` + (n === 2 ? ' ' + infoCamera() : '') + (n === 4 ? ' ' + infoCamera() + ' ' : '') + (n === 4 ? ' Alt R grava, Alt P pausa, Alt E fala o enquadramento, Alt C a luz e o fundo, Alt Q descreve com o descritor.' : ''), 150);
}
/** 2.0.7: o que a câmera entrega e quanto da largura dela o vídeo usa, com a distância indicada. */
function infoCamera() {
  const v = $('camera-video');
  if (!st.cameraStream || !v.videoWidth) return 'Câmera ainda não aberta.';
  const f = formato();
  const r = PU.recorte(v.videoWidth, v.videoHeight, f);
  const pct = Math.round((r.sw / v.videoWidth) * 100);
  const dica = { horizontal: 'Fique a mais ou menos um braço esticado.', quadrado: 'Fique a um braço e meio, com o rosto no meio.', vertical: 'Fique a pelo menos dois braços da câmera, bem no centro.' }[f];
  return `A câmera entrega ${v.videoWidth} por ${v.videoHeight} pontos. ` + (f === 'horizontal' ? 'O vídeo usa a imagem inteira. ' : `O vídeo ${f} usa ${pct} por cento da largura da câmera. `) + dica;
}
function atualizarInfoCamera() {
  const t = infoCamera();
  for (const id of ['info-camera-2', 'info-camera-4']) if ($(id)) $(id).textContent = t;
  return t;
}
function etapaGravLivre() {
  if (gravando()) { falar('Pare a gravação antes de mudar de etapa (Alt R).'); return false; }
  if (st.salvando) { falar('Aguarde, ainda estou salvando o vídeo.'); return false; }
  return true;
}
function continuarEtapaGrav(n) {
  if (!etapaGravLivre()) return;
  if (n === 1) {
    const falta = faltaEscolher();
    if (falta) return alertar(falta);
  }
  if (n === 2) {
    if (!st.cameraStream) return alertar('Nenhuma câmera aberta. Escolha uma câmera para continuar.');
    if ((!st.micStream && modoAudio() !== 'pc') || !st.destino) return alertar('Nenhum microfone aberto. Escolha um microfone para continuar.');
  }
  irParaEtapaGrav(n + 1);
}
function voltarEtapaGrav(n) {
  if (!etapaGravLivre()) return;
  if (n === 1) return irParaInicio();
  irParaEtapaGrav(n - 1);
}
function fecharGravar() {
  const motivo = ocupado();
  if (motivo) return falar(motivo);
  chamar('appSair').catch(() => {});
}
function travarGrupo(nome, travado) { document.querySelectorAll(`input[name="${nome}"]`).forEach((r) => { r.disabled = travado; }); }
const formato = () => valorDe('formato') || 'horizontal';
const qualidade = () => valorDe('qualidade');

// --- Câmera e microfone -----------------------------------------------------------

const AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

function preencher(sel, itens, escolhido, vazio) {
  sel.textContent = '';
  if (!itens.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = vazio;
    sel.appendChild(o);
    return;
  }
  for (const [valor, rotulo] of itens) {
    const o = document.createElement('option');
    o.value = valor; o.textContent = rotulo;
    sel.appendChild(o);
  }
  sel.value = itens.some(([v]) => v === escolhido) ? escolhido : itens[0][0];
}

async function listarDispositivos() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  const cams = devs.filter((d) => d.kind === 'videoinput').map((d, i) => [d.deviceId, d.label || `Câmera ${i + 1}`]);
  const mics = devs.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d, i) => [d.deviceId, d.label || `Microfone ${i + 1}`]);
  preencher($('camera'), cams, st.config.camera, 'Nenhuma câmera encontrada');
  preencher($('microfone'), mics.length ? [['', 'Padrão do Windows'], ...mics] : [], st.config.microfone, 'Nenhum microfone encontrado');
  return { cams: cams.length, mics: mics.length };
}

function pararFluxo(f) { if (f) f.getTracks().forEach((t) => t.stop()); }

async function abrirCamera() {
  pararFluxo(st.cameraStream);
  st.cameraStream = null;
  const id = $('camera').value;
  if (!id) return false;
  const v = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
  try {
    // Pede pelo menos 24 quadros por segundo (evita os modos lentos de algumas webcams, que deixam a imagem aos trancos).
    // Se a câmera não consegue, abre do jeito de antes.
    try {
      st.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { ...v, frameRate: { ideal: 30, min: 24 }, deviceId: { exact: id } } });
    } catch (e) {
      if (!e || (e.name !== 'OverconstrainedError' && e.name !== 'ConstraintNotSatisfiedError')) throw e;
      st.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { ...v, deviceId: { exact: id } } });
    }
  } catch (_) {
    try { st.cameraStream = await navigator.mediaDevices.getUserMedia({ video: v }); } catch (e) {
      alertar('Não consegui abrir a câmera. Confira se ela está ligada, liberada no Windows e fechada em outros programas.');
      return false;
    }
  }
  const vid = $('camera-video');
  st.seguir.cx = 0.5; st.seguir.alvo = null;
  vid.srcObject = st.cameraStream;
  await vid.play().catch(() => {});
  atualizarInfoCamera();
  return true;
}

async function abrirMicrofone() {
  pararFluxo(st.micStream);
  st.micStream = null;
  const id = $('microfone').value;
  try {
    st.micStream = await navigator.mediaDevices.getUserMedia({ audio: id ? { ...AUDIO, deviceId: { exact: id } } : AUDIO });
  } catch (_) {
    try { st.micStream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO }); } catch (e) {
      alertar('Não consegui abrir o microfone. Confira se ele está ligado e liberado no Windows.');
      return false;
    }
  }
  await montarAudio();
  return true;
}

/* O som gravado passa pelo Web Audio (microfone, controle de volume, gravação).
   Na 0.3 a gravação não fica mais muda no Alt E (a Joyce grava com fone de ouvido). */
async function montarAudio() {
  garantirAudio();
  if (st.audioCtx.state === 'suspended') await st.audioCtx.resume().catch(() => {});
  if (st.fonteAudio) { try { st.fonteAudio.disconnect(); } catch (_) { /* */ } }
  st.fonteAudio = st.micStream ? st.audioCtx.createMediaStreamSource(st.micStream) : null;
  ligarFontes();
}
// 2.0.1: de onde vem o som gravado: o microfone, o som do computador ou os dois misturados.
const modoAudio = () => valorDe('fonte-audio') || (st.config && st.config.fonteAudio) || 'mic';
const comSomDoPc = () => modoAudio() !== 'mic';
function ligarFontes() {
  const modo = modoAudio();
  for (const [no, para] of [[st.fonteAudio, st.ganho], [st.fonteAudio, st.retorno], [st.fontePc, st.ganho], [st.ganho, st.retorno]]) {
    if (no) { try { no.disconnect(para); } catch (_) { /* não estava ligado */ } }
  }
  if (st.fonteAudio && modo !== 'pc') st.fonteAudio.connect(st.ganho);
  if (st.fontePc && modo !== 'mic') st.fontePc.connect(st.ganho);
  // Retorno no fone: só o microfone. O som do computador nunca volta para o fone, senão faz eco.
  if (modo === 'mic') st.ganho.connect(st.retorno);
  else if (st.fonteAudio && modo === 'ambos') st.fonteAudio.connect(st.retorno);
}
/** Som do computador (Windows). A captura pede uma tela; o vídeo é jogado fora e só o áudio fica. */
async function abrirSomDoPc() {
  if (st.pcStream && st.pcStream.getAudioTracks().some((t) => t.readyState === 'live')) return true;
  fecharSomDoPc();
  try {
    const bruto = st.fornecerPc ? await st.fornecerPc() : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    bruto.getVideoTracks().forEach((t) => { t.stop(); bruto.removeTrack(t); });
    if (!bruto.getAudioTracks().length) { pararFluxo(bruto); throw new Error('sem áudio'); }
    st.pcStream = bruto;
    garantirAudio();
    st.fontePc = st.audioCtx.createMediaStreamSource(bruto);
    return true;
  } catch (_) {
    fecharSomDoPc();
    return false;
  }
}
function fecharSomDoPc() {
  pararFluxo(st.pcStream);
  st.pcStream = null;
  if (st.fontePc) { try { st.fontePc.disconnect(); } catch (_) { /* */ } st.fontePc = null; }
}
const NOMES_FONTE = { mic: 'só o microfone', pc: 'só o som do computador', ambos: 'o microfone e o som do computador' };
async function aplicarFonteAudio(novo, silencioso) {
  garantirAudio();
  if (novo !== 'mic' && !(await abrirSomDoPc())) {
    const r = document.getElementById('fonte-audio-mic'); if (r) r.checked = true;
    ligarFontes();
    salvarConfig({ fonteAudio: 'mic' });
    alertar('Não consegui captar o som do computador. Isso só funciona no Windows 10 ou mais novo. A gravação continua só com o microfone.');
    return false;
  }
  if (novo === 'mic') fecharSomDoPc();
  ligarFontes();
  salvarConfig({ fonteAudio: novo });
  if (!silencioso) falarDepois(`Vai gravar ${NOMES_FONTE[novo]}.`, 150);
  return true;
}
function garantirAudio() {
  if (st.audioCtx) return;
  st.audioCtx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  st.ganho = st.audioCtx.createGain();
  st.destino = st.audioCtx.createMediaStreamDestination();
  st.ganho.connect(st.destino);
  // 1.8.2: Retorno do microfone: só na saída (fone), nunca no que é gravado (st.destino).
  st.retorno = st.audioCtx.createGain();
  st.retorno.gain.value = $('retorno-mic').checked ? 1 : 0;
  st.ganho.connect(st.retorno);
  st.retorno.connect(st.audioCtx.destination);
}

/* Bipes curtos ao gravar, parar, pausar e retomar. Tocam só no fone ou na caixa de som
   (saída do Web Audio), nunca no que é gravado: não entram no vídeo. */
const BIPES = {
  gravar: [[660, 0.07], [990, 0.07]],
  parar: [[990, 0.07], [660, 0.07]],
  pausar: [[440, 0.12]],
  retomar: [[880, 0.08]],
  atalho: [[1320, 0.035]], // 1.3: confirmação curta dos atalhos (junto com a fala)
  andamento: [[520, 0.05]], // 1.9.1: download do modelo e transcrição em andamento, a cada 4 segundos
  concluido: [[660, 0.08], [880, 0.12]] // 1.9.1: download ou transcrição terminou
};
// 2.0.5: um número é um bipe curto dessa frequência em hertz (andamento do lote, que sobe com a porcentagem).
function bipe(tipo) {
  const notas = typeof tipo === 'number' ? [[tipo, 0.08]] : BIPES[tipo];
  if (!notas) return;
  // 2.0.1: com o som do computador na gravação, o bipe sairia nas caixas e entraria no vídeo.
  if (comSomDoPc() && gravando()) return;
  try {
    garantirAudio();
    const ctx = st.audioCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    let t = ctx.currentTime + 0.01;
    for (const [freq, dur] of notas) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.008);
      g.gain.setValueAtTime(0.15, t + dur - 0.015);
      g.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(g);
      g.connect(ctx.destination); // só a saída de som (fone ou caixa), não o que é gravado
      osc.start(t);
      osc.stop(t + dur + 0.01);
      t += dur + 0.02;
    }
    st.bipes.push({ tipo, quando: performance.now(), notas: notas.map((n) => n[0]) });
  } catch (_) { /* sem som, segue sem bipe */ }
}

// --- Quadro do vídeo (prévia e gravação) -------------------------------------------

function ajustarTela() {
  const f = PU.tamanhoSaida(formato(), qualidade() || 'alta');
  const c = $('previa');
  if (c.width !== f.largura || c.height !== f.altura) { c.width = f.largura; c.height = f.altura; st.legendaCache = null; }
}

function legendaAtiva() { return valorDe('uso') === 'legenda' && st.frases.length > 0; }

function layoutLegenda(ctx, W, H) {
  const texto = st.frases[st.atual] || '';
  // 1.9: tamanho e localização fixos (saíram das Configurações); embaixo, no tamanho médio.
  const cfg = {};
  const k = 1;
  const chave = `${texto}|${W}x${H}|${k}|`;
  if (st.legendaCache && st.legendaCache.chave === chave) return st.legendaCache;
  const m = { ...PU.medidasLegenda(W, H) };
  m.tamanhoMax = Math.round(m.tamanhoMax * k); m.tamanhoMin = Math.round(m.tamanhoMin * k);
  m.local = cfg.legendaLocal || 'embaixo';
  const medirCom = (t) => { ctx.font = `600 ${t}px "Segoe UI", Arial, sans-serif`; return (s) => ctx.measureText(s).width; };
  const r = PU.montarLegenda(texto, m, medirCom);
  st.legendaCache = { chave, ...r, m };
  return st.legendaCache;
}

function desenharLegenda(ctx, W, H) {
  const { tamanho, linhas, m } = layoutLegenda(ctx, W, H);
  if (!linhas.length) return;
  ctx.font = `600 ${tamanho}px "Segoe UI", Arial, sans-serif`;
  const alturaLinha = Math.round(tamanho * 1.3);
  const larguras = linhas.map((l) => ctx.measureText(l).width);
  const pad = Math.round(tamanho * 0.45);
  const caixaW = Math.max(...larguras) + pad * 2;
  const caixaH = alturaLinha * linhas.length + pad;
  const x0 = (W - caixaW) / 2;
  const y0 = m.local === 'cima' ? Math.round(H * 0.07) : m.local === 'meio' ? Math.round((H - caixaH) / 2) : H - m.margemBaixo - caixaH;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.beginPath();
  ctx.roundRect(x0, y0, caixaW, caixaH, Math.round(tamanho * 0.3));
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, Math.round(tamanho / 12));
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#fff';
  linhas.forEach((l, i) => {
    const y = y0 + pad / 2 + alturaLinha * i + alturaLinha / 2;
    ctx.strokeText(l, W / 2, y);
    ctx.fillText(l, W / 2, y);
  });
}

/** Desenha um quadro e, se estiver gravando, entrega exatamente esse quadro à gravação. */
function quadroNovo() {
  desenhar();
  const f = st.fluxoGravacao;
  const t = f && f.getVideoTracks()[0];
  if (t && t.readyState === 'live' && t.requestFrame) t.requestFrame();
}

/** Liga o desenho da prévia: um quadro para cada quadro novo da câmera (requestVideoFrameCallback),
 *  sem repetir nem pular. Um relógio de reserva desenha como antes quando não há câmera,
 *  quando a câmera para de mandar quadros ou quando o recurso não existe. */
function iniciarDesenho() {
  if (st.desenho) return;
  const v = $('camera-video');
  const d = { ultimo: 0, armado: 0, pedido: null, relogio: null, porCamera: 0, porRelogio: 0 };
  const temRVFC = typeof v.requestVideoFrameCallback === 'function';
  const armar = () => {
    if (!temRVFC || st.desenho !== d) return;
    if (d.pedido != null && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(d.pedido);
    d.armado = performance.now();
    d.pedido = v.requestVideoFrameCallback(() => {
      d.pedido = null;
      if (st.desenho !== d) return;
      d.ultimo = performance.now();
      d.porCamera++;
      quadroNovo();
      armar();
    });
  };
  st.desenho = d;
  armar();
  d.relogio = setInterval(() => {
    const agora = performance.now();
    if (agora - d.ultimo < 200) return;
    d.porRelogio++;
    quadroNovo();
    // Câmera trocada ou janela sem pintar por um tempo: arma de novo o aviso de quadro novo.
    if (temRVFC && agora - d.armado > 1000) armar();
  }, 1000 / 30);
}

function pararDesenho() {
  const d = st.desenho;
  if (!d) return;
  st.desenho = null;
  clearInterval(d.relogio);
  const v = $('camera-video');
  if (d.pedido != null && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(d.pedido);
}

// 2.0.7: no vertical e no quadrado, o pedaço da câmera que vira vídeo desliza devagar até o rosto,
// em vez de ficar sempre no meio (onde um rosto fora do centro aparecia cortado ao meio).
const seguindoRosto = () => !!$('seguir-rosto') && $('seguir-rosto').checked && formato() !== 'horizontal';

function recorteAtual(v) {
  return PU.recorte(v.videoWidth, v.videoHeight, formato(), seguindoRosto() ? st.seguir.cx : 0.5);
}

function atualizarSeguimento(v) {
  const s = st.seguir;
  if (!seguindoRosto()) { s.cx = 0.5; s.alvo = null; return; }
  const agora = performance.now();
  if (!s.ocupado && agora - s.ultimo > 350) {
    s.ocupado = true;
    s.ultimo = agora;
    createImageBitmap(v, { resizeWidth: 320, resizeHeight: Math.max(8, Math.round(320 * v.videoHeight / v.videoWidth)) })
      .then((bitmap) => trabalhador('rostoRapido', { bitmap }, [bitmap]))
      .then((r) => {
        if (!r) return;
        const alvo = r.x + r.w / 2;
        if (s.alvo == null) s.cx = alvo; // primeira vez: vai direto, sem deslizar
        s.alvo = alvo;
      })
      .catch(() => {})
      .finally(() => { s.ocupado = false; });
  }
  if (s.alvo != null && Math.abs(s.alvo - s.cx) > 0.015) s.cx += (s.alvo - s.cx) * 0.07;
}

function desenhar() {
  const c = $('previa');
  const ctx = c.getContext('2d');
  const v = $('camera-video');
  ctx.fillStyle = '#000';
  if (!st.cameraStream || !v.videoWidth) { ctx.fillRect(0, 0, c.width, c.height); return; }
  atualizarSeguimento(v);
  const r = recorteAtual(v);
  ctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
  if (legendaAtiva()) desenharLegenda(ctx, c.width, c.height);
}

// --- Leitura sombreada ----------------------------------------------------------------

function atualizarTexto() {
  const frases = PU.frasesDoTexto($('texto').value);
  const mudou = frases.join('\n') !== st.frases.join('\n');
  st.frases = frases;
  if (mudou) st.atual = 0;
  st.legendaCache = null;
  $('frase').hidden = !frases.length;
  $('frase-texto').textContent = frases[st.atual] || '';
  $('frase-nome').textContent = frases[st.atual] || '';
}

function moverFrase(tecla) {
  const n = st.frases.length;
  if (!n) return;
  const atual = st.atual;
  const passo = { ArrowDown: 1, ArrowUp: -1, PageUp: 10, PageDown: -10 }[tecla] || 0; // 3.0.3: Page Up avança e Page Down volta, como nas telas de áudio
  let i = tecla === 'Home' ? 0 : tecla === 'End' ? n - 1 : atual + passo;
  i = Math.max(0, Math.min(n - 1, i));
  // 1.7.1: no começo do texto, a seta para cima lê a primeira frase de novo (sem "Começo do texto").
  if (i === atual && tecla === 'ArrowDown') return falar('Fim do texto.');
  st.atual = i;
  st.legendaCache = null;
  $('frase-texto').textContent = st.frases[i];
  falar(st.frases[i]);
}

async function abrirTexto() {
  try {
    const r = await chamar('textoAbrir');
    if (!r) return;
    $('texto').value = r.texto;
    atualizarTexto();
    salvarConfig({ texto: r.texto });
    // 1.9: as frases aparecem na Etapa 4; aqui o foco vai para a escolha de como usar o texto.
    focarGrupo('uso');
    falarDepois(`Texto aberto: ${r.nome}, ${st.frases.length === 1 ? '1 frase' : st.frases.length + ' frases'}. Na Etapa 4, as setas andam pelas frases.`, 250);
  } catch (e) { alertar(e.message); }
}

// --- Gravação --------------------------------------------------------------------------

function escolherFormatoGravacao() {
  const op = ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return op.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function duracaoAtual() {
  return (st.acumulado + (st.pausado || !gravando() ? 0 : performance.now() - st.inicioTrecho)) / 1000;
}

function mostrarEstado() {
  const e = $('estado');
  e.textContent = gravando() ? (st.pausado ? 'Gravação pausada.' : 'Gravando.') : st.salvando ? 'Salvando o vídeo...' : '';
  e.className = 'estado' + (gravando() && !st.pausado ? ' gravando' : '');
  $('gravar').textContent = gravando() ? 'Parar (Alt R)' : 'Gravar (Alt R)';
  $('pausar').textContent = st.pausado ? 'Continuar (Alt P)' : 'Pausar (Alt P)';
  $('pausar').disabled = !gravando();
  const travar = gravando() || st.salvando;
  for (const id of ['camera', 'microfone']) $(id).disabled = travar;
  travarGrupo('formato', travar);
  travarGrupo('qualidade', travar);
  for (const id of ['grav-e4-voltar', 'grav-e4-fechar']) $(id).disabled = travar;
}

function faltaEscolher() {
  if (!valorDe('formato')) { if (st.gravEtapa !== 1) irParaEtapaGrav(1, { silencioso: true }); focarGrupo('formato'); return 'Antes de gravar, escolha a proporção do vídeo: horizontal, vertical ou quadrado.'; }
  if (!qualidade()) { if (st.gravEtapa !== 1) irParaEtapaGrav(1, { silencioso: true }); focarGrupo('qualidade'); return 'Antes de gravar, escolha a qualidade: alta, padrão ou leve.'; }
  return null;
}

async function iniciarGravacao() {
  const falta = faltaEscolher();
  if (falta) return alertar(falta);
  if (!st.cameraStream) return alertar('Nenhuma câmera aberta. Escolha uma câmera antes de gravar.');
  if ((!st.micStream && modoAudio() !== 'pc') || !st.destino) return alertar('Nenhum microfone aberto. Escolha um microfone antes de gravar.');
  if (comSomDoPc() && !(await abrirSomDoPc())) return alertar('Não consegui captar o som do computador. Volte à Etapa 2 e escolha só o microfone.');
  ligarFontes();
  ajustarTela();
  if (st.audioCtx.state === 'suspended') await st.audioCtx.resume().catch(() => {});
  // captureStream(0): a gravação só recebe um quadro quando o desenho pede (requestFrame),
  // um para cada quadro novo da câmera; assim não há dois relógios brigando.
  const fluxo = $('previa').captureStream(0);
  for (const t of st.destino.stream.getAudioTracks()) fluxo.addTrack(t);
  let id;
  try { id = await chamar('gravacaoIniciar'); } catch (e) { return alertar(e.message); }
  st.gravId = id;
  st.cadeia = Promise.resolve();
  st.erroGravar = null;
  st.ganho.gain.cancelScheduledValues(st.audioCtx.currentTime);
  st.ganho.gain.setValueAtTime(1, st.audioCtx.currentTime);
  const rec = new MediaRecorder(fluxo, { mimeType: escolherFormatoGravacao(), videoBitsPerSecond: PU.bitsDoGravador(qualidade()), audioBitsPerSecond: 192000 });
  // Cada pedaço (1 segundo) vai direto para o disco; nada se acumula na memória.
  rec.ondataavailable = (ev) => {
    if (!ev.data || !ev.data.size) return;
    const blob = ev.data;
    st.cadeia = st.cadeia.then(async () => {
      if (st.erroGravar) return;
      await chamar('gravacaoPedaco', { id, dados: new Uint8Array(await blob.arrayBuffer()) });
    }).catch((e) => { st.erroGravar = e; });
  };
  st.fluxoGravacao = fluxo;
  st.gravador = rec;
  st.formatoGravado = formato();
  st.qualidadeGravada = qualidade();
  st.pausado = false;
  st.acumulado = 0;
  st.inicioTrecho = performance.now();
  rec.start(1000);
  bipe('gravar');
  mostrarEstado();
  if (st.frases.length && document.activeElement !== $('frase')) $('frase').focus();
  falar('Gravando.');
}

function alternarPausa() {
  if (!gravando()) return falar('Nenhuma gravação em andamento. Alt R começa a gravar.');
  if (st.pausado) {
    st.gravador.resume();
    bipe('retomar');
    st.pausado = false;
    st.inicioTrecho = performance.now();
    mostrarEstado();
    falar('Gravação retomada.');
  } else {
    st.gravador.pause();
    bipe('pausar');
    st.acumulado += performance.now() - st.inicioTrecho;
    st.pausado = true;
    mostrarEstado();
    falar('Gravação pausada. Alt P continua, Alt R para e salva.');
  }
}

/** Avisa o andamento de uma tarefa longa a cada 10% e devolve a função que desliga o aviso. */
function acompanhar(assinar, rotulo, barra) {
  const aviso = PU.criarAvisoDeProgresso({ rotulo });
  return assinar((pct) => {
    if (barra) barra.value = pct;
    const msg = aviso(pct);
    if (msg) falar(msg);
  });
}

async function pararGravacao() {
  const rec = st.gravador;
  const duracao = duracaoAtual();
  bipe('parar');
  const parou = new Promise((r) => { rec.onstop = r; });
  rec.stop();
  await parou;
  // Para só a imagem da gravação; o microfone continua aberto para a próxima.
  st.fluxoGravacao.getVideoTracks().forEach((t) => t.stop());
  st.gravador = null;
  st.pausado = false;
  st.salvando = true;
  mostrarEstado();
  falar('Gravação parada. Preparando o vídeo, aguarde.');
  const solta = acompanhar(window.api.aoProgressoConversao, 'Salvando');
  try {
    await st.cadeia;
    if (st.erroGravar) throw st.erroGravar;
    const r = await chamar('gravacaoFinalizar', { id: st.gravId, duracao, formato: st.formatoGravado, qualidade: st.qualidadeGravada });
    // 1.3.1: ainda temporário; só vai para a pasta com Salvar e fechar ou Salvar e continuar.
    st.original = { ...r, duracao };
    st.voltarPedido = false;
    mostrarDecidir();
  } catch (e) {
    alertar(`O vídeo não foi salvo. ${e.message}`);
  } finally {
    solta();
    st.salvando = false;
    mostrarEstado();
  }
}

// --- Telas depois da gravação -------------------------------------------------------------

// Partes da tela Gravar (captura, decidir, pronto) e da tela Melhorar (escolha, pronto).
const PARTES = { 'grav-captura': 'gravar', 'grav-decidir': 'gravar', 'grav-pronto': 'gravar', 'grav-melhorar': 'melhorar', 'grav-analisar': 'melhorar',
  'grav-editar': 'melhorar', 'grav-orientacao': 'melhorar', 'grav-imagem': 'melhorar',
  'au-cortes': 'audio', 'au-silencios': 'audio', 'au-trilhas': 'audio', 'au-eq': 'audio', 'au-descartes': 'audio', 'au-previa': 'audio', 'au-pronto': 'audio' };
function mostrarTela(id) {
  if (window.PlayerSimples) window.PlayerSimples.pararTodos();
  const tela = PARTES[id];
  for (const [p, t] of Object.entries(PARTES)) if (t === tela) $(p).hidden = p !== id;
  // Troca de tela de cima (Gravar <-> Melhorar) passa pelo renderer.js: atalhos, foco, câmera.
  if (window.olho && window.olho.telaAtual() !== tela) window.olho.mostrarTela(tela, { silencioso: true });
}
const semMp4 = (n) => n.replace(/\.mp4$/i, '');

let playerDecidir = null;
/** O player de antes de decidir: toca o vídeo gravado, para ouvir (e ver) antes de salvar ou descartar. */
async function prepararPlayerDecidir() {
  if (!window.PlayerSimples) return;
  if (!playerDecidir) playerDecidir = window.PlayerSimples.ligar({ midia: $('dp-midia'), tocar: $('dp-tocar'), voltar: $('dp-voltar5'), avancar: $('dp-avancar5'), falar, nome: 'a gravação' });
  const r = await window.api.midiaUrl({ arquivo: st.original.arquivo });
  if (r.ok) playerDecidir.carregar(r.valor.url);
}
/** 3.0.2: vindo do Criar post, a tela de depois de gravar tem Descartar e gravar outro, Salvar e continuar, Ir direto para o post e Voltar. */
function botoesDeDecidir() {
  const noPost = !!st.modoPost;
  $('decidir-post').hidden = !noPost; $('salvar-fechar').hidden = noPost;
  $('descartar').textContent = noPost ? 'Descartar e gravar outro' : 'Descartar vídeo';
  $('melhorar').textContent = noPost ? 'Salvar e continuar, para o áudio' : 'Salvar e continuar';
  return noPost;
}
function mostrarDecidir() {
  const o = st.original;
  prepararPlayerDecidir();
  const noPost = botoesDeDecidir();
  const info = noPost
    ? `Tudo pronto. Vídeo gravado para o post. Duração: ${PU.duracaoFalada(o.duracao)}. Escolha Descartar e gravar outro, Salvar e continuar para o áudio, Ir direto para o post, ou Voltar.`
    : `Tudo pronto. Vídeo gravado, ainda não salvo. Duração: ${PU.duracaoFalada(o.duracao)}. Escolha Descartar vídeo, Salvar e fechar, Salvar e continuar, ou Voltar.`;
  $('decidir-info').textContent = info;
  st.origem = 'gravar';
  mostrarTela('grav-decidir');
  (noPost ? $('melhorar') : $('salvar-fechar')).focus();
  falarDepois(info, 300);
}

/** Voltar dos Cortes: o vídeo já está salvo na pasta; volta para a escolha depois de gravar. */
function mostrarDecidirSalvo() {
  const o = st.original;
  prepararPlayerDecidir();
  const info = `Vídeo salvo com o nome ${semMp4(o.nome)}. Duração: ${PU.duracaoFalada(o.duracao)}. Escolha Descartar vídeo, Salvar e fechar, Salvar e continuar, ou Voltar.`;
  $('decidir-info').textContent = info;
  mostrarTela('grav-decidir');
  $('melhorar').focus();
  falarDepois(info, 300);
}

function mostrarPronto(info) {
  $('pronto-info').textContent = info;
  mostrarTela('grav-pronto');
  $('voltar').focus();
  falarDepois(info, 300);
}
/** 1.3.1: depois de salvar a imagem. Salvar e fechar fecha o programa; Salvar e continuar vai para Vídeo salvo
   (ou de volta ao Editar vídeo, quando veio de lá). */
function mostrarProntoMelhoria(info) {
  if (st.modoSalvar === 'fechar') {
    falar(info + ' Fechando o Olho da Cena.');
    setTimeout(() => chamar('appSair').catch(() => {}), 1500);
    return;
  }
  if (st.origem === 'editar') { falar(info); if (window.olho) window.olho.voltarAoEditar(); return; }
  // 1.9.2: Editar vídeo e Editar áudio terminam de volta na tela Editar (sem abrir a câmera).
  if (st.editar) { st.editar = null; if (window.olho) window.olho.voltarAEdicao(info); return; }
  // 1.8.5: sem a tela Analisar vídeo: a análise é uma só, no Alterar plano de fundo.
  mostrarPronto(info);
}

function finalizar() {
  const o = st.original;
  st.ultimoSalvo = o;
  mostrarPronto(`Vídeo salvo na pasta ${o.documentos}, Olho da Cena, com o nome ${semMp4(o.nome)}. Duração: ${PU.duracaoFalada(o.duracao)}.`);
}

// 1.1: botões depois de gravar.
async function descartarVideo() {
  const o = st.original;
  if (!o) return;
  try {
    await chamar('gravacaoApagar', { arquivo: o.arquivo });
  } catch (e) { return alertar(`O vídeo não foi descartado. ${e.message}`); }
  st.original = null;
  mostrarTela('grav-captura');
  irParaEtapaGrav(4, { silencioso: true, foco: $('gravar') });
  falarDepois('Vídeo descartado. Pronto para gravar de novo. Alt R grava.', 250);
}
/** 1.3.1: leva a gravação temporária para a pasta Olho da Cena (Documentos). */
async function guardarOriginal() {
  const o = st.original;
  if (!o.provisorio) return o;
  const r = await chamar('gravacaoGuardar', { arquivo: o.arquivo, nome: o.nome });
  st.original = { ...o, ...r, provisorio: false };
  st.ultimoSalvo = st.original;
  return st.original;
}
async function salvarEFechar() {
  if (!st.original) return;
  let o;
  try { o = await guardarOriginal(); } catch (e) { return alertar(`O vídeo não foi salvo. ${e.message}`); }
  falar(`Vídeo salvo na pasta ${o.documentos}, Olho da Cena, com o nome ${semMp4(o.nome)}. Fechando o Olho da Cena.`);
  setTimeout(() => chamar('appSair').catch(() => {}), 1500);
}
/** Salvar e continuar: salva na pasta e vai para os ajustes de áudio (Cortes); a imagem vem por último. */
async function salvarEContinuar() {
  if (!st.original) return;
  if (st.modoPost) return continuarParaAudioDoPost();
  let o;
  try { o = await guardarOriginal(); } catch (e) { return alertar(`O vídeo não foi salvo. ${e.message}`); }
  st.origem = 'gravar';
  st.fonteMelhoria = null;
  st.legenda = null; // 1.9
  st.editar = null; st.saida = null; // 1.9.2
  falar(`Vídeo salvo com o nome ${semMp4(o.nome)}.`);
  // 1.8.5: a imagem (Alterar plano de fundo) vem logo depois de gravar, antes do áudio. Aqui só se escolhe;
  // o vídeo com o fundo é feito no fim do áudio, sobre o vídeo já cortado (o som final entra junto).
  abrirMelhorar();
}
/** 1.8.5: escolha do fundo feita (gravação, antes do áudio): vai para os ajustes de áudio. */
function continuarParaAudio() {
  const efeito = valorDe('efeito');
  if (!efeito) { focarGrupo('efeito'); return alertar('Escolha um efeito: borrar o fundo ou substituir o fundo.'); }
  if (efeito === 'substituir' && !valorDe('fundo')) { focarGrupo('fundo'); return alertar('Escolha um dos fundos.'); }
  st.modoSalvar = 'continuar';
  falar(`Imagem escolhida: ${descricaoDoEfeito()}. Agora, o áudio.`);
  modoGravacao(); // 1.9: as telas de áudio podem ter sido usadas pela Edição antes
  abrirAudioCortes(st.original);
}
/** Gravação: escolha do fundo antes do áudio (ainda sem o vídeo cortado). */
const escolhendoFundo = () => st.origem === 'gravar' && !st.fonteMelhoria;
/** Voltar: a gravação ainda não foi salva; confirma pela fala e, no segundo Voltar, descarta. */
async function voltarSemDecidir() {
  const o = st.original;
  if (o && o.provisorio) {
    if (!st.voltarPedido) {
      st.voltarPedido = true;
      return falar('O vídeo ainda não foi salvo. Aperte Voltar de novo para descartar e voltar, ou escolha Salvar e fechar ou Salvar e continuar.');
    }
    try { await chamar('gravacaoApagar', { arquivo: o.arquivo }); } catch (e) { return alertar(`O vídeo não foi descartado. ${e.message}`); }
    st.original = null;
    st.voltarPedido = false;
    falarDepois('Vídeo descartado.', 250);
  }
  mostrarTela('grav-captura');
  irParaInicio();
}

// 1.9: legenda escolhida na tela de legenda, só no caminho da gravação.
const legendaParaEnvio = () => (st.origem === 'gravar' && st.legenda ? { srt: st.legenda.srt, estilo: st.legenda.estilo } : null);

// 1.1: título e logo no Melhorar (o mesmo desenho da Abertura do Editar vídeo).
const nomeDoArq = (c) => String(c || '').split(/[\\/]/).pop();
function aberturaParaEnvio() {
  const titulo = $('mel-abertura-titulo').value.trim().replace(/\s+/g, ' ');
  const l = st.aberturaLogo;
  if (!titulo && !l) return null;
  return {
    titulo,
    logo: l ? { caminho: l.caminho, nome: nomeDoArq(l.caminho).replace(/\.[^.]+$/, ''), largura: l.largura, altura: l.altura,
      removerFundo: l.fundoLiso === true, corFundo: l.fundoLiso ? l.corCanto : null } : null
  };
}
function mostrarLogoAbertura() {
  const l = st.aberturaLogo;
  $('mel-abertura-info').textContent = l ? `Logo: ${nomeDoArq(l.caminho)}.` : 'Sem logo.';
  $('mel-abertura-tirar-logo').hidden = !l;
}
async function escolherLogoAbertura() {
  if (st.melhoria) return;
  const r = await window.api.escolherLogo();
  if (!r) return falar('Nenhum logo escolhido.');
  if (!r.ok) return falar(`Não consegui abrir essa imagem: ${r.erro}`);
  st.aberturaLogo = r;
  mostrarLogoAbertura();
  falar(`Logo: ${nomeDoArq(r.caminho)}. Ele aparece grande, no meio da tela, nos 3 primeiros segundos do vídeo.`);
}
function tirarLogoAbertura() {
  if (st.melhoria) return;
  st.aberturaLogo = null;
  mostrarLogoAbertura();
  falar('Logo tirado.');
  $('mel-abertura-logo').focus();
}

function voltarAoInicio(anunciar = true) {
  mostrarTela('grav-captura');
  irParaEtapaGrav(4, { silencioso: true, foco: $('gravar') });
  if (anunciar) falarDepois('Pronto para gravar outro vídeo. Alt R grava.', 250);
}

// --- Melhorar: borrar ou substituir o fundo ---------------------------------------------------
// (O "Melhorar áudio" ficou guardado para depois em ideias/melhorar-audio; ver IDEIAS.md.)

function mostrarFundos() { $('grupo-fundo').hidden = valorDe('efeito') !== 'substituir'; }

function abrirMelhorar() {
  if (!st.original) return;
  $('processando').hidden = true;
  $('melhorar-botoes').hidden = false;
  $('mel-analise').textContent = '';
  $('mel-analisar-botoes').hidden = st.origem !== 'gravar';
  $('melhorar-voltar').textContent = 'Voltar, Alt V';
  // 1.3.1: "Fundo original" só no caminho da gravação (lá o vídeo já vem dos ajustes de áudio).
  const semFundo = $('efeito-nenhum');
  if (semFundo) {
    semFundo.closest('.radio').hidden = st.origem !== 'gravar';
    if (st.origem !== 'gravar' && semFundo.checked) { const b = $('efeito-borrar'); if (b) b.checked = true; }
  }
  travarGrupo('efeito', false);
  travarGrupo('fundo', false);
  ['mel-abertura-titulo', 'mel-abertura-logo', 'mel-abertura-tirar-logo'].forEach((id) => { $(id).disabled = false; });
  mostrarFundos();
  // 1.8.5: na gravação, primeiro só o fundo (antes do áudio); título e logo depois do áudio
  // (cortar o começo mudaria o título). Fora da gravação, tudo junto, como antes.
  const fase = st.origem !== 'gravar' ? 'tudo' : escolhendoFundo() ? 'fundo' : 'titulo';
  $('mel-efeito-bloco').hidden = fase === 'titulo';
  $('mel-abertura-bloco').hidden = fase === 'fundo';
  if (fase === 'titulo') $('mel-analisar-botoes').hidden = true;
  $('titulo-melhorar').textContent = fase === 'titulo' ? 'Título e logo' : 'Escolher o efeito';
  mostrarTela('grav-melhorar');
  if (fase === 'titulo') {
    $('mel-abertura-titulo').focus();
    falarDepois(`Título e logo, vídeo ${semMp4(st.original.nome)}. ${$('mel-desc-abertura').textContent} Depois, Salvar e continuar faz o vídeo com ${descricaoDoEfeito()}. Ou Salvar e fechar, ou Voltar.`, 300);
    return;
  }
  focarGrupo('efeito');
  const depois = escolhendoFundo() ? 'Escolha o efeito; depois, Salvar e continuar vai para o áudio, e o vídeo com o fundo é feito no fim. Ou Salvar e fechar, ou Voltar.'
    : 'Escolha o efeito; depois, Salvar e continuar, Salvar e fechar, ou Voltar.';
  falarDepois(`${st.origem === 'gravar' ? 'Imagem. ' : ''}${$('mel-explica-fundo').textContent} Alterar plano de fundo, vídeo ${semMp4(st.original.nome)}. ${depois} O original continua guardado.`, 300);
}

/** Formato e tamanho de um vídeo que não foi gravado aqui (veio do Editar vídeo). */
function medidasDoVideo(largura, altura) {
  const w = Number(largura) || 1920, h = Number(altura) || 1080;
  const formatoV = w > h * 1.1 ? 'horizontal' : h > w * 1.1 ? 'vertical' : 'quadrado';
  // Até 1920 no lado maior, números pares (o H.264 pede).
  const esc = Math.min(1, 1920 / Math.max(w, h));
  const par = (n) => Math.max(2, Math.round((n * esc) / 2) * 2);
  return { formato: formatoV, qualidade: Math.min(w, h) * esc >= 1000 ? 'alta' : 'leve', largura: par(w), altura: par(h) };
}

/** Editar vídeo -> Melhorar: o vídeo carregado lá. */
function melhorarDoEditar(video) {
  if (st.melhoria) return falar('Aguarde, já estou processando um vídeo.');
  const m = medidasDoVideo(video.largura, video.altura);
  st.origem = 'editar';
  st.original = { arquivo: video.caminho, nome: video.caminho.split(/[\\/]/).pop(), duracao: video.duracao, ...m, externo: true };
  abrirMelhorar();
}

function voltarDoMelhorar() {
  if (st.melhoria) return;
  if (st.origem === 'editar') {
    if (window.olho) window.olho.voltarAoEditar();
    return;
  }
  // 1.8.5: a imagem vem logo depois de gravar: Voltar volta para a escolha depois de gravar.
  // (Se o áudio já foi feito, volta para Equalização e ajustes, com tudo como estava.)
  if (escolhendoFundo()) return st.editar ? mostrarTela('grav-editar') || $('titulo-editar').focus() : mostrarDecidirSalvo();
  // 1.9.2: no Editar vídeo, o título e o logo vêm logo depois do áudio.
  if (st.editar) return st.editar.deImagem ? abrirEqualizacao() : voltarAosCortes();
  // 1.9: depois do áudio vem a legenda; Voltar do título e logo volta para ela.
  abrirLegendaGravacao();
}

function descricaoDoEfeito() {
  if (valorDe('efeito') === 'substituir') {
    const f = fundoEscolhido(valorDe('fundo'));
    return f ? f.sufixo : 'fundo';
  }
  if (valorDe('efeito') === 'nenhum') return 'a imagem como foi gravada';
  return 'fundo borrado';
}

async function processar(amostra) {
  if (st.melhoria) return;
  const efeito = valorDe('efeito');
  if (!efeito) { focarGrupo('efeito'); return alertar('Escolha um efeito: borrar o fundo ou substituir o fundo.'); }
  if (efeito === 'substituir' && !valorDe('fundo')) { focarGrupo('fundo'); return alertar('Escolha um dos fundos.'); }
  // 1.3.1: no caminho da gravação, a imagem é feita sobre o vídeo já cortado (o título entra depois dos cortes).
  const o = st.origem === 'gravar' && st.fonteMelhoria ? { ...st.original, arquivo: st.fonteMelhoria.arquivo, duracao: st.fonteMelhoria.duracao } : st.original;
  const qual = descricaoDoEfeito();
  if (efeito === 'nenhum') return salvarSemFundo(amostra, o);
  st.melhoria = { cancelar: false, id: null };
  $('melhorar-botoes').hidden = true;
  $('mel-analisar-botoes').hidden = true;
  $('processando').hidden = false;
  $('processando-barra').value = 0;
  $('processando-info').textContent = `Processando ${amostra ? 'a amostra' : 'o vídeo todo'} com ${qual}...`;
  travarGrupo('efeito', true);
  travarGrupo('fundo', true);
  ['mel-abertura-titulo', 'mel-abertura-logo', 'mel-abertura-tirar-logo'].forEach((id) => { $(id).disabled = true; });
  $('cancelar').focus();
  falar(`Processando ${amostra ? 'a amostra de 5 segundos' : 'o vídeo todo'} com ${qual}. ${amostra ? 'Leva alguns segundos.' : 'Pode demorar: mais ou menos o tempo do vídeo, ou mais.'} Aguarde.`);
  const solta = acompanhar(window.api.aoProgressoMelhoria, 'Processando', $('processando-barra'));
  const m = st.melhoria;
  try {
    // 1.8.6: gravação: o original com os cortes do áudio e o som editado, tudo nesta passada só.
    const fm = st.origem === 'gravar' && st.fonteMelhoria && st.fonteMelhoria.planos ? st.fonteMelhoria : null;
    if (efeito === 'substituir') await garantirFundoMoldura(o.formato);
    const info = await chamar('melhorarIniciar', { arquivo: fm ? fm.original : o.arquivo, formato: o.formato, qualidade: o.qualidade, efeito,
      nomeBase: st.editar ? semMp4(st.original.nome).replace(/\.[^.]+$/, '') : undefined,
      tituloNome: $('mel-abertura-titulo').value,
      fundo: valorDe('fundo'), amostra, duracao: o.duracao, ...(o.externo ? { largura: o.largura, altura: o.altura } : {}),
      ...(fm ? { planos: fm.planos, audioArq: fm.arquivo } : {}) });
    m.id = info.id;
    if (!info.soAudio) {
      await trabalhador('segmentarIniciar');
      const tempos = { quadro: 0, segmentar: 0, mascara: 0, quadros: 0 };
      st.temposMelhoria = tempos;
      for (;;) {
        if (m.cancelar) break;
        let t = performance.now();
        let q = await chamar('melhorarQuadro', { id: info.id });
        tempos.quadro += performance.now() - t;
        if (!q || m.cancelar) break;
        if (q.byteOffset || q.byteLength !== q.buffer.byteLength) q = q.slice();
        t = performance.now();
        const mascara = await trabalhador('segmentar', { dados: q.buffer, w: info.mw, h: info.mh }, [q.buffer]);
        tempos.segmentar += performance.now() - t;
        t = performance.now();
        await chamar('melhorarMascara', { id: info.id, dados: mascara });
        tempos.mascara += performance.now() - t;
        tempos.quadros++;
      }
    }
    if (m.cancelar) return;
    const r = await chamar('melhorarConcluir', { id: info.id, abertura: aberturaParaEnvio(), legenda: legendaParaEnvio(), saida: st.editar ? st.saida : undefined });
    if (m.cancelar) return;
    st.ultimoSalvo = { ...r, duracao: info.duracao };
    st.ultimaMelhoria = { ...r, amostra, qual, efeito };
    mostrarProntoMelhoria(`${amostra ? 'Amostra' : 'Vídeo'} com ${qual}${r.comLegenda ? ' e legenda' : ''} salv${amostra ? 'a' : 'o'} na pasta ${r.documentos}, Olho da Cena, com o nome ${semMp4(r.nome)}. O vídeo original continua guardado.`);
  } catch (e) {
    if (m.cancelar) return;
    if (m.id) chamar('melhorarCancelar', { id: m.id }).catch(() => {});
    alertar(`Não consegui melhorar o vídeo. ${e.message} O vídeo original continua guardado.`);
    abrirMelhorar();
  } finally {
    solta();
    if (st.melhoria === m) st.melhoria = null;
  }
}

/** 1.3.1: Fundo original: o vídeo cortado já é o final; só põe o título e o logo, se houver. */
async function salvarSemFundo(amostra, o) {
  if (amostra) return alertar('Fundo original não tem amostra.');
  if (!st.fonteMelhoria) return alertar('Faça antes os ajustes de áudio.');
  st.melhoria = { cancelar: false, id: null };
  $('melhorar-botoes').hidden = true;
  $('processando').hidden = false;
  $('processando-info').textContent = 'Salvando o vídeo...';
  falar('Fazendo o vídeo final, com os cortes, o som editado, o título e o logo. Aguarde.');
  try {
    const fm = st.fonteMelhoria.planos ? st.fonteMelhoria : null;
    const r = await chamar('melhorarSemFundo', { arquivo: o.arquivo, formato: o.formato, abertura: aberturaParaEnvio(), legenda: legendaParaEnvio(), saida: st.editar ? st.saida : undefined,
      nomeBase: st.editar ? semMp4(st.original.nome).replace(/\.[^.]+$/, '') : undefined, ...(fm ? { original: fm.original, planos: fm.planos } : {}) });
    st.ultimoSalvo = { ...r, duracao: o.duracao };
    st.ultimaMelhoria = { ...r, amostra: false, qual: 'a imagem como foi gravada', efeito: 'nenhum' };
    mostrarProntoMelhoria(`Vídeo${r.comLegenda ? ' com legenda' : ''} salvo na pasta ${r.documentos}, Olho da Cena, com o nome ${semMp4(r.nome)}.`);
  } catch (e) {
    alertar(`Não consegui salvar o vídeo. ${e.message}`);
    abrirMelhorar();
  } finally { st.melhoria = null; }
}

async function cancelarMelhoria() {
  const m = st.melhoria;
  if (!m) return;
  m.cancelar = true;
  if (m.id) await chamar('melhorarCancelar', { id: m.id }).catch(() => {});
  st.melhoria = null;
  abrirMelhorar();
  falarDepois('Processamento cancelado. Nada novo foi salvo; o vídeo original continua guardado.', 350);
}

async function alternarGravacao() {
  if (st.salvando) return falar('Aguarde, ainda estou salvando o vídeo anterior.');
  if (st.melhoria) return falar('Aguarde, estou processando o vídeo. Para parar, use o botão Cancelar.');
  if (gravando()) return pararGravacao();
  if ($('grav-captura').hidden) voltarAoInicio(false);
  return iniciarGravacao();
}


// --- 1.8.2: Analisar fundo (antes de salvar) e Analisar vídeo (antes de Finalizar) --------------

const avisoAnalise = (duracao) => (Number(duracao) > 18 ? 'Analisando os seis primeiros segundos do começo, meio e fim do vídeo.' : 'Analisando o vídeo inteiro.');
function nomeDoFundo(efeito, fundo) {
  if (efeito === 'nenhum') return 'Fundo original';
  if (efeito === 'borrar') return 'Fundo borrado';
  const f = fundoEscolhido(fundo);
  return f ? `Fundo ${f.nome}` : 'Fundo';
}
/** O mesmo worker do Alt E e do Melhorar. O segmentador roda antes um quadro do mesmo tamanho, numa
   tarefa separada: assim o WebGL de algumas máquinas não falha ao montar a máscara junto com a detecção. */
// 1.8.5: a análise roda num worker só dela, novo a cada vez e fechado no fim. No worker do Alt E, depois que
// o Alt E já tinha rodado, o detector de rosto não achava mais nada (0 rostos) — era o rosto "sumido" da Joyce.
async function trabalhadorAnalise(dados, transferir) {
  const wk = new Worker('visao-worker.js');
  let prox = 1;
  const pend = new Map();
  const tarefa = (tipo, d, tr = []) => new Promise((resolve, reject) => {
    const id = prox++;
    pend.set(id, { resolve, reject });
    wk.postMessage({ id, tipo, dados: d }, tr);
  });
  wk.onmessage = (ev) => { const p = pend.get(ev.data.id); if (!p) return; pend.delete(ev.data.id); if (ev.data.ok) p.resolve(ev.data.valor); else p.reject(new Error(ev.data.erro)); };
  wk.onerror = (ev) => { for (const p of pend.values()) p.reject(new Error(ev.message || 'Erro na análise.')); pend.clear(); };
  // 1.8.6: se o worker travar (WebGL em algumas máquinas), desiste em 2 minutos em vez de travar o Alt F para sempre.
  let limite;
  const tempo = new Promise((_, reject) => { limite = setTimeout(() => reject(new Error('A análise demorou demais. Tente de novo.')), 120000); });
  try {
    return await Promise.race([tempo, (async () => {
      await tarefa('segmentarIniciar');
      await tarefa('segmentar', { dados: new Uint8Array(dados.w * dados.h * 4).fill(128).buffer, w: dados.w, h: dados.h });
      return await tarefa('diagnosticarJanelas', dados, transferir);
    })()]);
  } finally { clearTimeout(limite); wk.terminate(); }
}
st.trabalhadorAnalise = (...a) => trabalhadorAnalise(...a); // usado só pelos testes automáticos
/** Quadros do vídeo (main) -> máscara, fundo e medidas (worker) -> texto. Nada é salvo. */
async function analisarArquivo({ arquivo, duracao, formato, qualidade, efeito, fundo, efeitoAplicado = efeito }) {
  if (efeitoAplicado === 'substituir') await garantirFundoMoldura(formato, fundo);
  const q = await chamar('analiseQuadros', { arquivo, duracao, formato, qualidade, efeito: efeitoAplicado, fundo });
  const janelas = q.janelas.map((j) => j.map((x) => (x.byteOffset || x.byteLength !== x.buffer.byteLength ? x.slice() : x).buffer));
  const imagemFundo = q.imagemFundo ? q.imagemFundo.slice().buffer : null;
  const rostos = (q.rostos || []).map((j) => j.map((x) => (x.byteOffset || x.byteLength !== x.buffer.byteLength ? x.slice() : x).buffer));
  const medidas = await trabalhadorAnalise({ janelas, w: q.mw, h: q.mh, efeito: efeitoAplicado, imagemFundo, rostos, rw: q.rw, rh: q.rh },
    [...janelas.flat(), ...rostos.flat(), ...(imagemFundo ? [imagemFundo] : [])]);
  st.ultimasMedidas = medidas; // 1.9.2: o Editar vídeo conta os quadros com rosto
  const dg = PU.diagnosticar(medidas, { efeito, nomeFundo: nomeDoFundo(efeito, fundo) });
  if (q.pastaRegistro) {
    const linhas = medidas.map((j, k) => `Trecho ${k + 1}: ${j.length} quadros, rosto achado em ${j.filter((m) => m.rosto).length}`);
    chamar('analiseRegistro', { pasta: q.pastaRegistro, texto: [...linhas, `Resultado: ${dg.texto}`].join('\n') }).catch(() => {});
  }
  return dg.texto;
}

async function analisarFundo() {
  if (st.melhoria) return;
  if (st.analisandoFundo) return falar('Ainda estou analisando. Aguarde.');
  const efeito = valorDe('efeito');
  if (!efeito) { focarGrupo('efeito'); return alertar('Escolha um efeito: borrar o fundo ou substituir o fundo.'); }
  if (efeito === 'substituir' && !valorDe('fundo')) { focarGrupo('fundo'); return alertar('Escolha um dos fundos.'); }
  const o = st.origem === 'gravar' && st.fonteMelhoria ? { ...st.original, arquivo: st.fonteMelhoria.arquivo, duracao: st.fonteMelhoria.duracao } : st.original;
  st.analisandoFundo = true;
  const aviso = avisoAnalise(o.duracao);
  $('mel-analise').textContent = aviso;
  falar(aviso);
  try {
    const texto = await analisarArquivo({ arquivo: o.arquivo, duracao: o.duracao, formato: o.formato, qualidade: o.qualidade, efeito, fundo: valorDe('fundo') });
    anunciarResultado('mel-analise', texto + ' Se quiser, escolha outro fundo e analise de novo.');
  } catch (e) {
    $('mel-analise').textContent = '';
    alertar('Não consegui analisar o fundo. ' + (e.message || e));
  } finally { st.analisandoFundo = false; }
}

function abrirAnalisarVideo(info) {
  st.infoFinal = info;
  $('an-info').textContent = info;
  mostrarTela('grav-analisar');
  $('titulo-analisar').focus();
  analisarVideoFinal(info + ' ');
}
async function analisarVideoFinal(antes = '') {
  const v = st.ultimoSalvo, m = st.ultimaMelhoria || {};
  if (!v || st.analisandoFundo) return;
  st.analisandoFundo = true;
  const aviso = avisoAnalise(v.duracao);
  falar(`Analisar vídeo. ${antes}${aviso}`);
  try {
    const efeito = m.efeito || 'nenhum';
    const texto = await analisarArquivo({ arquivo: v.arquivo, duracao: v.duracao, formato: st.original.formato, qualidade: st.original.qualidade,
      efeito, fundo: valorDe('fundo'), efeitoAplicado: 'nenhum' });
    anunciarResultado('an-info', texto + ' Escolha Finalizar ou Voltar.');
  } catch (e) {
    alertar('Não consegui analisar o vídeo. ' + (e.message || e));
  } finally { st.analisandoFundo = false; }
}

/** Alt E: o quadro da câmera, com as mesmas medidas (luz, sombra, fundo). */
async function diagnosticoDaCamera(rostos = [], el) {
  const v = el || $('camera-video');
  // Câmera ao vivo: o recorte da proporção escolhida. Vídeo já gravado: o quadro inteiro.
  const r = el ? { sx: 0, sy: 0, sw: v.videoWidth, sh: v.videoHeight } : recorteAtual(v);
  const esc = Math.min(1, 384 / Math.max(r.sw, r.sh));
  const w = Math.max(2, Math.round(r.sw * esc / 2) * 2), h = Math.max(2, Math.round(r.sh * esc / 2) * 2);
  const c = new OffscreenCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
  const buf = ctx.getImageData(0, 0, w, h).data.buffer;
  // 1.8.5: o rosto é o que o próprio Alt E achou (sem detectar de novo num quadro menor).
  const rostoFixo = rostos.length ? rostos.reduce((x, y) => (y.w * y.h > x.w * x.h ? y : x)) : null;
  const medidas = await trabalhador('diagnosticarJanelas', { janelas: [[buf]], w, h, efeito: 'nenhum', comMascara: false, rostoFixo }, [buf]);
  const p = PU.diagnosticar(medidas, { efeito: 'nenhum', avaliarFundo: true }).partes;
  // 1.8.5: luz e fundo sempre, com o que significa (como no Analisar fundo).
  return [...p.luz.map((i) => `Luz: ${i.texto}`), ...p.fundo.map((i) => `Fundo: ${i.texto}`)];
}

// --- Detecção e segmentação no worker (MediaPipe, sem internet) ----------------------------------

let worker = null;
const pendentes = new Map();
let proximaTarefa = 1;
function trabalhador(tipo, dados, transferir = []) {
  if (!worker) {
    worker = new Worker('visao-worker.js');
    worker.onmessage = (ev) => {
      const p = pendentes.get(ev.data.id);
      if (!p) return;
      pendentes.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.valor); else p.reject(new Error(ev.data.erro));
    };
    worker.onerror = (ev) => {
      for (const p of pendentes.values()) p.reject(new Error(ev.message || 'Erro na detecção.'));
      pendentes.clear();
      worker = null;
    };
  }
  const id = proximaTarefa++;
  return new Promise((resolve, reject) => {
    pendentes.set(id, { resolve, reject });
    worker.postMessage({ id, tipo, dados }, transferir);
  });
}

async function analisarQuadro(sequencia = []) {
  const v = $('camera-video');
  const r = recorteAtual(v);
  const esc = Math.min(1, 960 / Math.max(r.sw, r.sh));
  const bitmap = await createImageBitmap(v, r.sx, r.sy, r.sw, r.sh, { resizeWidth: Math.round(r.sw * esc), resizeHeight: Math.round(r.sh * esc) });
  const f = PU.FORMATOS[formato()];
  return trabalhador('analisar', { bitmap, largura: f.largura, altura: f.altura, sequencia }, [bitmap, ...sequencia]);
}

/** 1.9.6: uma análise de imagem num worker só dela, fechado no fim (o worker do Alt E, depois de usado, às vezes não acha mais nada). */
function analisarImagemSolta(bitmap) {
  return new Promise((resolve, reject) => {
    const wk = new Worker('visao-worker.js');
    const fim = (fn, v) => { clearTimeout(lim); wk.terminate(); fn(v); };
    const lim = setTimeout(() => fim(reject, new Error('a análise demorou demais')), 90000);
    wk.onmessage = (ev) => { if (ev.data.ok) fim(resolve, ev.data.valor); else fim(reject, new Error(ev.data.erro || 'erro na análise')); };
    wk.onerror = (ev) => fim(reject, new Error(ev.message || 'erro na análise'));
    wk.postMessage({ id: 1, tipo: 'analisar', dados: { bitmap, largura: bitmap.width, altura: bitmap.height, sequencia: [] } }, [bitmap]);
  });
}
/** 1.9.3: rostos e objetos numa imagem, com os mesmos detectores do Alt E. Só estimativa. */
async function descreverImagem(url) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  const grande = await createImageBitmap(blob);
  const esc = Math.min(1, 960 / Math.max(grande.width, grande.height));
  const bitmap = await createImageBitmap(grande, { resizeWidth: Math.max(2, Math.round(grande.width * esc)), resizeHeight: Math.max(2, Math.round(grande.height * esc)) });
  grande.close();
  const dados = await analisarImagemSolta(bitmap);
  const rostos = dados.rostos || [];
  const ob = PU.descreverObjetos(dados.objetos || []);
  // O detector de objetos erra com frequência em foto: o texto diz que é palpite, nunca afirma.
  const objetos = ob.itens.length ? ob.texto.replace(/^Na imagem: /, ob.itens.length > 1 ? 'Possíveis objetos, sem certeza: ' : 'Possível objeto, sem certeza: ') : '';
  let texto = '';
  if (rostos.length === 1) {
    const r = rostos[0], cx = r.x + r.w / 2;
    texto = `Tem um rosto, ${cx < 0.35 ? 'do lado esquerdo' : cx > 0.65 ? 'do lado direito' : 'no centro'} da imagem.`;
  } else if (rostos.length > 1) texto = `Tem ${rostos.length} rostos.`;
  else texto = 'Não achei rosto.';
  return { rostos: rostos.length, objetos, texto: objetos ? `${texto} ${objetos}` : texto };
}

/** 1.2: quadros pequenos seguidos (cerca de 0,7 s), para saber se a câmera está tremendo. */
async function quadrosSeguidos(n = 7, intervalo = 110) {
  const v = $('camera-video');
  const r = recorteAtual(v);
  const lista = [];
  for (let i = 0; i < n; i++) {
    if (i) await new Promise((ok) => setTimeout(ok, intervalo));
    lista.push(await createImageBitmap(v, r.sx, r.sy, r.sw, r.sh, { resizeWidth: 128, resizeHeight: Math.max(8, Math.round(128 * r.sh / r.sw)) }));
  }
  return lista;
}

/** 3.0.2: cor do cabelo e da roupa vistas na câmera, com a mesma conta da foto, feita no computador, sem o Gemma. */
async function coresDaCamera(rostos) {
  const FT = window.Fotos;
  if (!FT || !rostos.length) return '';
  const v = $('camera-video'), r = recorteAtual(v);
  const esc = Math.min(1, 640 / Math.max(r.sw, r.sh));
  const w = Math.max(16, Math.round(r.sw * esc)), h = Math.max(16, Math.round(r.sh * esc));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
  const buf = x.getImageData(0, 0, w, h).data.buffer.slice(0);
  await trabalhador('segmentarIniciar', {});
  const m = await trabalhador('segmentar', { dados: buf, w, h }, [buf]);
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
  const mx = mc.getContext('2d'); const saida = new ImageData(w, h);
  for (let i = 0, j = 0; i < m.length; i++, j += 4) { saida.data[j] = saida.data[j + 1] = saida.data[j + 2] = 255; saida.data[j + 3] = m[i]; }
  mx.putImageData(saida, 0, 0);
  const rosto = rostos.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  const cores = FT.coresDaPessoa(c, w, h, mc, rosto);
  return FT.falaDasCores(cores);
}
async function enquadramento() {
  if (st.analisando) return;
  if (!st.cameraStream || !$('camera-video').videoWidth) return falar('Nenhuma câmera aberta.');
  st.analisando = true;
  // 0.3: a gravação não fica mais muda enquanto o leitor fala (a Joyce grava com fone de ouvido).
  const durante = gravando() && !st.pausado;
  let demorou = null;
  try {
    const sequencia = await quadrosSeguidos();
    demorou = setTimeout(() => falar('Olhando a câmera, um instante.'), 700);
    const dados = await analisarQuadro(sequencia);
    const objetos = PU.descreverObjetos(dados.objetos || []).texto;
    const r = PU.descreverEnquadramento({ ...dados, espelhada: espelhada(), objetos });
    // 3.0.2: cabelo e roupa, em cores, logo depois do enquadramento. Fica também num parágrafo que se alcança com o Tab.
    let cores = '';
    try { cores = await coresDaCamera(dados.rostos || []); } catch (_) { cores = ''; }
    if (cores) r.texto = `${r.texto} ${cores}`;
    for (const id of ['grav-cores-2', 'grav-cores-4']) { const p = $(id); if (p) { p.textContent = cores; p.hidden = !cores; } }
    // 1.8.2: Alt E fala também luz, sombra no rosto e fundo.
    let extra = [];
    try { extra = await diagnosticoDaCamera(dados.rostos || []); } catch (_) { extra = []; }
    if (extra.length) r.texto = `${r.texto} ${extra.join('. ')}.`;
    st.ultimoEnquadramento = { ...r, entrada: dados, durante, objetos };
    clearTimeout(demorou);
    falar(r.texto);
  } catch (e) {
    clearTimeout(demorou);
    alertar('Não consegui analisar o enquadramento. ' + (e.message || e));
  } finally {
    st.analisando = false;
  }
}

// --- 2.0.2: Alt E, Alt C e Alt Q no quadro em que o vídeo está parado, ou na câmera ao vivo -----------
/** De onde vem o quadro: o vídeo da tela à vista, ou a câmera ao vivo. null se não há imagem. */
function fonteDoQuadro() {
  const tela = window.olho && window.olho.telaAtual();
  let el = null;
  if (tela === 'gravar') el = (st.cameraStream && $('camera-video').videoWidth) ? $('camera-video') : null;
  else if (tela === 'audio') el = $('au-player');
  else if (tela === 'cortar') el = $('c-player');
  if (!el) return { el: null, motivo: tela === 'gravar' ? 'Nenhuma câmera aberta.' : 'Não há vídeo para olhar nesta tela.' };
  if (el !== $('camera-video') && (el.videoWidth < 64 || el.readyState < 2)) {
    return { el: null, motivo: el.videoWidth && el.videoWidth < 64 ? 'Este arquivo é só de áudio: não há imagem para olhar.' : 'O vídeo ainda não está pronto. Toque ou ande um pouco nele e tente de novo.' };
  }
  return { el, aoVivo: el === $('camera-video') };
}
async function bitmapDoQuadro(el, maximo = 960) {
  const esc = Math.min(1, maximo / Math.max(el.videoWidth, el.videoHeight));
  return createImageBitmap(el, { resizeWidth: Math.max(2, Math.round(el.videoWidth * esc)), resizeHeight: Math.max(2, Math.round(el.videoHeight * esc)) });
}
async function enquadreDoQuadro() {
  if (st.analisando) return;
  const f = fonteDoQuadro();
  if (!f.el) return falar(f.motivo);
  if (f.aoVivo) return enquadramento();
  st.analisando = true;
  const demorou = setTimeout(() => falar('Olhando o quadro, um instante.'), 700);
  try {
    const dados = await analisarImagemSolta(await bitmapDoQuadro(f.el));
    const objetos = PU.descreverObjetos(dados.objetos || []).texto;
    const r = PU.descreverEnquadramento({ ...dados, espelhada: false, objetos });
    let extra = [];
    try { extra = await diagnosticoDaCamera(dados.rostos || [], f.el); } catch (_) { extra = []; }
    if (extra.length) r.texto = `${r.texto} ${extra.join('. ')}.`;
    clearTimeout(demorou);
    falar(r.texto);
  } catch (e) {
    clearTimeout(demorou);
    alertar('Não consegui analisar o quadro. ' + (e.message || e));
  } finally { st.analisando = false; }
}
/** Alt C, corrigir fundo: luz e fundo do quadro, sem o enquadramento. Na tela Melhorar, é o Analisar fundo. */
async function fundoDoQuadro() {
  if (st.analisando) return;
  if (window.olho && window.olho.telaAtual() === 'melhorar' && !$('grav-melhorar').hidden && !$('mel-analisar-botoes').hidden) return analisarFundo();
  const f = fonteDoQuadro();
  if (!f.el) return falar(f.motivo);
  st.analisando = true;
  const demorou = setTimeout(() => falar('Olhando o fundo, um instante.'), 700);
  try {
    const extra = await diagnosticoDaCamera([], f.aoVivo ? undefined : f.el);
    clearTimeout(demorou);
    falar(extra.length ? extra.join('. ') + '.' : 'Não consegui medir a luz e o fundo neste quadro.');
  } catch (e) {
    clearTimeout(demorou);
    alertar('Não consegui analisar o fundo. ' + (e.message || e));
  } finally { st.analisando = false; }
}
/** Alt Q: o quadro vai para o descritor (Gemma), que descreve com detalhe. */
async function descricaoDoQuadro() {
  if (gravando()) return falar('Descrever com o descritor não funciona durante a gravação. Pare ou termine a gravação e use Alt Q depois.');
  if (st.analisando) return falar('Aguarde, o programa está analisando.');
  const f = fonteDoQuadro();
  if (!f.el) return falar(f.motivo);
  try {
    const bmp = await bitmapDoQuadro(f.el, 1280);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0); bmp.close();
    const png = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    const { caminho } = await chamar('quadroSalvar', { dados: png });
    await window.olho.descreverQuadro(caminho);
  } catch (e) { alertar('Não consegui olhar o quadro. ' + (e.message || e)); }
}
// Vale nas telas com vídeo (etapas de áudio da gravação, Editar vídeo, Dividir) e, para Alt C e Alt Q, também na câmera ao vivo.
document.addEventListener('keydown', (e) => {
  if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) || document.querySelector('dialog[open]')) return;
  const tela = window.olho && window.olho.telaAtual();
  if (!['audio', 'cortar'].includes(tela)) return;
  const acao = e.code === 'KeyE' ? enquadreDoQuadro : e.code === 'KeyC' ? fundoDoQuadro : e.code === 'KeyQ' ? descricaoDoQuadro : null;
  if (!acao) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (!e.repeat) acao();
}, true);

const espelhada = () => $('espelhada').checked;

// --- Teclado ------------------------------------------------------------------------------

// Só valem com a tela Gravar à vista (nas outras telas, Alt R, Alt T e Alt E são de outros botões ou de nada).
document.addEventListener('keydown', (e) => {
  const alt = e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey;
  // 1.8.5: Alt F = Analisar fundo, só na tela Alterar plano de fundo (é outra tela, fora da Gravar;
  // nos Cortes, Alt F continua marcando o fim).
  if (alt && e.code === 'KeyF' && !$('tela-melhorar').hidden && !$('grav-melhorar').hidden && !$('mel-analisar-botoes').hidden) {
    e.preventDefault(); e.stopPropagation();
    if (!e.repeat) analisarFundo();
    return;
  }
  // 1.9.1: Alt S salva em qualquer tela. Nas etapas de áudio, no Editar vídeo e em Tirar fotos, quem cuida é a própria tela
  // (nos Cortes e no Editar, ele salva as seleções); nas outras, salvarNaTela.
  if (alt && e.code === 'KeyS' && window.olho && !document.querySelector('dialog[open]') && !['audio', 'cortar', 'foto', 'editfoto', 'post', 'gaudio', 'inicial', 'sobre'].includes(window.olho.telaAtual())) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) salvarNaTela(window.olho.telaAtual());
    return;
  }
  // 1.8.5: Alt A = Salvar e continuar (avançar), Alt V = Voltar, nas telas depois de gravar.
  if (alt && (e.code === 'KeyA' || e.code === 'KeyV') && window.olho && !document.querySelector('dialog[open]')) {
    const b = [...document.querySelectorAll(`button[data-atalho="${e.code === 'KeyA' ? 'A' : 'V'}"]`)]
      .find((x) => !x.disabled && !x.closest('[hidden]') && x.offsetParent !== null); // 1.9: só o botão que está mesmo à vista
    if (b) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) b.click(); return; }
  }
  if ($('tela-gravar').hidden || !st.aberto) return;
  const nada = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
  const feito = () => { e.preventDefault(); e.stopPropagation(); };
  const naCaptura = !$('grav-captura').hidden;
  if (alt && (e.code === 'KeyR' || e.code === 'KeyT' || e.code === 'KeyP') && naCaptura && st.gravEtapa !== 4 && !gravando()) {
    feito();
    if (!e.repeat) falar(`Alt ${e.code === 'KeyR' ? 'R grava' : 'P pausa'} na Etapa 4, Gravar. Use Salvar e continuar até chegar lá.`);
    return;
  }
  if (alt && e.code === 'KeyE' && naCaptura && st.gravEtapa !== 2 && st.gravEtapa !== 4) {
    feito();
    if (!e.repeat) falar('Alt E fala o enquadramento na Etapa 2, Câmera e microfone, e na Etapa 4, Gravar.');
    return;
  }
  if (alt && e.code === 'KeyR') { feito(); if (!e.repeat) alternarGravacao(); return; }
  if (alt && (e.code === 'KeyP' || e.code === 'KeyT')) { feito(); if (!e.repeat) alternarPausa(); return; }
  if (alt && e.code === 'KeyE') { feito(); if (!e.repeat) enquadramento(); return; }
  if (alt && e.code === 'KeyC' && naCaptura && (st.gravEtapa === 2 || st.gravEtapa === 4)) { feito(); if (!e.repeat) fundoDoQuadro(); return; }
  if (alt && e.code === 'KeyQ' && naCaptura && (st.gravEtapa === 2 || st.gravEtapa === 4)) { feito(); if (!e.repeat) descricaoDoQuadro(); return; }
  if (document.activeElement === $('frase') && nada && TECLAS_FRASE[e.key] !== undefined) {
    feito();
    moverFrase(TECLAS_FRASE[e.key]);
  }
}, true);
// Setas, Home e End andam pelas frases do texto (setas para os lados também, como pede o leitor de tela).
const TECLAS_FRASE = { ArrowDown: 'ArrowDown', ArrowRight: 'ArrowDown', ArrowUp: 'ArrowUp', ArrowLeft: 'ArrowUp',
  Home: 'Home', End: 'End', PageDown: 'PageDown', PageUp: 'PageUp' };

// --- Início, entrada e saída da tela ----------------------------------------------------

async function preparar() {
  st.config = await chamar('configLer');
  montarGrupo('grupo-fonte-audio', 'fonte-audio', PU.FONTES_AUDIO, st.config.fonteAudio || 'mic', (v) => aplicarFonteAudio(v));
  montarGrupo('grupo-formato', 'formato', PU.PROPORCOES, st.config.formato, (v) => { ajustarTela(); atualizarInfoCamera(); salvarConfig({ formato: v }); });
  montarGrupo('grupo-qualidade', 'qualidade', PU.QUALIDADES, st.config.qualidade, (v) => { ajustarTela(); salvarConfig({ qualidade: v }); });
  montarGrupo('grupo-uso', 'uso', PU.USOS_DO_TEXTO, st.config.legenda ? 'legenda' : 'leitor', (v) => salvarConfig({ legenda: v === 'legenda' }));
  // 1.1: o último efeito e o último fundo escolhidos voltam marcados.
  montarGrupo('grupo-efeito', 'efeito', PU.EFEITOS, st.config.efeito || 'borrar', (v) => { mostrarFundos(); if (v !== 'nenhum') salvarConfig({ efeito: v }); });
  { const { cats, opcoes } = opcoesDeFundo(); montarArvoreGrupo('grupo-fundo', 'fundo', cats, opcoes, st.config.fundo || 'escritorio', (v) => salvarConfig({ fundo: v })); }
  // 1.7.1: cada frase é lida uma vez só, pelo falar. O nome da frase (que o NVDA lê ao chegar nela)
  // só muda quando o foco não está nela, para o NVDA não ler a mesma frase duas vezes.
  $('frase').addEventListener('blur', () => { $('frase-nome').textContent = st.frases[st.atual] || ''; });
  $('espelhada').checked = st.config.espelhada !== false;
  $('espelhada-desc').textContent = PU.ESPELHO.descricao;
  $('espelhada').addEventListener('change', () => {
    salvarConfig({ espelhada: $('espelhada').checked });
    falar($('espelhada').checked ? 'Câmera espelhada: marcado.' : 'Câmera espelhada: desmarcado.');
  });
  $('seguir-rosto').checked = st.config.seguirRosto !== false;
  $('seguir-rosto').addEventListener('change', () => {
    salvarConfig({ seguirRosto: $('seguir-rosto').checked });
    st.seguir.cx = 0.5; st.seguir.alvo = null;
    falar($('seguir-rosto').checked ? 'Seguir o rosto: marcado.' : 'Seguir o rosto: desmarcado.');
  });
  $('texto').value = st.config.texto || '';
  atualizarTexto();
  ajustarTela();

  $('camera').addEventListener('change', async () => { salvarConfig({ camera: $('camera').value }); await abrirCamera(); });
  $('microfone').addEventListener('change', async () => { salvarConfig({ microfone: $('microfone').value }); await abrirMicrofone(); });
  let espera = null;
  $('texto').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(atualizarTexto, 400); });
  $('texto').addEventListener('change', () => { atualizarTexto(); salvarConfig({ texto: $('texto').value }); });
  $('abrir-texto').addEventListener('click', abrirTexto);
  $('gravar').addEventListener('click', alternarGravacao);
  $('pausar').addEventListener('click', alternarPausa);
  $('enquadrar').addEventListener('click', enquadramento);
  $('retorno-mic').addEventListener('change', () => {
    const lig = $('retorno-mic').checked;
    if (st.retorno) st.retorno.gain.setTargetAtTime(lig ? 1 : 0, st.audioCtx.currentTime, 0.01);
    falar(lig ? 'Retorno do microfone ligado. Use fone de ouvido.' : 'Retorno do microfone desligado.');
  });
  $('descartar').addEventListener('click', descartarVideo);
  $('salvar-fechar').addEventListener('click', salvarEFechar);
  $('decidir-post').addEventListener('click', irDiretoParaOPost);
  $('decidir-voltar').addEventListener('click', voltarSemDecidir);
  $('mel-abertura-logo').addEventListener('click', escolherLogoAbertura);
  $('mel-abertura-tirar-logo').addEventListener('click', tirarLogoAbertura);
  $('melhorar').addEventListener('click', salvarEContinuar);
  $('mel-continuar').addEventListener('click', () => { if (escolhendoFundo()) return continuarParaAudio(); if (st.editar) return editarLegenda(); st.modoSalvar = 'continuar'; processar(false); });
  $('mel-fechar').addEventListener('click', () => { st.modoSalvar = 'fechar'; processar(false); });
  $('melhorar-voltar').addEventListener('click', voltarDoMelhorar);
  $('cancelar').addEventListener('click', cancelarMelhoria);
  $('mel-analisar').addEventListener('click', analisarFundo);
  // 1.8.5: Alt A e Alt V nos botões Salvar e continuar e Voltar (nome do botão diz o atalho).
  // 1.9.1: no programa todo: Alt A avança, Alt V volta, em todas as telas.
  for (const tela of document.querySelectorAll('[id^="tela-"]')) {
    for (const b of tela.querySelectorAll('button')) {
      const t = b.textContent.trim();
      if (t === 'Salvar e continuar') { b.dataset.atalho = 'A'; b.textContent = 'Salvar e continuar, Alt A'; }
      else if (t === 'Voltar' || t === 'Voltar ao início' || t === 'Voltar para a Edição de vídeo e áudio') { b.dataset.atalho = 'V'; b.textContent = `${t}, Alt V`; }
    }
  }
  $('an-analisar').addEventListener('click', () => analisarVideoFinal());
  $('an-finalizar').addEventListener('click', () => { if (!st.analisandoFundo) mostrarPronto(st.infoFinal || ''); });
  $('an-voltar').addEventListener('click', () => { if (!st.analisandoFundo) abrirMelhorar(); });
  // 1.3: ajustes de áudio, só para o vídeo que acabou de ser gravado.
  // 1.3.1: depois de gravar, áudio primeiro (Cortes) e a imagem por último.
  iniciarAudioCortes(funcoesAudio);
  iniciarLegenda({ falar, alertar, chamar, bipe });
  // 1.9.2: Editar vídeo e Editar áudio.
  $('ed-an-continuar').addEventListener('click', editarContinuarAnalise);
  $('ed-an-voltar').addEventListener('click', () => { if (st.analisandoFundo) return falar('Aguarde, estou analisando o vídeo.'); st.editar = null; if (window.olho) window.olho.voltarAEdicao(); });
  $('ed-an-fechar').addEventListener('click', () => chamar('appSair').catch(() => {}));
  // 1.9.3: a cada escolha, o efeito dela é escrito na tela e falado depois do nome da opção.
  const aoMudarSaida = () => { if (!st.editar) return; $('ori-efeito').textContent = efeitoDaSaida(); falarDepois($('ori-efeito').textContent, 700); };
  const proporcoesEditar = [];
  for (const o of PU.PROPORCOES) {
    proporcoesEditar.push(o.valor === 'vertical' ? { ...o, nome: 'Vertical, 9 por 16, com o vídeo inteiro e fundo desfocado' } : o);
    // 1.9.3: a mesma opção do Dividir: preenche a tela vertical, cortando as laterais.
    if (o.valor === 'vertical') proporcoesEditar.push({ valor: 'vertical-cheio', nome: 'Vertical, 9 por 16, preenchendo a tela, cortando as laterais', descricao: 'O vídeo ocupa a tela toda, como nos Shorts e Reels. Fica só o centro da imagem: o que estiver nas bordas some.' });
  }
  montarGrupo('grupo-sai-formato', 'sai-formato', [{ valor: 'manter', nome: 'Manter como está', descricao: '' }, ...proporcoesEditar], 'manter', aoMudarSaida);
  montarGrupo('grupo-sai-qualidade', 'sai-qualidade', [{ valor: 'manter', nome: 'Manter como está', descricao: '' }, ...PU.QUALIDADES], 'manter', aoMudarSaida);
  $('ori-continuar').addEventListener('click', orientacaoContinuar);
  $('ori-voltar').addEventListener('click', orientacaoVoltar);
  $('ori-fechar').addEventListener('click', () => chamar('appSair').catch(() => {}));
  montarGrupo('grupo-img-tipo', 'img-tipo', [
    { valor: 'fundo', nome: 'Um fundo do programa', descricao: 'Indicação: Vídeo de uma pessoa falando, ou só áudio, que precisa de um cenário. Contraindicação: Quando você tem a foto de quem fala ou as imagens do assunto. Descrição: Uma imagem de fundo do programa, com a legenda embaixo.' },
    { valor: 'foto', nome: 'Fundo neutro com a foto de quem fala', descricao: 'Indicação: Podcast, entrevista e conversa gravada só em áudio. Contraindicação: Quando o assunto pede várias imagens. Descrição: A foto no centro, como num podcast, com a legenda embaixo sem cobrir o rosto.' },
    { valor: 'imagens', nome: 'Imagens, como no Montar vídeo', descricao: 'Indicação: Conto, história narrada e aula com imagens do assunto. Contraindicação: Quando você quer só uma imagem fixa. Descrição: Você adiciona as imagens, e a legenda é opcional.' },
    { valor: 'audio', nome: 'Só o áudio, sem imagem', descricao: 'Indicação: Podcast, música e áudio para publicar em plataforma de áudio. Contraindicação: Vídeo para YouTube ou redes sociais. Descrição: Salva o áudio editado em MP3.' }
  ], '', () => mostrarImagemEscolhas());
  montarGrupo('grupo-img-fundo', 'img-fundo', PU.FUNDOS, '', () => {});
  montarGrupo('grupo-img-formato', 'img-formato', PU.PROPORCOES, 'horizontal', () => {});
  $('img-foto').addEventListener('click', async () => {
    const r = await window.api.escolherFoto();
    if (!r || !r.ok || !r.valor) return;
    st.fotoQuemFala = r.valor;
    $('img-foto-info').textContent = `Foto: ${r.valor.split(/[\\/]/).pop()}.`;
    falar($('img-foto-info').textContent);
    // 1.9.3: o que o programa vê na foto, para quem escolhe sem enxergar.
    try {
      const m = await chamar('imagemMedir', { caminho: r.valor });
      const d = await descreverImagem(m.url).catch(() => null);
      $('img-foto-info').textContent = `Foto: ${r.valor.split(/[\\/]/).pop()}. ${m.texto}${d ? ' ' + d.texto : ''}`;
      falarDepois($('img-foto-info').textContent, 200);
    } catch (_) { /* fica só o nome */ }
  });
  // 1.9.6: Alt D descreve a foto escolhida, com o modelo, se estiver instalado.
  document.addEventListener('keydown', async (e) => {
    if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyD') || $('grav-imagem').hidden || $('tela-melhorar').hidden) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (!st.fotoQuemFala) return falar('Escolha uma foto primeiro, com o botão Escolher foto.');
    const t = await window.olho.descreverComModelo(st.fotoQuemFala);
    if (t) $('img-foto-info').textContent = `Foto: ${st.fotoQuemFala.split(/[\\/]/).pop()}. ${t}`;
  }, true);
  $('img-continuar').addEventListener('click', imagemContinuar);
  $('img-voltar').addEventListener('click', () => abrirEqualizacao());
  $('img-fechar').addEventListener('click', () => chamar('appSair').catch(() => {}));
  mostrarImagemEscolhas();
  $('voltar').addEventListener('click', () => voltarAoInicio());
  $('abrir-pasta').addEventListener('click', () => chamar('pastaAbrir', st.ultimoSalvo && st.ultimoSalvo.pasta).catch((e) => alertar(e.message)));
  for (let i = 1; i <= 4; i++) {
    if (i < 4) $('grav-e' + i + '-continuar').addEventListener('click', () => continuarEtapaGrav(i));
    $('grav-e' + i + '-voltar').addEventListener('click', () => voltarEtapaGrav(i));
    $('grav-e' + i + '-fechar').addEventListener('click', fecharGravar);
    $('grav-nav-' + i).addEventListener('click', () => { if (etapaGravLivre()) irParaEtapaGrav(i); });
  }
  $('pronto-inicio').addEventListener('click', irParaInicio);
  st.preparado = true;
}

// Funções que as telas de áudio usam. Na gravação, o áudio continua para a imagem;
// 1.9: na Edição de vídeo e áudio, as mesmas telas salvam o arquivo editado e terminam ali.
const funcoesGravacao = {
  // 1.8.5: o áudio vem depois da imagem: Voltar volta para Alterar plano de fundo; no fim do áudio,
  // o vídeo é feito com o fundo escolhido, sobre o vídeo cortado e com o som final.
  voltar: () => abrirMelhorar(),
  continuar: (salvo) => { st.fonteMelhoria = salvo; if (st.editar) editarDepoisDoAudio(); else abrirLegendaGravacao(); }
};
/** 1.9: na gravação, depois das etapas de áudio vem a tela de legenda; depois, título e logo. */
function abrirLegendaGravacao() {
  const o = st.original;
  abrirLegenda({
    audio: st.fonteMelhoria.arquivo,
    nome: semMp4(o.nome),
    aoTerminar: (r) => { st.legenda = r; abrirMelhorar(); },
    aoVoltar: () => abrirEqualizacao()
  });
}
const funcoesAudio = { falar, falarDepois, alertar, bipe, chamar, mostrarTela, ...funcoesGravacao, inicio: () => irParaInicio() };

/** 1.9: Editar áudio da Edição de vídeo e áudio: as mesmas telas de áudio do Gravar vídeo. */
async function editarAudio(arq) {
  const motivo = ocupado();
  if (motivo) return falar(motivo);
  if (st.preparandoEdicao) return falar('Aguarde, estou preparando o áudio.');
  st.preparandoEdicao = true;
  falar('Preparando o áudio, um instante.');
  let r;
  try { r = await prepararAudioComAviso(arq.original, !!arq.semImagem); } catch (e) { return alertar('Não consegui abrir o áudio. ' + e.message); } finally { st.preparandoEdicao = false; }
  // 1.9.2: arquivo só de áudio: no fim das etapas, a imagem do vídeo. Vídeo: salva como antes.
  funcoesAudio.continuar = arq.soAudio && !arq.semImagem ? (salvo) => { sairAudio(); abrirImagemDoAudio(salvo, arq); } : null; // 3.0: Editar áudio, no menu Áudio, termina no MP3
  funcoesAudio.voltar = () => { sairAudio(); if (window.olho) window.olho.voltarAEdicao(); };
  funcoesAudio.dividir = null;
  funcoesAudio.soCortes = false;
  funcoesAudio.noPost = false;
  st.audioDono = 'edicao';
  abrirAudioCortes({ arquivo: r.arquivo, nome: arq.nome, pasta: arq.pasta, soAudio: !!(arq.soAudio || arq.semImagem) });
}
/** Volta as telas de áudio para o jeito da gravação. */
function modoGravacao() {
  Object.assign(funcoesAudio, funcoesGravacao); funcoesAudio.dividir = null; funcoesAudio.noPost = false;
  // 1.9.3: no Editar vídeo, a parte do áudio é só a dos Cortes.
  funcoesAudio.soCortes = !!(st.editar && !st.editar.deImagem);
  st.audioDono = 'gravacao';
}

/** 1.9.2: cortes manuais do Dividir: a tela de Cortes do áudio, com o vídeo inteiro. */
async function dividirManual(arq, cb) {
  const motivo = ocupado();
  if (motivo) return falar(motivo);
  funcoesAudio.continuar = null;
  funcoesAudio.dividir = cb;
  funcoesAudio.soCortes = false;
  funcoesAudio.noPost = false;
  funcoesAudio.voltar = () => { sairAudio(); funcoesAudio.dividir = null; cb.aoVoltar(); };
  st.audioDono = 'dividir';
  abrirAudioCortes({ arquivo: arq.caminho, nome: arq.nome, pasta: '' });
}

/** 1.9: o áudio do Montar vídeo passa pelas mesmas etapas de áudio. No fim, aoTerminar recebe o
   arquivo de trabalho; Voltar na Etapa 1 de áudio chama aoVoltar. O mesmo áudio, sem mudança,
   volta para as etapas com os cortes e escolhas de antes. */
/** 1.9.6: prepara o áudio e, se demorar, toca um bipe de andamento e avisa que ainda está trabalhando. */
async function prepararAudioComAviso(original, semImagem = false) {
  let n = 0;
  const t = setInterval(() => { n++; bipe('andamento'); if (n === 3 || n % 10 === 0) falarDepois('Ainda preparando o áudio.', 100); }, 4000);
  try { return await chamar('edicaoPrepararaudio', { original, semImagem }); } finally { clearInterval(t); }
}
async function audioDoMontar(arq, cb) {
  const motivo = ocupado();
  if (motivo) return falar(motivo);
  if (st.preparandoEdicao) return falar('Aguarde, estou preparando o áudio.');
  const dono = 'montar:' + arq.original;
  funcoesAudio.continuar = (salvo) => { sairAudio(); cb.aoTerminar(salvo); };
  funcoesAudio.voltar = () => { sairAudio(); cb.aoVoltar(); };
  funcoesAudio.dividir = null;
  funcoesAudio.soCortes = false;
  funcoesAudio.noPost = false;
  if (st.audioDono === dono && window.__audioCortes.video) { voltarAosCortes(); return; }
  st.preparandoEdicao = true;
  falar('Preparando o áudio, um instante.');
  let r;
  try { r = await prepararAudioComAviso(arq.original); } catch (e) { return alertar('Não consegui abrir o áudio. ' + e.message); } finally { st.preparandoEdicao = false; }
  st.audioDono = dono;
  abrirAudioCortes({ arquivo: r.arquivo, nome: arq.nome, pasta: arq.pasta, soAudio: true });
}
/** Etapa 2 do Montar, Voltar: volta para a última etapa de áudio, se ela ainda é do Montar. */
function voltarAoAudioDoMontar() {
  if (!String(st.audioDono || '').startsWith('montar:') || !window.__audioCortes.video) return false;
  abrirEqualizacao();
  return true;
}

/** 1.9.1: Alt S fora das etapas de áudio e do Editar vídeo. */
async function salvarNaTela(tela) {
  const motivo = ocupado();
  if (motivo) return falar(motivo);
  if (tela === 'legenda') return salvarLegendaAgora();
  if (tela === 'gravar') {
    if (!$('grav-decidir').hidden && st.original) {
      try { const o = await guardarOriginal(); return falarDepois(`Salvo: vídeo na pasta ${o.documentos}, Olho da Cena, com o nome ${semMp4(o.nome)}.`, 150); }
      catch (e) { return alertar(`O vídeo não foi salvo. ${e.message}`); }
    }
    if (!$('grav-pronto').hidden) return falar('O vídeo já está salvo na pasta Olho da Cena.');
    return falar('Nada para salvar ainda. Grave primeiro, com Alt R, na Etapa 4.');
  }
  if (tela === 'melhorar') {
    // Depois do áudio, salva como está (com os cortes e o som editado); antes, salva a gravação.
    if (st.origem === 'gravar' && st.fonteMelhoria) return salvarAudioComoEsta();
    if (st.original) {
      try { const o = await guardarOriginal(); return falarDepois(`Salvo: vídeo na pasta ${o.documentos}, Olho da Cena, com o nome ${semMp4(o.nome)}.`, 150); }
      catch (e) { return alertar(`O vídeo não foi salvo. ${e.message}`); }
    }
    return falar('Nada para salvar ainda.');
  }
  if (window.olho && window.olho.salvarNaTela) return window.olho.salvarNaTela(tela);
  falar('Nada para salvar nesta tela.');
}

// --- 1.9.2: Editar vídeo e Editar áudio ------------------------------------------------------------
// O Editar vídeo usa o mesmo caminho da gravação: fundo (só com pessoa), etapas de áudio (os cortes
// valem para a imagem), título e logo (se o vídeo não tiver), legenda (se não tiver), orientação e
// qualidade, e o vídeo final. O vídeo escolhido nunca é alterado: o resultado vai para a pasta Olho da Cena.
async function editarVideo(arq) {
  const motivo = ocupado();
  if (motivo) return falar(motivo);
  modoGravacao();
  st.origem = 'gravar';
  st.original = { arquivo: arq.original, nome: arq.nome, duracao: arq.duracao, ...medidasDoVideo(arq.largura, arq.altura), provisorio: false, externo: true };
  st.fonteMelhoria = null; st.legenda = null; st.saida = null; st.aberturaLogo = null;
  $('mel-abertura-titulo').value = ''; mostrarLogoAbertura();
  st.editar = { pessoa: false, logo: false, legenda: false, analisado: false };
  for (const id of ['ed-tem-pessoa', 'ed-tem-logo', 'ed-tem-legenda']) $(id).checked = false;
  $('ed-an-info').textContent = avisoAnalise(arq.duracao);
  mostrarTela('grav-editar');
  $('titulo-editar').focus();
  falarDepois(`Editar vídeo: análise. ${$('ed-an-info').textContent}`, 200);
  st.analisandoFundo = true;
  try {
    const o = st.original;
    const [texto, det] = await Promise.all([
      analisarArquivo({ arquivo: o.arquivo, duracao: o.duracao, formato: o.formato, qualidade: o.qualidade, efeito: 'nenhum', fundo: '' }),
      chamar('editarDetectar', { arquivo: o.arquivo, duracao: o.duracao })
    ]);
    const comRosto = (st.ultimasMedidas || []).flat().filter((m) => m && m.rosto).length;
    st.editar.pessoa = comRosto > 0;
    st.editar.logo = !!det.logo; st.editar.legenda = !!det.legenda;
    st.editar.det = det; st.editar.largura = arq.largura; st.editar.altura = arq.altura; st.editar.qualidadeTexto = null;
    $('ed-tem-pessoa').checked = st.editar.pessoa; $('ed-tem-logo').checked = st.editar.logo; $('ed-tem-legenda').checked = st.editar.legenda;
    const fmt = { horizontal: 'horizontal', vertical: 'vertical', quadrado: 'quadrado' }[o.formato];
    const menor = Math.min(arq.largura, arq.altura);
    const qualidade = menor >= 1000 ? 'qualidade alta' : menor >= 700 ? 'qualidade boa' : 'qualidade baixa';
    st.editar.qualidadeTexto = qualidade;
    const partes = [
      `Vídeo ${fmt}, ${arq.largura} por ${arq.altura}, ${qualidade}.`,
      // Com pessoa, a análise do fundo (luz no rosto, sombra, recorte); sem pessoa, a luz e a nitidez
      // da imagem toda, sem procurar rosto. A nitidez vale nos dois casos.
      comRosto > 0 ? `${texto} Nitidez: ${det.nitidez}.` : `Luz: ${det.luz}. Nitidez: ${det.nitidez}.`,
      st.editar.pessoa ? 'Tem pessoa no vídeo: dá para borrar ou trocar o fundo.' : 'Não achei pessoa no vídeo: a troca e o borrão do fundo ficam de fora.',
      det.legenda ? 'Parece ter legenda.' : '',
      det.logo ? `Parece ter logo, ${det.cantoLogo}.` : ''
    ].filter(Boolean);
    st.editar.analisado = true;
    anunciarResultado('ed-an-info', partes.join(' '));
  } catch (e) {
    alertar('Não consegui analisar o vídeo. ' + (e.message || e) + ' Você pode marcar as opções e seguir.');
  } finally { st.analisandoFundo = false; }
}
function editarContinuarAnalise() {
  if (st.analisandoFundo) return falar('Aguarde, estou analisando o vídeo.');
  st.editar.pessoa = $('ed-tem-pessoa').checked;
  st.editar.logo = $('ed-tem-logo').checked;
  st.editar.legenda = $('ed-tem-legenda').checked;
  if (st.editar.pessoa) return abrirMelhorar();
  const n = $('efeito-nenhum'); if (n) n.checked = true;
  continuarParaAudio();
}
/** Depois do áudio: título e logo, se o vídeo ainda não tiver; senão, a legenda. */
function editarDepoisDoAudio() {
  if (!st.editar.logo) return abrirMelhorar();
  editarLegenda('O vídeo já tem título ou logo: essa etapa fica de fora.');
}
function editarLegenda(aviso = '') {
  if (st.editar.legenda) return abrirOrientacao(`${aviso} O vídeo já tem legenda: essa etapa fica de fora, porque legenda gravada na imagem não sai.`.trim());
  abrirLegenda({
    audio: st.fonteMelhoria.arquivo,
    nome: semMp4(st.original.nome).replace(/\.[^.]+$/, ''),
    aoTerminar: (r) => { st.legenda = r; abrirOrientacao(); },
    aoVoltar: () => (st.editar.logo ? voltarAoAudioEditar() : abrirMelhorar())
  });
}
/** 1.9.3: o que a análise viu ao carregar o vídeo, para escolher a orientação e a qualidade com consciência. */
function diagnosticoDaSaida() {
  const e = st.editar, w = e.largura || st.original.largura, h = e.altura || st.original.altura;
  const fmt = window.Divisao.formatoDe(w, h);
  const partes = [`Na análise: vídeo ${fmt}, ${w} por ${h}${e.qualidadeTexto ? ', ' + e.qualidadeTexto : ''}.`];
  if (e.det) partes.push(`${e.det.luz.charAt(0).toUpperCase() + e.det.luz.slice(1)}; ${e.det.nitidez}.`);
  if (e.legenda) partes.push('O vídeo tem legenda gravada na imagem.');
  return partes.join(' ');
}
/** O efeito da orientação e da qualidade marcadas, antes de salvar. */
function efeitoDaSaida() {
  const e = st.editar, w = e.largura || st.original.largura, h = e.altura || st.original.altura, menor = Math.min(w, h);
  const f = valorDe('sai-formato') || 'manter', q = valorDe('sai-qualidade') || 'manter';
  const frases = [];
  const avisos = window.Divisao.avisosOrientacao(f, w, h, !!e.legenda);
  frases.push(f === 'manter' ? 'A orientação fica como está.' : avisos.length ? avisos.join(' ') : 'A orientação muda, com o vídeo inteiro na tela nova.');
  if (q === 'manter') frases.push(`A qualidade fica a do original, ${menor} linhas.`);
  else if ((q === 'alta' || q === 'padrao') && menor < 1000) frases.push(`O original tem ${menor} linhas: ${q === 'alta' ? 'Alta' : 'Padrão'} não deixa a imagem mais nítida, só deixa o arquivo maior.`);
  else if (q === 'alta') frases.push('Alta mantém toda a nitidez do original, com o arquivo maior.');
  else if (q === 'padrao') frases.push('Padrão mantém a nitidez, com o arquivo menor que o da Alta.');
  else if (q === 'leve' && menor > 760) frases.push('Leve diminui a imagem para 720 linhas: o arquivo fica bem menor, com um pouco menos de nitidez.');
  else frases.push('Leve mantém a nitidez do original, com o arquivo menor.');
  if (e.det && /desfocada/.test(e.det.nitidez) && q !== 'manter' && q !== 'leve') frases.push('A imagem original já está desfocada: a qualidade escolhida não resolve isso.');
  if (e.det && /escura/.test(e.det.luz)) frases.push('A imagem original está escura: a qualidade não muda a luz.');
  return frases.join(' ');
}
function abrirOrientacao(aviso = '') {
  // Feito de uma imagem (Editar áudio): a orientação já foi escolhida.
  if (st.editar.deImagem) { st.saida = null; st.modoSalvar = 'continuar'; return processar(false); }
  $('ori-diag').textContent = diagnosticoDaSaida();
  $('ori-efeito').textContent = efeitoDaSaida();
  mostrarTela('grav-orientacao');
  $('titulo-orientacao').focus();
  falarDepois(`${aviso ? aviso + ' ' : ''}Orientação e qualidade. ${$('ori-diag').textContent} ${$('ori-efeito').textContent}`, 250);
}
function orientacaoContinuar() {
  const f = valorDe('sai-formato'), q = valorDe('sai-qualidade');
  st.saida = { formato: f && f !== 'manter' ? f : null, qualidade: q && q !== 'manter' ? q : null };
  st.modoSalvar = 'continuar';
  mostrarTela('grav-melhorar');
  processar(false);
}
function orientacaoVoltar() {
  if (!st.editar.legenda) return editarLegenda();
  if (!st.editar.logo) return abrirMelhorar();
  voltarAoAudioEditar();
}
/** Volta para a parte do áudio: os Cortes no Editar vídeo; a Equalização no vídeo feito de imagem (Editar áudio). */
function voltarAoAudioEditar() { return st.editar && st.editar.deImagem ? abrirEqualizacao() : voltarAosCortes(); }

/** Editar áudio, arquivo só de áudio: depois das etapas de áudio, a imagem do vídeo. */
function abrirImagemDoAudio(salvo, arq) {
  st.audioEditado = { salvo, arq };
  mostrarImagemEscolhas();
  mostrarTela('grav-imagem');
  $('titulo-imagem').focus();
  falarDepois(`Áudio pronto. Imagem do vídeo.`, 250);
}
function mostrarImagemEscolhas() {
  const t = valorDe('img-tipo');
  $('grupo-img-fundo').hidden = t !== 'fundo';
  $('img-foto-bloco').hidden = t !== 'foto';
  $('grupo-img-formato').hidden = t === 'audio' || !t;
}
async function imagemContinuar() {
  const a = st.audioEditado;
  if (!a) return;
  const t = valorDe('img-tipo');
  if (!t) { focarGrupo('img-tipo'); return alertar('Escolha a imagem do vídeo, ou Só o áudio.'); }
  const nome = String(a.arq.nome || 'audio').replace(/\.[^.]+$/, '');
  if (t === 'audio') {
    try {
      const r = await chamar('salvarCopia', { arquivo: a.salvo.arquivo, nome: `${nome} editado`, soAudio: true, exato: true });
      st.audioEditado = null;
      if (window.olho) window.olho.voltarAEdicao(`Áudio salvo na pasta ${r.documentos}, Olho da Cena, com o nome ${r.nome}.`);
      return;
    } catch (e) { return alertar('Não consegui salvar o áudio. ' + e.message); }
  }
  const formato = valorDe('img-formato') || 'horizontal';
  if (t === 'imagens') {
    if (window.olho && window.olho.montarComAudio) return window.olho.montarComAudio(a.salvo.arquivo, nome, formato);
    return;
  }
  if (t === 'fundo' && !valorDe('img-fundo')) { focarGrupo('img-fundo'); return alertar('Escolha um dos fundos.'); }
  if (t === 'foto' && !st.fotoQuemFala) { $('img-foto').focus(); return alertar('Escolha a foto de quem fala.'); }
  falar('Fazendo o vídeo com a imagem. Aguarde.');
  try {
    const v = await chamar('editarVideodeimagem', { audio: a.salvo.arquivo, tipo: t, fundo: valorDe('img-fundo'), foto: st.fotoQuemFala, formato });
    st.origem = 'gravar';
    st.original = { arquivo: v.arquivo, nome: `${nome}.mp4`, duracao: v.duracao, ...medidasDoVideo(v.largura, v.altura), provisorio: false, externo: true };
    st.fonteMelhoria = { arquivo: v.arquivo, duracao: v.duracao };
    st.legenda = null; st.saida = null; st.aberturaLogo = null;
    $('mel-abertura-titulo').value = ''; mostrarLogoAbertura();
    const n = $('efeito-nenhum'); if (n) n.checked = true;
    // Aqui título, logo e legenda ficam sempre disponíveis: não há nada gravado antes.
    st.editar = { pessoa: false, logo: false, legenda: false, deImagem: true };
    editarDepoisDoAudio();
  } catch (e) { alertar('Não consegui fazer o vídeo com a imagem. ' + e.message); }
}




function ocupado() {
  if (gravando()) return 'Pare a gravação antes de sair (Alt R).';
  if (ocupadoLegenda()) return ocupadoLegenda();
  if (st.salvando) return 'Aguarde, ainda estou salvando o vídeo.';
  if (st.melhoria) return 'Aguarde, estou processando o vídeo. Para parar, use o botão Cancelar.';
  return null;
}

function irParaInicio() {
  const motivo = ocupado();
  if (motivo) return falar(motivo);
  if (st.modoPost) return terminarModoPost(null);
  if (window.olho) window.olho.mostrarTela('inicial');
}

/** Entrou na tela Gravar: abre câmera e microfone (só agora, para não ocupar a câmera à toa). */
/** 3.0.2: o Criar post pede um vídeo gravado na hora. A proporção já vem escolhida e, no fim, o que estava escolhido antes volta. */
function pedirVideoPost(cfg) {
  st.modoPost = cfg;
  st.postAnterior = { formato: valorDe('formato') || '', qualidade: valorDe('qualidade') || '' };
  const marca = (nome, valor) => { const r = document.querySelector(`input[name="${nome}"][value="${valor}"]`); if (r && !r.checked) r.click(); };
  marca('formato', cfg.formato);
  if (!valorDe('qualidade')) marca('qualidade', 'padrao');
  st.original = null;
  for (const p of ['grav-captura', 'grav-decidir', 'grav-pronto']) $(p).hidden = p !== 'grav-captura';
  for (const id of ['grav-orient-2', 'grav-orient-4']) { const p = $(id); p.textContent = cfg.orientacao || ''; p.hidden = !cfg.orientacao; }
  st.gravEtapa = 2;
}
function terminarModoPost(info) {
  const cfg = st.modoPost; st.modoPost = null;
  if (!cfg) return;
  const marca = (nome, valor) => { const r = valor && document.querySelector(`input[name="${nome}"][value="${valor}"]`); if (r && !r.checked) r.click(); };
  if (st.postAnterior) { marca('formato', st.postAnterior.formato); marca('qualidade', st.postAnterior.qualidade); }
  botoesDeDecidir();
  for (const id of ['grav-orient-2', 'grav-orient-4']) { $(id).textContent = ''; $(id).hidden = true; }
  st.original = null;
  if (cfg.aoTerminar) cfg.aoTerminar(info);
}
const dadosDoVideoGravado = (o) => ({ arquivo: o.arquivo, nome: o.nome, duracao: o.duracao, pasta: o.pasta });
async function irDiretoParaOPost() {
  if (!st.original || !st.modoPost) return;
  let o;
  try { o = await guardarOriginal(); } catch (e) { return alertar(`O vídeo não foi salvo. ${e.message}`); }
  terminarModoPost({ video: dadosDoVideoGravado(o), edicao: null });
}
async function continuarParaAudioDoPost() {
  if (!st.original || !st.modoPost) return;
  let o;
  try { o = await guardarOriginal(); } catch (e) { return alertar(`O vídeo não foi salvo. ${e.message}`); }
  falar(`Vídeo salvo com o nome ${semMp4(o.nome)}.`);
  audioDoPost(dadosDoVideoGravado(o), {
    aoTerminar: (salvo) => terminarModoPost({ video: dadosDoVideoGravado(o), edicao: salvo }),
    aoVoltar: () => { mostrarTela('grav-captura'); mostrarDecidirDoPost(); }
  });
}
function mostrarDecidirDoPost() {
  const o = st.original; if (!o) return;
  prepararPlayerDecidir();
  botoesDeDecidir();
  const info = `Vídeo gravado para o post, já salvo. Duração: ${PU.duracaoFalada(o.duracao)}. Escolha Descartar e gravar outro, Salvar e continuar para o áudio, Ir direto para o post, ou Voltar.`;
  $('decidir-info').textContent = info;
  mostrarTela('grav-decidir');
  $('melhorar').focus();
  falarDepois(info, 300);
}
/** 3.0.2: as telas de áudio do Gravar vídeo, para um vídeo do post: cortes, silêncios e trilhas, sem equalização. Elas só marcam o plano; quem aplica é a preparação do post. */
async function audioDoPost(arq, cb) {
  const motivo = ocupado();
  if (motivo) return falar(motivo);
  if (st.preparandoEdicao) return falar('Aguarde, estou preparando o áudio.');
  funcoesAudio.continuar = (salvo) => { sairAudio(); cb.aoTerminar(salvo); };
  funcoesAudio.voltar = () => { sairAudio(); cb.aoVoltar(); };
  funcoesAudio.dividir = null;
  funcoesAudio.soCortes = false;
  funcoesAudio.noPost = true;
  st.audioDono = 'post:' + arq.arquivo;
  st.preparandoEdicao = true;
  falar('Preparando o áudio, um instante.');
  let r;
  try { r = await prepararAudioComAviso(arq.arquivo); } catch (e) { return alertar('Não consegui abrir o áudio. ' + e.message); } finally { st.preparandoEdicao = false; }
  abrirAudioCortes({ arquivo: r.arquivo, nome: arq.nome, pasta: arq.pasta || '', soAudio: false });
}
async function entrar() {
  st.aberto = true;
  await st.preparando;
  iniciarDesenho();
  if (!st.dispositivosProntos) {
    // Pede a permissão uma vez, para o Windows mostrar os nomes de verdade das câmeras e microfones.
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      pararFluxo(s);
    } catch (_) {
      try { pararFluxo(await navigator.mediaDevices.getUserMedia({ audio: true })); } catch (__) { /* */ }
    }
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      if (!st.aberto || gravando() || st.salvando) return;
      const antesCam = $('camera').value, antesMic = $('microfone').value;
      await listarDispositivos();
      if ($('camera').value !== antesCam) await abrirCamera();
      if ($('microfone').value !== antesMic) await abrirMicrofone();
    });
    st.dispositivosProntos = true;
  }
  const n = await listarDispositivos();
  if (!st.aberto) return;
  const okCam = n.cams ? await abrirCamera() : false;
  const okMic = n.mics ? await abrirMicrofone() : false;
  if (!st.aberto) { fecharDispositivos(); return; }
  mostrarEstado();
  if ($('grav-captura').hidden) return;
  irParaEtapaGrav(st.gravEtapa, { silencioso: true });
  const falta = [!n.cams && 'Nenhuma câmera encontrada.', !n.mics && 'Nenhum microfone encontrado.'].filter(Boolean).join(' ');
  const escolher = !valorDe('formato') || !qualidade() ? ' Antes da primeira gravação, escolha a proporção e a qualidade.' : '';
  if (falta) alertar(`${falta} Conecte e entre de novo nesta tela.`);
  else if (okCam && okMic) setTimeout(() => { falar(`Gravar vídeo. Etapa ${st.gravEtapa} de 4: ${NOMES_ETAPA_GRAV[st.gravEtapa]}.` + (st.gravEtapa === 4 ? ' Alt R grava, Alt P pausa, Alt E fala o enquadramento.' : ' Salvar e continuar, Alt A, vai para a próxima etapa.') + (st.gravEtapa === 1 ? escolher : '') + (st.modoPost && st.modoPost.orientacao ? ' ' + st.modoPost.orientacao : '')); st.pronto = true; }, 400);
  if (falta || !(okCam && okMic)) st.pronto = true;
  // Prepara a detecção de rosto em segundo plano, para o primeiro Alt E não demorar.
  setTimeout(() => trabalhador('carregar').catch(() => {}), 1500);
}

function fecharDispositivos() {
  pararFluxo(st.cameraStream);
  st.cameraStream = null;
  pararFluxo(st.micStream);
  st.micStream = null;
  if (st.fonteAudio) { try { st.fonteAudio.disconnect(); } catch (_) { /* */ } st.fonteAudio = null; }
  fecharSomDoPc();
  const v = $('camera-video');
  v.srcObject = null;
  pararDesenho();
}

/** Saiu da tela Gravar: fecha câmera e microfone (a luz da câmera apaga). */
function sair() {
  st.aberto = false;
  st.pronto = false;
  fecharDispositivos();
}

window.gravarTela = { audioDoPost, pedirVideoPost, bipe, descreverImagem, abrirLegenda, editarAudio, editarVideo, dividirManual, audioDoMontar, voltarAoAudioDoMontar, irParaEtapaGrav, entrar, sair, ocupado, melhorarDoEditar, abrirMelhorar, alternarPausa, voltarAoInicio: () => voltarAoInicio(false), estado: st };

// Prepara as escolhas já na abertura do programa (sem câmera), para a tela abrir com tudo no lugar.
st.preparando = preparar().catch((e) => alertar('Erro ao preparar a tela de gravar: ' + (e.message || e)));
