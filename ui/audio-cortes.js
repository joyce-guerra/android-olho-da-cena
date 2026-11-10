/* Olho da Cena 1.3: ajustes de áudio depois da gravação, tela 1 (Cortes).
   Só vale para o vídeo que acabou de ser gravado (ou melhorado). O Editar vídeo, o Montar, o Juntar
   e o Dividir da tela inicial são outras telas e não mudam.
   Os atalhos vêm de src/atalhos-audio.js (window.AtalhosAudio), para as próximas telas de áudio usarem igual.
   Toda mensagem passa pelo mesmo falar do Alt E; cada atalho confirma com um bipe curto e a fala. */

const $ = (id) => document.getElementById(id);
const AA = window.AtalhosAudio;
const MK = window.Marcas;

const au = {
  video: null,            // { arquivo, url, duracao, temAudio, ganhoNivelar, nome, pasta }
  marcas: MK.criar(),     // seleções (Alt I / Alt F) ainda não descartadas
  cortados: [],           // descartados (Del ou Descartar trecho): saem do vídeo no Salvar e continuar
  volume: 1, velocidade: 1, salto: AA.SALTO_PADRAO,
  fila: Promise.resolve(), salvandoTrechos: 0, salvando: false, fecharPedido: false,
  ctx: null, ganho: null, laco: null, ouvirAte: null, previaCentro: 0,
  anuncios: [],
  tela: 'au-cortes',      // 1.4: tela de áudio em que a pessoa está (Cortes ou Silêncios e crossfade)
  sil: null,              // 1.4: { nivel, lista } da última procura de silêncios
  silPrevia: null,        // 1.4: { chave, url } da prévia da verificação
  camadas: [],            // 1.5: trilhas adicionadas (mesmo formato do Montar vídeo), em tempos do vídeo original
  trilhaEscolhida: null,  // 1.5: arquivo escolhido e ainda não adicionado
  eq: { graves: 0, medios: 0, agudos: 0 }, // 1.6: equalização (as do Ajuste do áudio do Editar)
  eqPrevia: null,         // 1.6: { chave, url } da prévia do Alt P
  etapas: []              // 1.7.1: [gravado, com os cortes, com cortes e silêncios]; cada tela usa o seu
};
// 1.7.1: os cortes à mão (au.cortados) e as marcas estão nos tempos do vídeo gravado; só valem no tocador dele.
const cortesDoTocador = () => (au.video && au.video === au.etapas[0] ? au.cortados : []);
/** Troca o vídeo da tela pelo da etapa (0 Cortes, 1 Silêncios, 2 Efeitos e Equalização). */
function usarEtapa(i) {
  const v = au.etapas[i];
  if (!v || au.video === v) return;
  au.video = v;
  const p = player();
  p.src = v.url;
  p.currentTime = 0;
  aplicarSom();
}
/** 1.9.1: duração dita por extenso, como "2 minutos e 55 segundos". */
function duracaoFalada(seg) {
  const t = Math.max(0, Math.round(Number(seg) || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (n, um, varios) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);
  const partes = [h && p(h, 'hora', 'horas'), m && p(m, 'minuto', 'minutos'), (s || !t) && p(s, 'segundo', 'segundos')].filter(Boolean);
  return partes.length > 1 ? partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1] : partes[0];
}
/** O aviso de duração guardado no preparo, uma vez só, junto da fala da tela seguinte. */
function tirarAvisoDuracao() { const a = au.avisoDuracao || ''; au.avisoDuracao = ''; return a; }
/** Garante que a etapa existe e está em dia com o que foi escolhido antes; aplica o que faltar. */
async function garantirEtapa(i) {
  if (i >= 1) {
    const chave = JSON.stringify(au.cortados);
    if (!au.etapas[1] || au.etapas[1].chave !== chave) {
      const base = au.etapas[0];
      au.etapas.length = 1;
      au.sil = null; au.silPrevia = null;
      au.etapas[1] = au.cortados.length ? await aplicarEtapa(base, au.cortados, false, chave) : { ...base, chave };
    }
  }
  if (i >= 2) {
    const nivel = nivelEscolhido();
    const chave = JSON.stringify([au.etapas[1].chave, nivel, comCrossfade()]);
    if (!au.etapas[2] || au.etapas[2].chave !== chave) {
      const base = au.etapas[1];
      au.etapas.length = 2;
      usarEtapa(1);
      const { descartes } = await descartesFinais();
      au.etapas[2] = descartes.length ? await aplicarEtapa(base, descartes, comCrossfade(), chave) : { ...base, chave };
      // 1.9.1: diz quanto o áudio tinha e quanto ficou, depois do corte de silêncio.
      if (nivel) {
        au.avisoDuracao = descartes.length
          ? ` Silêncios cortados${comCrossfade() ? ', com crossfade' : ''}: o áudio tinha ${duracaoFalada(base.duracao)} e ficou com ${duracaoFalada(au.etapas[2].duracao)}.`
          : ` Nenhum silêncio para cortar: o áudio continua com ${duracaoFalada(base.duracao)}.`;
      }
    }
  }
  usarEtapa(i);
}
async function aplicarEtapa(base, descartes, fade, chave) {
  F.falar('Preparando o áudio, um instante.');
  // 1.8.6: na gravação (F.continuar), só o som é cortado de verdade; a imagem é cortada uma vez, no Finalizar,
  // com os planos guardados aqui, na mesma ordem.
  const leve = !!F.continuar;
  const r = await F.chamar('audiocortesAplicar', { entrada: base.arquivo, descartes, fade, leve });
  const v = await F.chamar('audiocortesAbrir', { arquivo: r.arquivo });
  return { ...v, nome: base.nome, pasta: base.pasta, documentos: base.documentos, soAudio: base.soAudio, chave, planos: [...(base.planos || []), r.plano].filter(Boolean) };
}
const oQueSalva = () => (au.video && au.video.soAudio ? 'áudio' : 'vídeo');
/** Trava os botões, menos o que tem o foco: sem isso o foco some e o NVDA recomeça a tela do começo, falando as etapas em vez do salvamento. */
function travarBotoes() {
  const foco = document.activeElement;
  const botoes = [...$('tela-audio').querySelectorAll('button')].filter((b) => b !== foco);
  botoes.forEach((b) => { b.disabled = true; });
  return botoes;
}
/** Enquanto salva, um beep de andamento a cada 4 segundos e um aviso falado de vez em quando, para a pessoa saber que não travou. */
function avisarEnquantoSalva() {
  let n = 0;
  const t = setInterval(() => { n++; F.bipe('andamento'); if (n % 3 === 0) F.falarDepois(`Ainda salvando o ${oQueSalva()}. Já faz ${n * 4} segundos.`, 100); }, 4000);
  return () => clearInterval(t);
}
/** Vai para a tela de áudio i, aplicando antes o que as telas anteriores pediram. */
async function irParaEtapa(i) {
  if (!au.video || au.salvando) return false;
  au.salvando = true;
  const botoes = travarBotoes();
  const parar = avisarEnquantoSalva();
  try { await garantirEtapa(i); return true; } catch (e) {
    F.alertar(`Não consegui salvar o ${oQueSalva()}. ` + e.message + ' Nada foi perdido: os cortes continuam marcados.');
    return false;
  } finally { parar(); botoes.forEach((b) => { b.disabled = false; }); au.salvando = false; }
}
window.__audioCortes = au; // usado só pelos testes automáticos
window.__audioCortesAbrir = (v) => abrir(v);

let F = null; // { falar, alertar, bipe, chamar, mostrarTela, voltar, inicio }

