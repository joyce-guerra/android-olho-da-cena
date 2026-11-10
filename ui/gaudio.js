/* Olho da Cena 3.0: tela Gravar áudio.
   Só o som: o microfone, o som do computador ou os dois, com retorno opcional no fone.
   Etapa 1: microfone e fonte. Etapa 2: gravar (Alt R começa e para, Alt P pausa) e decidir o que fazer com o áudio.
   Módulo à parte: os nomes daqui não se misturam com os de outras telas. */

const $ = (id) => document.getElementById(id);
const PU = window.api.puro;
const AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
const NOMES_FONTE = { mic: 'só o microfone', pc: 'só o som do computador', ambos: 'o microfone e o som do computador' };

const st = {
  aberto: false, etapa: 1, config: {}, preparado: false, anuncios: [],
  micStream: null, pcStream: null, ctx: null, ganho: null, destino: null, retorno: null, fonteMic: null, fontePc: null,
  gravador: null, id: null, cadeia: Promise.resolve(), erro: null, pausado: false, acumulado: 0, inicioTrecho: 0, relogio: null,
  provisorio: null, fonte: 'mic', fornecerPc: null, ocupado: false,
};
window.__gaudio = st; // usado só pelos testes automáticos

let alterna = false;
function falar(msg) {
  alterna = !alterna;
  $('status').textContent = msg ? msg + (alterna ? ' ' : '') : '';
  if (msg) st.anuncios.push(msg);
}
let adiada = null;
function falarDepois(msg, ms = 250) { clearTimeout(adiada); adiada = setTimeout(() => falar(msg), ms); }
const bipe = (t) => { try { if (window.gravarTela && window.gravarTela.bipe) window.gravarTela.bipe(t); } catch (_) { /* sem som, segue */ } };
const salvarConfig = (c) => window.api.configSalvar(c).then((r) => { if (r && r.ok) st.config = r.valor; }).catch(() => {});
const pararFluxo = (f) => { if (f) f.getTracks().forEach((t) => t.stop()); };
const falaDuracao = (ms) => (PU.duracaoFalada ? PU.duracaoFalada(ms / 1000) : `${Math.round(ms / 1000)} segundos`);

// --- Microfone e fontes de som ---------------------------------------------------------------------------