const PARTES = ['au-cortes', 'au-silencios', 'au-trilhas', 'au-eq', 'au-descartes', 'au-previa', 'au-pronto'];
const TELAS_AUDIO = ['au-cortes', 'au-silencios', 'au-trilhas', 'au-eq'];
const parte = () => PARTES.find((p) => !$(p).hidden) || 'au-cortes';
function mostrar(id, foco) {
  F.mostrarTela(id);
  for (const p of PARTES) $(p).hidden = p !== id;
  // 3.0.2: vindo do Criar post, são três etapas (sem a equalização), e cada uma tem o botão Ir para o post.
  const total = F.noPost ? 3 : 4;
  $('au-nav-eq').hidden = !!F.noPost;
  for (const b of ['au-post-cortes', 'aus-post', 'aut-post']) $(b).hidden = !F.noPost;
  if (!F.dividir && !F.soCortes) {
    $('au-cortes-titulo').textContent = `Etapa 1 de ${total}: Cortes`;
    $('au-silencios-titulo').textContent = `Etapa 2 de ${total}: Silêncios e crossfade`;
    $('au-trilhas-titulo').textContent = `Etapa 3 de ${total}: Efeitos e trilhas`;
  }
  if (TELAS_AUDIO.includes(id)) {
    au.tela = id;
    // Links do começo: marca onde a pessoa está.
    for (const [nav, tela] of [['au-nav-cortes', 'au-cortes'], ['au-nav-silencios', 'au-silencios'], ['au-nav-trilhas', 'au-trilhas'], ['au-nav-eq', 'au-eq']]) {
      if (tela === id) $(nav).setAttribute('aria-current', 'page'); else $(nav).removeAttribute('aria-current');
    }
  }
  // 3.0.3: o foco vai para um botão, e não para o título. Com o foco num título, o NVDA fica em modo de navegação
  // e toma para si Home, End, Page Up, Page Down e as setas; num botão, essas teclas chegam à tela.
  // O nome da etapa é lido junto, porque cada etapa é uma região com o título como nome.
  const BOTAO_DA_ETAPA = { 'au-cortes': 'au-tocar', 'au-silencios': 'aus-tocar', 'au-trilhas': 'e-btn-trilha-arquivo', 'au-eq': 'aue-previa' };
  const botao = BOTAO_DA_ETAPA[id] && $(BOTAO_DA_ETAPA[id]);
  const alvo = foco || (botao && !botao.disabled && !botao.hidden ? botao : $(id).querySelector('h2'));
  if (alvo) { if (alvo.tagName === 'H2') alvo.tabIndex = -1; alvo.focus(); }
}
const player = () => $('au-player');
const T = (s) => AA.formatarTempo(s, au.video ? au.video.duracao : 0);
const ajuste = () => ({ nivelar: true, ganhoNivelar: au.video ? au.video.ganhoNivelar : 0, volume: au.volume, velocidade: au.velocidade,
  eq: { ...au.eq }, mono: $('aue-mono').checked, limitador: $('aue-limitador').checked }); // 1.6
// 1.8: Configurações > Confirmação dos atalhos: "Som e beep", "Só som" (só a fala) ou "Só beep".
const cfg = () => window.__olhoConfig || {};
function confirmar(msg) {
  const m = cfg().confirmacao;
  if (m !== 'som') F.bipe('atalho');
  if (m !== 'beep') F.falar(msg);
}
// 1.8: Configurações > O Alt S salva em.
const MODO_FALADO = { ambos: 'vídeo e áudio', video: 'vídeo', audio: 'áudio' };
const modoAltS = () => MODO_FALADO[cfg().altS] || MODO_FALADO.ambos;

// --- Som: ganho do nivelamento automático (sempre ligado) vezes o volume escolhido -------------

function prepararSom() {
  if (au.ctx) return;
  try {
    au.ctx = new AudioContext();
    const fonte = au.ctx.createMediaElementSource(player());
    au.ganho = au.ctx.createGain();
    fonte.connect(au.ganho);
    au.ganho.connect(au.ctx.destination);
  } catch (_) { au.ctx = null; }
  aplicarSom();
}
function aplicarSom() {
  const p = player();
  p.playbackRate = au.velocidade;
  p.preservesPitch = true;
  if (au.ganho && au.video) au.ganho.gain.value = AA.ganhoLinear(au.video.ganhoNivelar, au.volume);
}
// Tocando: pula o que já foi descartado; "Ouvir trecho" para no fim do trecho.
function vigiar() {
  cancelAnimationFrame(au.laco);
  const p = player();
  const passo = () => {
    if (p.paused) return;
    if (au.ouvirAte !== null) {
      if (p.currentTime >= au.ouvirAte) { p.pause(); au.ouvirAte = null; F.falar('Fim do trecho.'); return; }
    } else {
      const t = AA.pularCorte(p.currentTime, cortesDoTocador());
      if (t !== p.currentTime) { if (t >= au.video.duracao - 0.05) { p.pause(); p.currentTime = au.video.duracao; return; } p.currentTime = t; }
    }
    au.laco = requestAnimationFrame(passo);
  };
  au.laco = requestAnimationFrame(passo);
}
function tocar() {
  prepararSom();
  if (au.ctx && au.ctx.state === 'suspended') au.ctx.resume().catch(() => {});
  const p = player();
  if (p.currentTime >= au.video.duracao - 0.05) p.currentTime = 0;
  p.currentTime = AA.pularCorte(p.currentTime, cortesDoTocador());
  return p.play().then(vigiar).catch(() => F.falar('Não consegui tocar o áudio.'));
}
function pararTudo() {
  const p = player();
  if (p && !p.paused) p.pause();
  const pv = $('au-previa-player');
  if (pv && !pv.paused) pv.pause();
  const ps = $('aus-previa-player');
  if (ps && !ps.paused) ps.pause();
  const pe = $('e-previa-audio');
  if (pe && !pe.paused) pe.pause();
  const pq = $('aue-previa-player');
  if (pq && !pq.paused) pq.pause();
  au.ouvirAte = null;
}
function irPara(t) {
  const p = player();
  p.currentTime = Math.max(0, Math.min(au.video.duracao, t));
}

// --- Ações dos atalhos ---------------------------------------------------------------------------

// 1.6: início e fim em qualquer ordem. A marca que chega primeiro fica esperando a outra; quando as
// duas existem, viram uma seleção (se o fim ficou antes do início, os dois trocam de lugar sem aviso).
au.pendente = null; // { tipo: 'inicio' | 'fim', t }
function marcar(tipo) {
  const dur = au.video.duracao;
  let t = Number(player().currentTime) || 0;
  if (tipo === 'fim' && t >= dur - 0.15) t = dur;
  const n = au.marcas.trechos.length + 1;
  const nome = tipo === 'inicio' ? 'Início' : 'Fim';
  const pd = au.pendente;
  if (!pd || pd.tipo === tipo || Math.abs(pd.t - t) < 0.1) {
    au.pendente = { tipo, t };
    const troca = pd && pd.tipo === tipo ? ` Trocou o ${tipo === 'inicio' ? 'início' : 'fim'} anterior, de ${T(pd.t)}.` : '';
    return confirmar(`${nome} da seleção ${n} em ${T(t)}.${troca}`);
  }
  const trecho = { inicio: Math.min(pd.t, t), fim: Math.max(pd.t, t) };
  au.marcas.trechos.push(trecho);
  au.pendente = null;
  confirmar(`Seleção ${au.marcas.trechos.length} marcada, de ${T(trecho.inicio)} a ${T(trecho.fim)}.`);
}
const marcarInicio = () => marcar('inicio');
const marcarFim = () => marcar('fim');
function semSelecoes() {
  if (au.marcas.trechos.length) return false;
  if (au.pendente) { confirmar(au.pendente.tipo === 'inicio' ? 'Falta o fim da seleção: aperte Alt F.' : 'Falta o início da seleção: aperte Alt I.'); return true; }
  confirmar(AA.MSG.semDescartes);
  return true;
}
function descartar(trechos) {
  for (const tr of trechos) au.cortados.push({ inicio: tr.inicio, fim: tr.fim });
  au.cortados = AA.unir(au.cortados);
  const resto = AA.mantidos(au.cortados, au.video.duracao).reduce((a, m) => a + m.ate - m.de, 0);
  return ` O vídeo fica com ${T(resto)}.`;
}
function descartarTodos() {
  if (semSelecoes()) return;
  const n = au.marcas.trechos.length;
  registrar(n === 1 ? 'descarte de 1 seleção' : `descarte de ${n} seleções`);
  const resto = descartar(au.marcas.trechos);
  MK.limpar(au.marcas); // um segundo Del sem querer não descarta de novo
  confirmar((n === 1 ? '1 seleção descartada.' : `${n} seleções descartadas.`) + resto);
}
/** 1.9.2: formato do Alt S: perguntado na hora (Configurações > Perguntar a cada vez) ou o das Configurações. */
const perguntar = () => (window.olho && window.olho.perguntarFormato ? window.olho.perguntarFormato() : Promise.resolve(undefined));
const FORMATO_FALADO = { ambos: 'vídeo e áudio', video: 'vídeo', audio: 'áudio' };
function salvarTrechos(lista, modo) {
  // Cada trecho sai em vídeo (MP4) e em áudio (MP3), na mesma pasta, um depois do outro, em segundo plano.
  for (const { trecho, numero } of lista) {
    au.salvandoTrechos++;
    au.fila = au.fila.then(async () => {
      try {
        const r = await F.chamar('audiocortesSalvartrecho', { entrada: au.video.arquivo, inicio: trecho.inicio, fim: trecho.fim, numero,
          ganhoDb: AA.ganhoTotalDb(au.video.ganhoNivelar, au.volume), modo });
        const nome = (r.saidaVideo || r.saidaAudio).split(/[\\/]/).pop().replace(/\.(mp4|mp3)$/i, '');
        F.falar(`Trecho ${numero} salvo em ${FORMATO_FALADO[modo] || modoAltS()}: ${nome}.`);
      } catch (e) {
        F.alertar(`Não consegui salvar o trecho ${numero}. ${e.message}`);
      } finally { au.salvandoTrechos--; }
    });
  }
}
async function salvarTodos() {
  if (semSelecoes()) return;
  const itens = AA.itensDescartes(au.marcas.trechos, au.video.duracao);
  // 1.9.2: cortes manuais do Dividir: o Alt S abre a janela que pergunta o formato e a orientação.
  if (F.dividir) return F.dividir.aoSalvar(itens.map((it) => ({ inicio: it.trecho.inicio, fim: it.trecho.fim })));
  const modo = await perguntar();
  if (modo === null) return;
  salvarTrechos(itens.map((it, i) => ({ trecho: it.trecho, numero: i + 1 })), modo);
  const n = itens.length;
  const em = FORMATO_FALADO[modo] || modoAltS();
  confirmar((n === 1 ? `Salvando a seleção em ${em}.` : `Salvando ${n} seleções em ${em}.`) +
    ' Pode continuar trabalhando. As seleções continuam: Del descarta essas mesmas.');
}