async function listarMicrofones() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  const mics = devs.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d, i) => [d.deviceId, d.label || `Microfone ${i + 1}`]);
  const sel = $('ga-mic');
  sel.textContent = '';
  for (const [v, n] of (mics.length ? [['', 'Padrão do Windows'], ...mics] : [])) { const o = document.createElement('option'); o.value = v; o.textContent = n; sel.appendChild(o); }
  if (!mics.length) { const o = document.createElement('option'); o.value = ''; o.textContent = 'Nenhum microfone encontrado'; sel.appendChild(o); }
  if (st.config.microfone && [...sel.options].some((o) => o.value === st.config.microfone)) sel.value = st.config.microfone;
  return mics.length;
}
function garantirAudio() {
  if (st.ctx) return;
  st.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  st.ganho = st.ctx.createGain();
  st.destino = st.ctx.createMediaStreamDestination();
  st.ganho.connect(st.destino);
  st.retorno = st.ctx.createGain();
  st.retorno.gain.value = $('ga-retorno').checked ? 1 : 0;
  st.ganho.connect(st.retorno);
  st.retorno.connect(st.ctx.destination);
}
async function abrirMicrofone() {
  pararFluxo(st.micStream); st.micStream = null;
  const id = $('ga-mic').value;
  try { st.micStream = await navigator.mediaDevices.getUserMedia({ audio: id ? { ...AUDIO, deviceId: { exact: id } } : AUDIO }); }
  catch (_) {
    try { st.micStream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO }); }
    catch (e) { falar('Não consegui abrir o microfone. Confira se ele está ligado e liberado no Windows.'); return false; }
  }
  garantirAudio();
  if (st.ctx.state === 'suspended') await st.ctx.resume().catch(() => {});
  if (st.fonteMic) { try { st.fonteMic.disconnect(); } catch (_) { /* */ } }
  st.fonteMic = st.ctx.createMediaStreamSource(st.micStream);
  ligarFontes();
  return true;
}
function ligarFontes() {
  const modo = st.fonte;
  for (const [no, para] of [[st.fonteMic, st.ganho], [st.fonteMic, st.retorno], [st.fontePc, st.ganho], [st.ganho, st.retorno]]) {
    if (no) { try { no.disconnect(para); } catch (_) { /* não estava ligado */ } }
  }
  if (st.fonteMic && modo !== 'pc') st.fonteMic.connect(st.ganho);
  if (st.fontePc && modo !== 'mic') st.fontePc.connect(st.ganho);
  // Retorno no fone: só o microfone. O som do computador nunca volta para o fone, senão faz eco.
  if (modo === 'mic') st.ganho.connect(st.retorno);
  else if (st.fonteMic && modo === 'ambos') st.fonteMic.connect(st.retorno);
}
async function abrirSomDoPc() {
  if (st.pcStream && st.pcStream.getAudioTracks().some((t) => t.readyState === 'live')) return true;
  fecharSomDoPc();
  try {
    const bruto = st.fornecerPc ? await st.fornecerPc() : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    bruto.getVideoTracks().forEach((t) => { t.stop(); bruto.removeTrack(t); });
    if (!bruto.getAudioTracks().length) { pararFluxo(bruto); throw new Error('sem áudio'); }
    st.pcStream = bruto;
    garantirAudio();
    st.fontePc = st.ctx.createMediaStreamSource(bruto);
    return true;
  } catch (_) { fecharSomDoPc(); return false; }
}
function fecharSomDoPc() {
  pararFluxo(st.pcStream); st.pcStream = null;
  if (st.fontePc) { try { st.fontePc.disconnect(); } catch (_) { /* */ } st.fontePc = null; }
}
async function aplicarFonte(novo, silencioso) {
  garantirAudio();
  if (novo !== 'mic' && !(await abrirSomDoPc())) {
    st.fonte = 'mic';
    const r = $('ga-fonte-mic'); if (r) r.checked = true;
    ligarFontes(); salvarConfig({ fonteAudio: 'mic' });
    falar('Não consegui captar o som do computador. Isso só funciona no Windows 10 ou mais novo. A gravação continua só com o microfone.');
    return false;
  }
  st.fonte = novo;
  if (novo === 'mic') fecharSomDoPc();
  ligarFontes(); salvarConfig({ fonteAudio: novo });
  if (!silencioso) falarDepois(`Vai gravar ${NOMES_FONTE[novo]}.`, 150);
  return true;
}

// --- Etapas ----------------------------------------------------------------------------------------------------

function irParaEtapa(n, { fala = true } = {}) {
  st.etapa = n;
  $('ga-e1').hidden = n !== 1; $('ga-e2').hidden = n !== 2;
  window.scrollTo(0, 0);
  $(`ga-e${n}-titulo`).focus();
  if (fala) falarDepois(`Etapa ${n} de 2: ${n === 1 ? 'Fonte e microfone' : 'Gravar'}.`);
}
async function etapa1() {
  if (!st.micStream && st.fonte !== 'pc') {
    if (!(await abrirMicrofone())) return;
  }
  if (st.fonte !== 'mic' && !(st.pcStream && st.pcStream.getAudioTracks().length)) { if (!(await aplicarFonte(st.fonte, true))) return; }
  $('ga-estado').textContent = 'Pronto para gravar.';
  $('ga-decidir').hidden = true; $('ga-gravando-bloco').hidden = false;
  irParaEtapa(2, { fala: false });
  falarDepois(`Etapa 2 de 2: Gravar. Vai gravar ${NOMES_FONTE[st.fonte]}. Alt R começa a gravar.`, 200);
}
const gravando = () => !!st.gravador && st.gravador.state !== 'inactive';
const tempoGravado = () => st.acumulado + (st.pausado || !gravando() ? 0 : performance.now() - st.inicioTrecho);