// --- Alt D: lista dos descartes, em tela própria ------------------------------------------------

function desenharLista(focoIndice) {
  const ul = $('au-lista');
  ul.innerHTML = '';
  const itens = AA.itensDescartes(au.marcas.trechos, au.video.duracao);
  $('au-descartes-vazio').hidden = itens.length > 0;
  $('au-descartes-vazio').textContent = AA.MSG.semDescartes;
  itens.forEach((it, i) => {
    const li = document.createElement('li');
    const p = document.createElement('p');
    p.textContent = it.rotulo;
    li.appendChild(p);
    const acoes = [() => ouvirTrecho(it.trecho, i + 1), () => descartarUm(it.trecho, i), () => salvarUm(it.trecho, i + 1)];
    it.botoes.forEach((rotulo, j) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = rotulo;
      b.addEventListener('click', acoes[j]);
      li.appendChild(b);
    });
    ul.appendChild(li);
  });
  if (focoIndice !== undefined) {
    const alvo = ul.querySelectorAll('li')[Math.min(focoIndice, itens.length - 1)];
    (alvo ? alvo.querySelector('button') : $('au-descartes-voltar')).focus();
  }
  return itens;
}
function abrirLista() {
  pararTudo();
  const itens = desenharLista();
  mostrar('au-descartes');
  confirmar(itens.length ? `Descartes: ${itens.length}. ${itens[0].rotulo}.` : AA.MSG.semDescartes);
}
function ouvirTrecho(tr, n) {
  pararTudo();
  prepararSom();
  irPara(tr.inicio);
  au.ouvirAte = tr.fim;
  F.falar(`Ouvindo o trecho ${n}.`);
  player().play().then(vigiar).catch(() => F.falar('Não consegui tocar o áudio.'));
}
function descartarUm(tr, i) {
  registrar(`descarte do trecho ${i + 1}`);
  const k = au.marcas.trechos.findIndex((x) => x.inicio === tr.inicio && x.fim === tr.fim);
  if (k >= 0) au.marcas.trechos.splice(k, 1);
  const resto = descartar([tr]);
  desenharLista(i);
  F.falar(`Trecho ${i + 1} descartado.${resto}` + (au.marcas.trechos.length ? '' : ' ' + AA.MSG.semDescartes));
}
async function salvarUm(tr, n) {
  const modo = await perguntar();
  if (modo === null) return;
  salvarTrechos([{ trecho: tr, numero: n }], modo);
  F.falar(`Salvando o trecho ${n} em ${FORMATO_FALADO[modo] || modoAltS()}. Pode voltar aos ajustes de áudio.`);
}

// --- Alt G: prévia de 10 segundos, em tela própria ---------------------------------------------

async function gerarPrevia(centro) {
  const segmentos = AA.segmentosPrevia(centro, au.video === au.etapas[0] ? [...au.cortados, ...au.marcas.trechos] : [], au.video.duracao);
  if (!segmentos.length) return F.falar('Nada para ouvir: o vídeo todo está descartado.');
  au.previaCentro = centro;
  const r = await F.chamar('audiocortesPrevia', { entrada: au.video.arquivo, segmentos, ajuste: ajuste() });
  const el = $('au-previa-player');
  el.src = r.url;
  el.currentTime = 0;
  el.play().catch(() => {});
}
async function abrirPrevia() {
  pararTudo();
  mostrar('au-previa');
  confirmar(AA.MSG.previa);
  try { await gerarPrevia(Number(player().currentTime) || 0); } catch (e) { F.alertar('Não consegui preparar a prévia. ' + e.message); }
}

// --- F2: salto programado -----------------------------------------------------------------------

function abrirSalto() {
  const dlg = $('au-dlg-salto');
  const campo = $('au-salto');
  campo.value = T(au.salto);
  $('au-salto-rotulo').textContent = au.video.duracao > 3600 ? 'Salto programado (hora:minuto:segundo)' : 'Salto programado (minuto:segundo)';
  const antes = document.activeElement;
  dlg.returnValue = '';
  dlg.showModal();
  campo.focus();
  campo.select();
  dlg.onclose = () => {
    if (antes && document.contains(antes)) antes.focus();
    if (dlg.returnValue !== 'ok') return confirmar('Salto mantido.');
    const s = AA.lerTempo(campo.value, au.video.duracao);
    if (!s) return confirmar(`Tempo não entendido. O salto continua em ${T(au.salto)}.`);
    au.salto = s;
    confirmar(`Salto programado de ${T(s)}. Page Up avança, Page Down volta.`);
  };
}

// --- Teclado ------------------------------------------------------------------------------------

function executar(acao) {
  const naPrevia = parte() === 'au-previa';
  const el = naPrevia ? $('au-previa-player') : player();
  const p = player();
  switch (acao) {
    case 'inicio': return naPrevia ? false : marcarInicio();
    case 'fim': return naPrevia ? false : marcarFim();
    case 'descartarTodos': return naPrevia ? false : descartarTodos();
    case 'salvarTodos': return naPrevia ? false : (parte() === 'au-cortes' ? salvarTodos() : salvarEstado());
    case 'desfazer': return naPrevia ? false : desfazer();
    case 'listaDescartes': return naPrevia ? false : abrirLista();
    case 'previa': return naPrevia ? false : (parte() === 'au-trilhas' ? previaMistura(true) : abrirPrevia());
    case 'salto': return abrirSalto();
    case 'tocar':
      if (naPrevia) { if (el.paused) { el.play().catch(() => {}); confirmar('Tocando.'); } else { el.pause(); confirmar('Pausado.'); } return; }
      if (p.paused) { au.ouvirAte = null; tocar(); confirmar(`Tocando, em ${T(p.currentTime)}.`); } else { p.pause(); confirmar(`Pausado em ${T(p.currentTime)}.`); }
      return;
    case 'voltar1': case 'avancar1': {
      const d = acao === 'voltar1' ? -AA.PASSO_SETA : AA.PASSO_SETA;
      if (naPrevia) { el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + d)); return confirmar(d < 0 ? 'Voltou meio segundo.' : 'Avançou meio segundo.'); }
      irPara(p.currentTime + d);
      return confirmar(`${T(p.currentTime)}.`);
    }
    case 'proximoSalto': case 'saltoAnterior': {
      const d = acao === 'proximoSalto' ? au.salto : -au.salto;
      if (naPrevia) {
        const c = Math.max(0, Math.min(au.video.duracao, au.previaCentro + d));
        confirmar(`${d > 0 ? 'Avançou' : 'Voltou'} ${T(Math.abs(d))}. Prévia em ${T(c)}.`);
        return gerarPrevia(c).catch((e) => F.alertar(e.message));
      }
      irPara(p.currentTime + d);
      return confirmar(`${d > 0 ? 'Avançou' : 'Voltou'} ${T(Math.abs(d))}. ${T(p.currentTime)}.`);
    }
    case 'comeco':
      if (naPrevia) { el.currentTime = 0; return confirmar('Começo da prévia.'); }
      irPara(0); return confirmar('Começo do áudio.');
    case 'final':
      if (naPrevia) { el.currentTime = Math.max(0, (el.duration || 0) - 0.1); return confirmar('Final da prévia.'); }
      pararTudo(); irPara(au.video.duracao); return confirmar(`Final do áudio, ${T(au.video.duracao)}.`);
    case 'maisVelocidade': case 'menosVelocidade': {
      const dir = acao === 'maisVelocidade' ? 1 : -1;
      const nova = window.api.puro.ajuste.mudarVelocidade(au.velocidade, dir);
      if (nova === au.velocidade) return confirmar(`Velocidade já está em ${Math.round(nova * 100)}%, o ${dir > 0 ? 'máximo' : 'mínimo'}.`);
      au.velocidade = nova; aplicarSom();
      return confirmar(`Velocidade ${Math.round(nova * 100)}%.`);
    }
    case 'maisVolume': case 'menosVolume': {
      const dir = acao === 'maisVolume' ? 1 : -1;
      const novo = window.api.puro.ajuste.mudarVolume(au.volume, dir);
      if (novo === au.volume) return confirmar(`Volume já está em ${Math.round(novo * 100)}%, o ${dir > 0 ? 'máximo' : 'mínimo'}.`);
      au.volume = novo; aplicarSom();
      return confirmar(`Volume ${Math.round(novo * 100)}%.`);
    }
    default: return false;
  }
}

function aoTeclar(e) {
  if ($('tela-audio').hidden || !au.video) return;
  if ($('aus-dlg').open) {
    // Verificação de silêncios: Alt P toca e pausa a prévia; o Espaço no botão Ouvir prévia também
    // (é o clique do botão). Nos outros botões o Espaço continua apertando o botão.
    const a = AA.acaoDaTecla(e, null);
    if (a === 'ouvirPrevia') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) ouvirPreviaSilencios(); }
    return;
  }
  if (document.querySelector('dialog[open]') || (document.getElementById('ajuda') && !document.getElementById('ajuda').hidden)) return;
  if (e.key === 'Escape' && (parte() === 'au-descartes' || parte() === 'au-previa')) { e.preventDefault(); voltarATelaAtual(); return; }
  if (!TELAS_AUDIO.includes(parte()) && parte() !== 'au-previa') return;
  let acao = AA.acaoDaTecla(e, document.activeElement);
  // 1.6: cortar à mão só na tela Cortes; nas outras telas de áudio essas teclas não fazem nada.
  // 1.8: o Alt S vale em todas as telas de áudio (fora de Cortes, salva o trabalho como está).
  if (['inicio', 'fim', 'descartarTodos', 'listaDescartes'].includes(acao) && parte() !== 'au-cortes') return;
  // 1.6: na Equalização e ajustes, Alt P toca e pausa a prévia.
  if (acao === 'ouvirPrevia' && parte() === 'au-eq') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) previaEq(true); return; }
  if (!acao || acao === 'ouvirPrevia') return;
  e.preventDefault();
  e.stopPropagation();
  // 3.0.3: segurar Page Up ou Page Down anda de salto em salto, como as setas andam de meio em meio segundo.
  if (e.repeat && !['voltar1', 'avancar1', 'proximoSalto', 'saltoAnterior', 'maisVolume', 'menosVolume', 'maisVelocidade', 'menosVelocidade'].includes(acao)) return;
  executar(acao);
}

// --- Entrar, salvar, voltar, fechar -------------------------------------------------------------

function voltarAosCortes() {
  if (au.salvando) return;
  pararTudo();
  usarEtapa(0);
  mostrar('au-cortes', $('au-inicio'));
  F.falar('Cortes.');
}
/** Volta da lista dos descartes ou da prévia para a tela de áudio de onde a pessoa veio. */
function voltarATelaAtual() {
  if (au.tela === 'au-silencios') return abrirSilencios();
  if (au.tela === 'au-trilhas') return abrirTrilhas();
  if (au.tela === 'au-eq') return abrirEq();
  return voltarAosCortes();
}

// --- 1.4: Silêncios e crossfade ------------------------------------------------------------------

const NIVEIS = ['leve', 'equilibrado', 'agressivo'];
const nivelEscolhido = () => NIVEIS.find((n) => $('aus-' + n).checked) || null;
// 1.9.1: o crossfade vale para os três cortes, do mesmo jeito que no agressivo.
const NIVEIS_COM_CROSSFADE = ['leve', 'equilibrado', 'agressivo'];
const comCrossfade = () => NIVEIS_COM_CROSSFADE.includes(nivelEscolhido()) && $('aus-crossfade').checked;

async function abrirSilencios() {
  if (!au.video) return;
  pararTudo();
  if (!(await irParaEtapa(1))) return;
  mostrar('au-silencios');
  F.falar('Silêncios e crossfade.');
}
/** Só um corte de silêncio por vez; o crossfade vale para os três cortes (1.9.1). */
function aoMarcarNivel(ev) {
  const el = ev.target;
  if (el.checked) for (const n of NIVEIS) if ('aus-' + n !== el.id) $('aus-' + n).checked = false;
  const pode = NIVEIS_COM_CROSSFADE.includes(nivelEscolhido());
  $('aus-crossfade').disabled = !pode;
  if (!pode) $('aus-crossfade').checked = false;
}
/** Procura os silêncios do nível escolhido no vídeo gravado (detecção da 1.0.0) e guarda. */
async function procurarSilencios(nivel) {
  if (au.sil && au.sil.nivel === nivel && au.sil.arquivo === au.video.arquivo) return au.sil.lista;
  const r = await F.chamar('audiosilenciosDetectar', { entrada: au.video.arquivo, ...AA.NIVEIS_SILENCIO[nivel], respiracoes: nivel === 'agressivo', ajustarGanho: nivel !== 'leve' });
  au.sil = { nivel, arquivo: au.video.arquivo, lista: r.silencios || [] };
  return au.sil.lista;
}
/** 1.7.1: o que sai do vídeo da tela Silêncios (que já vem sem os cortes feitos à mão): os silêncios do nível. */
async function descartesFinais() {
  const nivel = nivelEscolhido();
  const sil = nivel ? AA.silenciosQueFicam(await procurarSilencios(nivel), []) : [];
  return { sil, descartes: AA.unir(sil).map((c) => ({ inicio: c.inicio, fim: c.fim })) };
}
async function verificarSilencios() {
  if (!au.video || au.salvando) return;
  const nivel = nivelEscolhido();
  if (!nivel) return F.falar('Marque um corte de silêncio antes de verificar.');
  pararTudo();
  F.falar('Procurando silêncios.');
  let sil;
  try { ({ sil } = await descartesFinais()); } catch (e) { return F.alertar('Não consegui procurar os silêncios. ' + e.message); }
  const n = sil.length;
  // 1.9.1: com a duração que o áudio deve ficar (sem contar a sobra do crossfade, que é bem pequena).
  const corta = AA.unir(sil).reduce((a, c) => a + Math.max(0, c.fim - c.inicio), 0);
  const ficara = n ? ` O áudio tem ${duracaoFalada(au.video.duracao)} e deve ficar com cerca de ${duracaoFalada(au.video.duracao - corta)}.` : '';
  $('aus-dlg-qtd').textContent = (n === 0 ? 'Nenhum silêncio encontrado.' : n === 1 ? '1 silêncio encontrado.' : `${n} silêncios encontrados.`) + ficara;
  au.silPrevia = null;
  const dlg = $('aus-dlg');
  dlg.showModal();
  $('aus-ouvir').focus();
}
/** Ouvir prévia (Alt P): 30 segundos em volta do ponto do tocador, como vão ficar (1.8.6; antes, o áudio inteiro).
 *  Apertar de novo pausa e retoma. */