function escolherFormato() {
  const op = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return op.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}
async function iniciar() {
  if (st.etapa !== 2) return falar('Alt R grava na Etapa 2, Gravar. Use Salvar e continuar para chegar lá.');
  if (gravando()) return parar();
  if (!$('ga-decidir').hidden) return falar('Escolha o que fazer com o áudio gravado, ou use Alt V para gravar outro.');
  if ((!st.micStream && st.fonte !== 'pc') || !st.destino) return falar('Nenhum microfone aberto. Volte à Etapa 1 e escolha um microfone.');
  if (st.ctx.state === 'suspended') await st.ctx.resume().catch(() => {});
  ligarFontes();
  const r = await window.api.gravacaoIniciar();
  if (!r.ok) return falar('Não consegui começar: ' + r.erro);
  st.id = r.valor; st.cadeia = Promise.resolve(); st.erro = null;
  st.ganho.gain.cancelScheduledValues(st.ctx.currentTime); st.ganho.gain.setValueAtTime(1, st.ctx.currentTime);
  const rec = new MediaRecorder(st.destino.stream, { mimeType: escolherFormato(), audioBitsPerSecond: 192000 });
  rec.ondataavailable = (ev) => {
    if (!ev.data || !ev.data.size) return;
    const blob = ev.data;
    st.cadeia = st.cadeia.then(async () => {
      if (st.erro) return;
      const x = await window.api.gravacaoPedaco({ id: st.id, dados: new Uint8Array(await blob.arrayBuffer()) });
      if (!x.ok) throw new Error(x.erro);
    }).catch((e) => { st.erro = e; });
  };
  st.gravador = rec; st.pausado = false; st.acumulado = 0; st.inicioTrecho = performance.now();
  rec.start(1000);
  bipe('gravar');
  $('ga-gravar').textContent = 'Parar e guardar, Alt R'; $('ga-pausar').disabled = false;
  $('ga-estado').textContent = 'Gravando.';
  falar('Gravando. Alt P pausa, Alt R para e guarda.');
}
function pausar() {
  if (!gravando()) return falar('Nenhuma gravação em andamento. Alt R começa a gravar.');
  if (st.pausado) {
    st.gravador.resume(); bipe('retomar'); st.pausado = false; st.inicioTrecho = performance.now();
    $('ga-pausar').textContent = 'Pausar, Alt P'; $('ga-estado').textContent = 'Gravando.';
    falar('Gravação retomada.');
  } else {
    st.gravador.pause(); bipe('pausar'); st.acumulado += performance.now() - st.inicioTrecho; st.pausado = true;
    $('ga-pausar').textContent = 'Continuar, Alt P'; $('ga-estado').textContent = 'Pausado.';
    falar('Gravação pausada. Alt P continua, Alt R para e guarda.');
  }
}
async function parar() {
  if (!gravando()) return;
  const dur = tempoGravado();
  const rec = st.gravador;
  const fim = new Promise((ok) => { rec.onstop = ok; });
  if (st.pausado) rec.resume();
  rec.stop();
  await fim;
  st.gravador = null;
  bipe('parar');
  $('ga-gravar').textContent = 'Gravar, Alt R'; $('ga-pausar').disabled = true; $('ga-pausar').textContent = 'Pausar, Alt P';
  await st.cadeia;
  if (st.erro) { await window.api.gravacaoDescartar({ id: st.id }); return falar('Não consegui guardar a gravação: ' + (st.erro.message || st.erro)); }
  falar('Parando e preparando o áudio, um instante.');
  const r = await window.api.gaudioFinalizar({ id: st.id });
  if (!r.ok) { $('ga-estado').textContent = 'Pronto para gravar.'; return falar('Não consegui preparar o áudio. ' + r.erro); }
  st.provisorio = r.valor;
  await prepararPlayer(r.valor.arquivo);
  $('ga-gravando-bloco').hidden = true; $('ga-decidir').hidden = false;
  const t = `Áudio gravado, ${falaDuracao(dur)}, nome ${r.valor.nome}. Alt P ouve a gravação antes de decidir. Salvar e fechar, Alt S. Salvar e continuar para editar, Alt A. Voltar e descartar, Alt V.`;
  $('ga-decidir-info').textContent = t;
  $('ga-decidir-titulo').focus();
  $('ga-estado').textContent = 'Gravação terminada.';
  falarDepois(t, 250);
}
let player = null;
async function prepararPlayer(arquivo) {
  if (!window.PlayerSimples) return;
  if (!player) player = window.PlayerSimples.ligar({ midia: $('ga-midia'), tocar: $('ga-tocar'), voltar: $('ga-voltar5'), avancar: $('ga-avancar5'), falar, nome: 'a gravação' });
  const r = await window.api.midiaUrl({ arquivo });
  if (r.ok) player.carregar(r.valor.url);
}
async function guardar() {
  if (window.PlayerSimples) window.PlayerSimples.pararTodos();
  if (!st.provisorio) return null;
  const r = await window.api.gaudioGuardar({ arquivo: st.provisorio.arquivo, nome: st.provisorio.nome });
  if (!r.ok) { falar('Não consegui salvar o áudio. ' + r.erro); return null; }
  bipe('concluido');
  const salvo = r.valor; st.salvo = salvo; st.provisorio = null;
  return salvo;
}
async function salvarEFechar() {
  if (st.ocupado || $('ga-decidir').hidden) return falar($('ga-decidir').hidden ? 'Grave primeiro. Alt R começa a gravar.' : 'Um instante.');
  st.ocupado = true;
  try { const s = await guardar(); if (!s) return; falar(`Áudio salvo como ${s.nome}, na pasta Olho da Cena. Fechando o programa.`); setTimeout(() => window.api.appSair(), 900); }
  finally { st.ocupado = false; }
}
async function salvarEContinuar() {
  if (st.ocupado || $('ga-decidir').hidden) return falar($('ga-decidir').hidden ? 'Grave primeiro. Alt R começa a gravar.' : 'Um instante.');
  st.ocupado = true;
  try {
    const s = await guardar(); if (!s) return;
    falar(`Áudio salvo como ${s.nome}. Abrindo o Editar áudio.`);
    if (window.gravarTela && window.gravarTela.editarAudio) await window.gravarTela.editarAudio({ original: s.arquivo, nome: s.nome, pasta: s.pasta, soAudio: true, temAudio: true, semImagem: true });
  } finally { st.ocupado = false; }
}
async function salvarEVoltar() {
  if (st.ocupado) return;
  st.ocupado = true;
  try { const s = await guardar(); if (!s) return; falar(`Áudio salvo como ${s.nome}. Voltando ao início.`); if (window.olho) window.olho.mostrarTela('inicial'); }
  finally { st.ocupado = false; }
}
async function descartarEGravarOutro() {
  if ($('ga-decidir').hidden) return;
  if (window.PlayerSimples) window.PlayerSimples.pararTodos();
  if (st.provisorio) await window.api.gaudioApagar({ arquivo: st.provisorio.arquivo });
  st.provisorio = null;
  $('ga-decidir').hidden = true; $('ga-gravando-bloco').hidden = false;
  $('ga-estado').textContent = 'Pronto para gravar.';
  $('ga-gravar').focus();
  falar('Áudio descartado. Alt R grava outro.');
}
function voltar() {
  if (gravando()) return falar('Pare a gravação com Alt R antes de voltar.');
  if (st.etapa === 2) {
    if (!$('ga-decidir').hidden) return descartarEGravarOutro();
    return irParaEtapa(1);
  }
}
function fechar() {
  if (gravando()) return falar('Pare a gravação com Alt R antes de sair.');
  if (!$('ga-decidir').hidden) return falar('Este áudio ainda não foi salvo. Use Alt S, Alt A ou Salvar e voltar ao início, ou Alt V para descartar.');
  if (window.olho) window.olho.mostrarTela('inicial');
}