async function ouvirPreviaSilencios() {
  const el = $('aus-previa-player');
  const centro = Math.round(player().currentTime || 0);
  const chave = JSON.stringify([nivelEscolhido(), comCrossfade(), au.cortados, au.volume, au.velocidade, centro]);
  if (au.silPrevia && au.silPrevia.chave === chave && el.src) {
    if (el.paused) { if (el.ended || el.currentTime >= (el.duration || 0) - 0.05) el.currentTime = 0; el.play().catch(() => {}); confirmar('Tocando.'); }
    else { el.pause(); confirmar('Pausado.'); }
    return;
  }
  if (au.silPrevia && au.silPrevia.preparando) return;
  au.silPrevia = { chave, preparando: true };
  confirmar('Preparando a prévia.');
  try {
    const { descartes } = await descartesFinais();
    const r = await F.chamar('audiosilenciosPrevia', { entrada: au.video.arquivo, descartes, fade: comCrossfade(), ajuste: ajuste(), centro });
    if (!$('aus-dlg').open) { au.silPrevia = null; return; }
    au.silPrevia = { chave, url: r.url };
    el.src = r.url;
    el.currentTime = 0;
    await el.play();
    confirmar(`Prévia de ${T(r.duracao || 0)}, a partir de ${T(r.inicio || 0)}.`);
  } catch (e) {
    au.silPrevia = null;
    F.alertar('Não consegui preparar a prévia. ' + e.message);
  }
}
function fecharVerificacao() {
  const dlg = $('aus-dlg');
  if (dlg.open) dlg.close();
}

// --- 1.5: Efeitos e trilhas ---------------------------------------------------------------------
// Cópia da parte de trilhas do Montar vídeo da 1.0.0 (ui/renderer.js, prefixo g), usando as mesmas
// funções de lá (window.__trilhasMontar). O que muda, pelo plano: o tocador próprio (Voltar 5
// segundos, Tocar ou pausar o áudio principal, Avançar 5 segundos) sai; o tempo marcado é o do
// tocador universal, que toca o vídeo original. No salvar, os tempos são traduzidos para o vídeo
// já cortado (remapTempo, o mesmo do Editar vídeo).

const TM = () => window.__trilhasMontar;

async function abrirTrilhas() {
  if (!au.video) return;
  pararTudo();
  if (!(await irParaEtapa(2))) return;
  mostrar('au-trilhas');
  F.falar('Efeitos e trilhas.' + tirarAvisoDuracao());
}
const nomeArq = (c) => String(c || '').split(/[\\/]/).pop();
function atualizarBlocoTempo() { TM().atualizarBlocoTempoTrilha('e'); }
async function escolherTrilha() {
  const r = await window.api.escolherAudio();
  if (!r) return;
  au.trilhaEscolhida = r.caminho;
  $('e-trilha-arquivo-info').textContent = r.duracao
    ? `${nomeArq(r.caminho)}, ${window.formatarTempo(r.duracao)}.`
    : nomeArq(r.caminho);
  F.falar(`Arquivo escolhido: ${nomeArq(r.caminho)}.`);
}
async function marcarPontoTrilha() {
  const t = player().currentTime;
  const texto = await window.api.escreverTempo(t);
  $('e-trilha-tempo').value = texto;
  F.falar(`Tempo da trilha marcado em ${texto}.`);
}
/** A trilha que está sendo preparada (escolhida, ainda não adicionada), como no Montar. */
async function trilhaProgramada() {
  if (!au.trilhaEscolhida) return null;
  const tempo = await TM().trilhaTempoLido('e');
  return {
    arquivo: au.trilhaEscolhida,
    tipo: TM().trilhaTipoReal('e'),
    tempo: tempo || 0,
    repetir: TM().trilhaRepete('e'),
    fadeEntrada: $('e-trilha-fade-entrada').checked,
    fadeSaida: $('e-trilha-fade-saida').checked,
    volume: parseFloat($('e-trilha-volume').value)
  };
}
/** Prévia do Montar: 3 segundos antes e 3 depois do ponto do tocador, com as trilhas adicionadas
 *  e a programada. Alt G (atalho) confirma com bipe e fala; o botão fala como no Montar. */
async function previaMistura(porAtalho) {
  if (!au.video || au.salvando) return;
  pararTudo();
  const camadas = au.camadas.slice();
  const prog = await trilhaProgramada();
  if (prog) camadas.push(prog);
  if (porAtalho) confirmar('Gerando prévia...'); else F.falar('Gerando prévia...');
  // 1.8.6: a mesma voz do Espaço: o áudio editado das telas anteriores, com o nivelamento e o volume da tela.
  const r = await window.api.previaMixagem({ audioPrincipal: au.video.arquivo, duracaoAudio: au.video.duracao, cursor: player().currentTime, camadas,
    ganhoVozDb: AA.ganhoTotalDb(au.video.ganhoNivelar, au.volume) });
  if (!r.ok) return F.falar(`Não foi possível gerar a prévia: ${r.erro}`);
  const p = $('e-previa-audio');
  p.src = r.url;
  const mensagem = `Prévia de ${r.duracaoJanela.toFixed(1)} segundos, começando em ${window.formatarTempo(r.inicio)}.`;
  try { await p.play(); F.falar(mensagem); } catch (_) { F.falar(`${mensagem} Toque o botão de novo, ou use o player, pra ouvir.`); }
}
async function adicionarTrilha() {
  if (!au.trilhaEscolhida) return F.falarDepois('Escolha um arquivo de trilha antes de adicionar.', 400);
  const tipo = TM().trilhaTipoReal('e');
  let tempo = 0, tempoTexto = '', repetir = false;
  if (tipo === 'estatico') {
    const segundos = await TM().trilhaTempoLido('e');
    if (segundos === null) return F.falar('Não entendi o tempo de início da trilha. Use hora, minuto e segundo, como 00:03:20.');
    tempo = segundos;
    tempoTexto = await window.api.escreverTempo(segundos);
    repetir = TM().trilhaRepete('e');
  }
  const volume = parseFloat($('e-trilha-volume').value);
  const arquivo = au.trilhaEscolhida;
  const nome = nomeArq(arquivo);
  const nova = { arquivo, nome, tipo, tempo, tempoTexto, repetir, volume,
    fadeEntrada: $('e-trilha-fade-entrada').checked, fadeSaida: $('e-trilha-fade-saida').checked };
  const antes = foto();
  const adicionou = TM().finalizarAdicaoTrilha('e', au.camadas, nova);
  if (adicionou) au.historico.push({ acao: `trilha adicionada: ${nome}`, estado: antes });
  if (adicionou) {
    TM().desenharTrilhas('e', au.camadas);
    // 1.9.1: a confirmação sai um instante depois do Enter, quando o NVDA já falou o botão;
    // na hora do Enter, ele lia o botão e a frase se perdia.
    F.falarDepois(tipo === 'loop'
      ? `Trilha em loop adicionada: ${nome}. Total: ${au.camadas.length}.`
      : repetir
        ? `Trilha adicionada: ${nome}, começando em ${tempoTexto} e repetindo até o fim do vídeo. Total: ${au.camadas.length}.`
        : `Trilha estática adicionada: ${nome}, ${TM().trilhaQuando('e', tempoTexto)}, tocando uma vez só. Total: ${au.camadas.length}.`, 400);
  }
  au.trilhaEscolhida = null;
  $('e-trilha-arquivo-info').textContent = 'Nenhum arquivo escolhido.';
  $('e-trilha-tempo').value = '00:00:00';
  $('e-trilha-fade-entrada').checked = true;
  $('e-trilha-fade-saida').checked = true;
  TM().atualizarBlocoFadeTrilha('e');
}
function limparTrilhas() {
  au.camadas = []; au.trilhaEscolhida = null;
  $('e-trilha-arquivo-info').textContent = 'Nenhum arquivo escolhido.';
  $('e-trilha-tempo').value = '00:00:00';
  $('e-trilha-tipo-loop').checked = true; $('e-trilha-inicio-comeco').checked = true;
  $('e-trilha-fade-entrada').checked = true; $('e-trilha-fade-saida').checked = true;
  $('e-trilha-conflito').hidden = true;
  atualizarBlocoTempo();
  TM().desenharTrilhas('e', au.camadas);
}

// --- 1.6: Equalização e ajustes ----------------------------------------------------------------
// Predefinições e bandas: as do Ajuste do áudio do Editar vídeo (src/ajuste.js, do Voz da Cena 1.2.1),
// com a mesma fala. Viram botões, um por linha (o plano tira a "Personalizada": as bandas ficam no fim).

const AJU = () => window.api.puro.ajuste;
const BANDAS = { 'aue-graves': 'graves', 'aue-medios': 'medios', 'aue-agudos': 'agudos' };

async function abrirEq() {
  if (!au.video) return;
  pararTudo();
  if (!(await irParaEtapa(2))) return;
  mostrar('au-eq');
  F.falar('Equalização e ajustes.' + tirarAvisoDuracao());
}
function mostrarEq() {
  const nome = AJU().nomeDoEq(au.eq);
  for (const b of $('aue-predefinicoes').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.textContent === nome));
  for (const [id, k] of Object.entries(BANDAS)) {
    $(id).value = String(au.eq[k]);
    $(id).setAttribute('aria-valuetext', AJU().decibeisFalados(au.eq[k]));
  }
}
function escolherPredefinicao(p) {
  au.eq = { ...p.eq };
  mostrarEq();
  F.falar(`${p.nome}: graves ${AJU().decibeisFalados(p.eq.graves)}, médios ${AJU().decibeisFalados(p.eq.medios)}, agudos ${AJU().decibeisFalados(p.eq.agudos)}.`);
}
/** Alt P (e o botão Ouvir prévia): 6 segundos a partir do ponto do tocador, com tudo o que a tela
 *  escolheu, como o Ouvir o ajuste do Editar. Apertar de novo pausa e retoma. */
async function previaEq(porAtalho) {
  if (!au.video || au.salvando) return;
  const diz = (m) => (porAtalho ? confirmar(m) : F.falar(m));
  const el = $('aue-previa-player');
  const inicio = Number(player().currentTime) || 0;
  const chave = JSON.stringify([ajuste(), Math.round(inicio * 10)]);
  if (au.eqPrevia && au.eqPrevia.chave === chave && el.src) {
    if (el.paused) { if (el.ended) el.currentTime = 0; el.play().catch(() => {}); diz('Tocando.'); }
    else { el.pause(); diz('Pausado.'); }
    return;
  }
  if (au.eqPrevia && au.eqPrevia.preparando) return;
  pararTudo();
  au.eqPrevia = { chave, preparando: true };
  diz('Preparando a prévia.');
  try {
    const r = await F.chamar('audioeqPrevia', { entrada: au.video.arquivo, inicio, ajuste: ajuste() });
    if (parte() !== 'au-eq') { au.eqPrevia = null; return; }
    au.eqPrevia = { chave, url: r.url };
    el.src = r.url;
    el.currentTime = 0;
    await el.play();
  } catch (e) {
    au.eqPrevia = null;
    F.alertar('Não consegui preparar a prévia. ' + e.message);
  }
}
const eqMudou = () => !AJU().eqNeutro(au.eq) || $('aue-mono').checked || !$('aue-limitador').checked;
function limparEq() {
  au.eq = { graves: 0, medios: 0, agudos: 0 }; au.eqPrevia = null;
  $('aue-estereo').checked = true; $('aue-limitador').checked = true;
  mostrarEq();
}
/** 1.6: Salvar e continuar de Efeitos e trilhas leva para Equalização e ajustes, sem salvar ainda. */
function trilhasContinuar() {
  if (!au.video || au.salvando) return;
  if (F.noPost) return salvarEContinuar(); // 3.0.2: no post não há equalização: o plano segue para a finalização
  abrirEq();
}
/** 3.0.2: Ir para o post. Sem nenhuma edição, vai direto; com edição, aplica o que foi escolhido e segue. */
async function irParaPost() {
  if (!au.video || au.salvando) return;
  const nada = !au.cortados.length && !au.marcas.trechos.length && !au.camadas.length && !nivelEscolhido() && au.volume === 1 && au.velocidade === 1;
  if (nada) { pararTudo(); return F.continuar(null); }
  return salvarEContinuar();
}

async function abrir(video) {
  pararTudo();
  au.video = null;
  au.sil = null; au.silPrevia = null;
  for (const n of NIVEIS) $('aus-' + n).checked = false;
  $('aus-crossfade').checked = false; $('aus-crossfade').disabled = true;
  limparTrilhas();
  limparEq();
  au.etapas = [];
  au.historico = []; au.silAplicado = { nivel: null, crossfade: false };
  au.marcas = MK.criar(); au.pendente = null; au.cortados = []; au.volume = 1; au.velocidade = 1; au.salto = AA.SALTO_PADRAO; au.fecharPedido = false;
  // 1.9.2: nos cortes manuais do Dividir, só a tela de Cortes (sem as outras etapas de áudio).
  // 1.9.3: no Editar vídeo, só os Cortes: silêncios, trilhas e equalização ficam no Editar áudio.
  $('au-telas').hidden = !!(F.dividir || F.soCortes);
  $('au-cortes-titulo').textContent = F.dividir ? 'Cortes manuais' : F.soCortes ? 'Cortes' : 'Etapa 1 de 4: Cortes';
  mostrar('au-cortes');
  $('au-info').textContent = '';
  F.falar('Preparando o áudio, um instante.');
  try {
    const v = await F.chamar('audiocortesAbrir', { arquivo: video.arquivo });
    au.video = { ...v, nome: video.nome || v.arquivo.split(/[\\/]/).pop(), pasta: video.pasta, documentos: video.documentos, soAudio: !!video.soAudio };
    au.etapas = [au.video];
  } catch (e) {
    F.alertar('Não consegui abrir o áudio do vídeo. ' + e.message);
    return;
  }
  const p = player();
  p.src = au.video.url;
  p.currentTime = 0;
  aplicarSom();
  const info = `${au.video.soAudio ? 'Áudio' : 'Vídeo'} ${au.video.nome.replace(/\.[^.]+$/, '')}, ${T(au.video.duracao)}. Volume nivelado para a internet.`;
  $('au-info').textContent = info;
  F.falar(`Ajustes de áudio, Cortes. ${info} Espaço toca e pausa. Alt H lista os atalhos.`);
}

/** 1.5: Salvar e continuar de Silêncios e crossfade (e do pop-up) leva para Efeitos e trilhas. */
function silenciosContinuar() {
  if (!au.video || au.salvando) return;
  // 1.8: Alt Z: guarda a escolha anterior de silêncio quando ela muda.
  const agora = { nivel: nivelEscolhido(), crossfade: comCrossfade() };
  if (agora.nivel !== au.silAplicado.nivel || agora.crossfade !== au.silAplicado.crossfade) {
    const acao = agora.nivel ? `remoção de silêncio ${ADJ[agora.nivel]}${agora.crossfade ? ' com crossfade' : ''}` : 'retirada da remoção de silêncio';
    registrar(acao, { nivel: au.silAplicado.nivel, crossfade: au.silAplicado.crossfade });
    au.silAplicado = agora;
  }
  fecharVerificacao();
  abrirTrilhas();
}