// --- Entrada e saída ------------------------------------------------------------------------------------------

async function entrar() {
  st.aberto = true;
  try { const r = await window.api.configLer(); if (r && r.ok) st.config = r.valor; } catch (_) { /* segue */ }
  if (!st.preparado) preparar();
  await listarMicrofones().catch(() => {});
  st.fonte = st.config.fonteAudio || 'mic';
  const rr = document.getElementById('ga-fonte-' + st.fonte); if (rr) rr.checked = true;
  $('ga-aviso').textContent = '';
  $('ga-decidir').hidden = true; $('ga-gravando-bloco').hidden = false;
  irParaEtapa(1, { fala: false });
  falarDepois('Gravar áudio. Etapa 1 de 2: Fonte e microfone. Escolha o microfone, o que gravar e continue.', 300);
}
function sair() {
  st.aberto = false;
  if (window.PlayerSimples) window.PlayerSimples.pararTodos();
  if (gravando()) { try { st.gravador.stop(); } catch (_) { /* */ } st.gravador = null; if (st.id) window.api.gravacaoDescartar({ id: st.id }); }
  if (st.provisorio) { window.api.gaudioApagar({ arquivo: st.provisorio.arquivo }); st.provisorio = null; }
  pararFluxo(st.micStream); st.micStream = null;
  fecharSomDoPc();
  if (st.ctx) { try { st.ctx.close(); } catch (_) { /* */ } st.ctx = null; st.fonteMic = null; st.ganho = null; st.destino = null; st.retorno = null; }
}
function preparar() {
  st.preparado = true;
  const opcoes = (PU.FONTES_AUDIO || []).map((f) => ({ valor: f.valor, nome: f.nome, texto: f.texto || f.descricao || '' }));
  const g = $('ga-grupo-fonte');
  for (const o of opcoes) {
    const d = document.createElement('div'); d.className = 'radio';
    const inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'ga-fonte'; inp.value = o.valor; inp.id = `ga-fonte-${o.valor}`;
    if (o.texto) inp.setAttribute('aria-describedby', `${inp.id}-desc`);
    const lab = document.createElement('label'); lab.htmlFor = inp.id; lab.textContent = o.nome;
    d.append(inp, lab);
    if (o.texto) { const p = document.createElement('p'); p.className = 'desc'; p.id = `${inp.id}-desc`; p.textContent = o.texto; d.append(p); }
    inp.addEventListener('change', () => { if (inp.checked) aplicarFonte(o.valor); });
    g.appendChild(d);
  }
  $('ga-mic').addEventListener('change', async () => { salvarConfig({ microfone: $('ga-mic').value }); await abrirMicrofone(); });
  $('ga-retorno').addEventListener('change', () => {
    const lig = $('ga-retorno').checked;
    if (st.retorno) st.retorno.gain.setTargetAtTime(lig ? 1 : 0, st.ctx.currentTime, 0.01);
    falar(lig ? 'Retorno do microfone ligado. Use fone de ouvido.' : 'Retorno do microfone desligado.');
  });
  $('ga-e1-continuar').addEventListener('click', etapa1);
  $('ga-e1-fechar').addEventListener('click', fechar);
  $('ga-gravar').addEventListener('click', iniciar);
  $('ga-pausar').addEventListener('click', pausar);
  $('ga-e2-voltar').addEventListener('click', voltar);
  $('ga-salvar-fechar').addEventListener('click', salvarEFechar);
  $('ga-salvar-continuar').addEventListener('click', salvarEContinuar);
  $('ga-descartar').addEventListener('click', descartarEGravarOutro);
  $('ga-salvar-inicio').addEventListener('click', salvarEVoltar);
  document.addEventListener('keydown', (e) => {
    if (!st.aberto || $('tela-gaudio').hidden || document.querySelector('dialog[open]')) return;
    if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey)) return;
    const acao = e.code === 'KeyR' ? iniciar : e.code === 'KeyP' ? pausar : e.code === 'KeyS' ? salvarEFechar : null;
    if (!acao) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) acao();
  }, true);
}

window.gaudioTela = { entrar, sair, estado: st };