/** 1.4: Salvar e continuar dos Cortes leva para Silêncios e crossfade; o vídeo é salvo uma vez só, no fim do áudio. */
function cortesContinuar() {
  if (!au.video) return F.falar('Aguarde, estou preparando o áudio.'); // 1.9
  if (au.salvando) return;
  if (F.dividir) return salvarTodos(); // 1.9.2: nos cortes manuais, Salvar e continuar salva os cortes
  if (F.soCortes) { // 1.9.3: Editar vídeo: dos Cortes direto para o vídeo, sem as outras etapas de áudio
    if (au.pendente) { const falta = au.pendente.tipo === 'inicio' ? 'Falta o fim da seleção: aperte Alt F.' : 'Falta o início da seleção: aperte Alt I.'; au.pendente = null; return confirmar(`${falta} Ou aperte Salvar e continuar de novo para seguir sem ela.`); }
    return salvarEContinuar();
  }
  // 1.6: com só o início ou só o fim marcado, avisa uma vez e descarta essa marca solta; apertando de novo, segue.
  if (au.pendente) {
    const falta = au.pendente.tipo === 'inicio' ? 'Falta o fim da seleção: aperte Alt F.' : 'Falta o início da seleção: aperte Alt I.';
    au.pendente = null;
    return confirmar(`${falta} Ou aperte Salvar e continuar de novo para seguir sem ela.`);
  }
  abrirSilencios();
}

async function salvarEContinuar() {
  if (!au.video || au.salvando) return;
  fecharVerificacao();
  pararTudo();
  au.salvando = true;
  const botoes = travarBotoes();
  const pendentes = au.marcas.trechos.length;
  F.falar(`Salvando o ${oQueSalva()}. Aguarde.` + (pendentes ? ` ${pendentes === 1 ? 'Uma seleção não descartada fica' : pendentes + ' seleções não descartadas ficam'} no ${oQueSalva()}.` : ''));
  const pararAviso = avisarEnquantoSalva();
  try {
    await au.fila; // trechos que ainda estão sendo salvos terminam antes
    // 1.7.1: cortes, silêncios e crossfade já estão no vídeo da etapa 2; aqui entram trilhas e equalização.
    await garantirEtapa(2);
    const leve = !!F.continuar;
    const r = await F.chamar('audiocortesSalvar', { entrada: au.video.arquivo, original: au.etapas[0].arquivo, descartes: [], ajuste: ajuste(), fade: false, camadas: au.camadas, leve, pico: au.video.pico });
    au.salvo = r;
    const pastaDita = r.pasta ? `, na pasta ${String(r.pasta).split(/[\\/]/).filter(Boolean).pop()}` : '';
    const info = `${r.soAudio ? 'Áudio salvo, em MP3,' : 'Vídeo salvo'} com o nome ${r.nome.replace(/\.(mp4|mp3)$/i, '')}${pastaDita}, ${T(r.duracao || 0)}.`;
    $('au-pronto-titulo').textContent = r.soAudio ? 'Áudio salvo' : 'Vídeo salvo';
    $('au-pronto-info').textContent = info;
    botoes.forEach((b) => { b.disabled = false; });
    // 1.3.1: a imagem (fundo, título e logo) é a última etapa e faz o salvamento final.
    if (F.continuar) { pararTudo(); F.falar(`Áudio salvo. ${T(r.duracao || 0)}.`); return F.continuar({ ...r, duracao: r.duracao || au.video.duracao, original: au.etapas[0].arquivo, planos: [...(au.etapas[2].planos || []), r.plano].filter(Boolean) }); }
    mostrar('au-pronto', $('au-pronto-pasta'));
    F.falar(info);
  } catch (e) {
    botoes.forEach((b) => { b.disabled = false; });
    F.alertar(`Não consegui salvar o ${oQueSalva()}. ` + e.message + ' Nada foi perdido: os cortes continuam marcados.');
  } finally { pararAviso(); au.salvando = false; }
}

function fechar() {
  if (au.salvando) return F.falar(`Aguarde, ainda estou salvando o ${oQueSalva()}.`);
  if (au.salvandoTrechos) return F.falar('Aguarde, ainda estou salvando os trechos.');
  if ((au.cortados.length || nivelEscolhido() || au.camadas.length || eqMudou()) && !au.fecharPedido && TELAS_AUDIO.includes(parte())) {
    au.fecharPedido = true;
    return F.falar('Os ajustes de áudio ainda não foram salvos. Aperte Fechar de novo para fechar sem salvar, ou use Salvar e continuar.');
  }
  pararTudo();
  F.chamar('appSair').catch(() => {});
}

// --- 1.8: Alt Z (voltar para a última versão salva) e Alt S fora de Cortes -----------------------

au.historico = [];                              // [{ acao, estado }]: o que dá para desfazer, do mais antigo ao mais novo
au.silAplicado = { nivel: null, crossfade: false }; // a escolha de silêncio que já foi salva (Salvar e continuar)
const ADJ = { leve: 'leve', equilibrado: 'equilibrada', agressivo: 'agressiva' };
function foto() {
  return { cortados: au.cortados.map((c) => ({ ...c })), trechos: au.marcas.trechos.map((t) => ({ ...t })),
    nivel: au.silAplicado.nivel, crossfade: au.silAplicado.crossfade, camadas: au.camadas.map((c) => ({ ...c })) };
}
function registrar(acao, sil) {
  const estado = foto();
  if (sil) Object.assign(estado, sil);
  au.historico.push({ acao, estado });
}
async function restaurar(e) {
  au.cortados = e.cortados; au.marcas.trechos = e.trechos; au.pendente = null;
  for (const n of NIVEIS) $('aus-' + n).checked = n === e.nivel;
  $('aus-crossfade').disabled = !NIVEIS_COM_CROSSFADE.includes(e.nivel);
  $('aus-crossfade').checked = !!e.crossfade && NIVEIS_COM_CROSSFADE.includes(e.nivel);
  au.silAplicado = { nivel: e.nivel, crossfade: !!e.crossfade };
  au.camadas = e.camadas;
  TM().desenharTrilhas('e', au.camadas);
  const i = { 'au-cortes': 0, 'au-silencios': 1 }[au.tela];
  return irParaEtapa(i === undefined ? 2 : i);
}
function desfazer() {
  if (au.salvando) return F.falar(`Aguarde, ainda estou salvando o ${oQueSalva()}.`);
  const u = au.historico[au.historico.length - 1];
  if (!u) return confirmar('Nada para desfazer.');
  pararTudo();
  if (cfg().confirmacao !== 'som') F.bipe('atalho');
  const dlg = $('au-dlg-desfazer');
  $('au-desfazer-texto').textContent = `Voltar para antes de: ${u.acao}?`;
  const antes = document.activeElement;
  dlg.returnValue = '';
  dlg.showModal();
  $('au-desfazer-sim').focus();
  dlg.onclose = async () => {
    if (antes && document.contains(antes)) antes.focus();
    if (dlg.returnValue !== 'sim') return confirmar('Nada foi desfeito.');
    au.historico.pop();
    if (await restaurar(u.estado)) confirmar(`Voltou para antes de: ${u.acao}.`);
  };
}
const NOME_TELA = { 'au-silencios': 'Silêncios e crossfade', 'au-trilhas': 'Efeitos e trilhas', 'au-eq': 'Equalização e ajustes' };
async function salvarEstado() {
  if (!au.video || au.salvando) return;
  const tela = au.tela;
  pararTudo();
  const modo = await perguntar();
  if (modo === null) return;
  confirmar(`Salvando como está agora, em ${FORMATO_FALADO[modo] || modoAltS()}.`);
  if (!(await irParaEtapa(2))) return;
  au.salvando = true;
  try {
    const r = await F.chamar('audioSalvarestado', { entrada: au.etapas[2].arquivo, original: au.etapas[0].arquivo, ajuste: ajuste(), modo,
      camadas: au.camadas, tela: NOME_TELA[tela] || 'salvo', ...(F.continuar ? { planos: au.etapas[2].planos || [] } : {}) });
    F.falar(`Salvo: ${r.nome}.`);
  } catch (e) {
    F.alertar('Não consegui salvar. ' + e.message);
  } finally { au.salvando = false; if (tela === 'au-silencios') usarEtapa(1); }
}

export function ocupado() {
  if (au.salvando) return `Aguarde, ainda estou salvando o ${oQueSalva()}.`;
  return null;
}

export function iniciarAudioCortes(funcoes) {
  F = funcoes;
  $('au-inicio').addEventListener('click', marcarInicio);
  $('au-fim').addEventListener('click', marcarFim);
  $('au-descartar').addEventListener('click', descartarTodos);
  $('au-salvar-sel').addEventListener('click', salvarTodos);
  // 1.3.2: botões do tocador, os mesmos atalhos universais.
  for (const [id, acao] of [['au-tocar', 'tocar'], ['au-voltar1', 'voltar1'], ['au-avancar1', 'avancar1'], ['au-comeco', 'comeco'], ['au-final', 'final']]) {
    $(id).addEventListener('click', () => { if (au.video && !au.salvando) executar(acao); });
  }
  $('au-continuar').addEventListener('click', cortesContinuar);
  // 1.4: Silêncios e crossfade, com os mesmos botões do tocador e das seleções no final.
  for (const [id, acao] of [['aus-tocar', 'tocar'], ['aus-voltar1', 'voltar1'], ['aus-avancar1', 'avancar1'], ['aus-comeco', 'comeco'], ['aus-final', 'final']]) {
    $(id).addEventListener('click', () => { if (au.video && !au.salvando) executar(acao); });
  }
  for (const n of NIVEIS) $('aus-' + n).addEventListener('change', aoMarcarNivel);
  $('aus-verificar').addEventListener('click', verificarSilencios);
  $('aus-continuar').addEventListener('click', silenciosContinuar);
  $('aus-voltar').addEventListener('click', () => { if (au.salvando) return F.falar(`Aguarde, ainda estou salvando o ${oQueSalva()}.`); voltarAosCortes(); });
  $('aus-fechar').addEventListener('click', fechar);
  $('au-nav-silencios').addEventListener('click', () => { if (!au.salvando) abrirSilencios(); });
  $('aus-ouvir').addEventListener('click', ouvirPreviaSilencios);
  $('aus-tentar').addEventListener('click', fecharVerificacao);
  $('aus-dlg-continuar').addEventListener('click', silenciosContinuar);
  // 1.5: Efeitos e trilhas.
  for (const [id, acao] of [['aut-tocar', 'tocar'], ['aut-voltar1', 'voltar1'], ['aut-avancar1', 'avancar1'], ['aut-comeco', 'comeco'], ['aut-final', 'final']]) {
    $(id).addEventListener('click', () => { if (au.video && !au.salvando) executar(acao); });
  }
  $('aut-continuar').addEventListener('click', trilhasContinuar);
  for (const b of ['au-post-cortes', 'aus-post', 'aut-post']) $(b).addEventListener('click', irParaPost);
  $('aut-voltar').addEventListener('click', () => { if (au.salvando) return F.falar(`Aguarde, ainda estou salvando o ${oQueSalva()}.`); abrirSilencios(); });
  $('aut-fechar').addEventListener('click', fechar);
  $('au-nav-trilhas').addEventListener('click', () => { if (!au.salvando) abrirTrilhas(); });
  // 1.6: Equalização e ajustes.
  for (const p of AJU().PREDEFINICOES_EQ) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.nome;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => { if (!au.salvando) escolherPredefinicao(p); });
    $('aue-predefinicoes').appendChild(b);
  }
  let esperaBanda = null;
  for (const [id, k] of Object.entries(BANDAS)) {
    $(id).addEventListener('input', (e) => {
      au.eq = AJU().normalizarEq({ ...au.eq, [k]: Number(e.target.value) });
      mostrarEq();
      // O controle deslizante já fala o próprio valor; o nome da equalização vem depois de uma pausa.
      clearTimeout(esperaBanda);
      esperaBanda = setTimeout(() => F.falar(`Equalização ${AJU().nomeDoEq(au.eq)}.`), 900);
    });
  }
  $('aue-previa').addEventListener('click', () => previaEq(false));
  $('aue-previa-player').addEventListener('ended', () => F.falar('Fim da prévia.'));
  for (const [id, acao] of [['aue-tocar', 'tocar'], ['aue-voltar1', 'voltar1'], ['aue-avancar1', 'avancar1'], ['aue-comeco', 'comeco'], ['aue-final', 'final']]) {
    $(id).addEventListener('click', () => { if (au.video && !au.salvando) executar(acao); });
  }
  $('aue-continuar').addEventListener('click', salvarEContinuar);
  $('aue-voltar').addEventListener('click', () => { if (au.salvando) return F.falar(`Aguarde, ainda estou salvando o ${oQueSalva()}.`); abrirTrilhas(); });
  $('aue-fechar').addEventListener('click', fechar);
  $('au-nav-eq').addEventListener('click', () => { if (!au.salvando) abrirEq(); });
  mostrarEq();
  $('e-btn-trilha-arquivo').addEventListener('click', escolherTrilha);
  $('e-trilha-marcar').addEventListener('click', () => { if (au.video) marcarPontoTrilha(); });
  // 2.0.3: o player ao alcance de quem está marcando o tempo, dentro do próprio bloco.
  for (const [id, acao] of [['e-t-tocar', 'tocar'], ['e-t-voltar1', 'voltar1'], ['e-t-avancar1', 'avancar1']]) {
    $(id).addEventListener('click', () => { if (au.video && !au.salvando) executar(acao); });
  }
  $('e-trilha-previa').addEventListener('click', () => previaMistura(false));
  $('e-btn-add-trilha').addEventListener('click', adicionarTrilha);
  $('e-trilha-conflito-encerrar').addEventListener('click', () => TM().resolverConflitoTrilha('e', au.camadas, true));
  $('e-trilha-conflito-sobrepor').addEventListener('click', () => TM().resolverConflitoTrilha('e', au.camadas, false));
  $('e-trilha-tempo').addEventListener('blur', async () => {
    const seg = await window.api.lerTempo($('e-trilha-tempo').value);
    if (seg !== null) $('e-trilha-tempo').value = await window.api.escreverTempo(seg);
  });
  TM().volumes().forEach((v, i) => {
    const o = document.createElement('option');
    o.value = String(v.valor);
    o.textContent = v.nome;
    if (i === 1) o.selected = true;
    $('e-trilha-volume').appendChild(o);
  });
  $('aus-dlg').addEventListener('close', () => {
    pararTudo();
    if (!au.salvando && parte() === 'au-silencios') { const n = nivelEscolhido(); ($(n ? 'aus-' + n : 'aus-verificar')).focus(); }
  });
  $('aus-previa-player').addEventListener('ended', () => F.falar('Fim da prévia.'));
  $('au-voltar').addEventListener('click', () => { if (au.salvando) return F.falar(`Aguarde, ainda estou salvando o ${oQueSalva()}.`); pararTudo(); F.voltar(); });
  $('au-fechar').addEventListener('click', fechar);
  $('au-nav-cortes').addEventListener('click', voltarAosCortes);
  $('au-descartes-voltar').addEventListener('click', voltarATelaAtual);
  $('au-previa-voltar').addEventListener('click', voltarATelaAtual);
  $('au-pronto-pasta').addEventListener('click', () => F.chamar('pastaAbrir', au.video && au.video.pasta).catch((e) => F.alertar(e.message)));
  $('au-pronto-inicio').addEventListener('click', () => F.inicio());
  $('au-pronto-fechar').addEventListener('click', () => F.chamar('appSair').catch(() => {}));
  $('au-previa-player').addEventListener('ended', () => F.falar('Fim da prévia.'));
  $('au-desfazer-sim').addEventListener('click', () => $('au-dlg-desfazer').close('sim'));
  $('au-desfazer-nao').addEventListener('click', () => $('au-dlg-desfazer').close('nao'));
  document.addEventListener('keydown', aoTeclar, true);
}

export const abrirAudioCortes = abrir;
export const sairAudioCortes = pararTudo;
export { voltarAosCortes, abrirEq as abrirEqualizacao, salvarEstado as salvarAudioComoEsta };
