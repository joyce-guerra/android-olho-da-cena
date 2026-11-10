/* Olho da Cena 2.0.7: tela Tirar fotos.
   Etapa 1: proporção. Etapa 2: câmera, prévia, contagem e a foto (Alt R), Alt E fala o enquadramento.
   Etapa 3: fundo (sem mudar, borrado, fundo pronto ou fundo com moldura). Etapa 4: escrito, figurinha e salvar (Alt S).
   Alt Q descreve com o descritor de imagens o que está na tela (a câmera ao vivo ou a foto pronta).
   Módulo à parte: os nomes daqui não se misturam com os do renderer.js nem do gravar.js. */

const $ = (id) => document.getElementById(id);
const PU = window.api.puro;
const FT = window.Fotos;

const st = {
  aberto: false, etapa: 1, config: {}, stream: null, desenho: null, worker: null, tarefa: 1, pendentes: new Map(),
  prop: '', efeito: 'original', fundo: '', moldura: '', localTexto: 'embaixo', figurinha: '', localFigurinha: 'inf-dir',
  seguir: { cx: 0.5, alvo: null, ultimo: 0, ocupado: false },
  tipoEscrito: 'legenda', revisando: false, foto: null, mascara: null, rosto: null, cores: null, falaCores: '', avisoFoto: '', contraste: '', escrever: false, cx: 0.5, tirando: false, salvando: false, analisando: false, fundoCache: new Map(), anuncios: []
};
window.__foto = st; // usado só pelos testes automáticos
st.salvarFoto = () => salvarFoto();

// --- Fala ------------------------------------------------------------------------------------------

let alterna = false;
function falar(msg) {
  alterna = !alterna;
  $('status').textContent = msg ? msg + (alterna ? ' ' : '') : '';
  if (msg) st.anuncios.push(msg);
}
let adiada = null;
function falarDepois(msg, ms = 250) { clearTimeout(adiada); adiada = setTimeout(() => falar(msg), ms); }
const bipe = (t) => { try { if (window.gravarTela && window.gravarTela.bipe) window.gravarTela.bipe(t); } catch (_) { /* sem som, segue */ } };
const salvarConfig = (c) => window.api.configSalvar(c).then((r) => { if (r && r.ok) st.config = r.valor; }).catch(() => {});

// --- Grupos de opções (radios com Indicação, Contraindicação e Descrição) ---------------------------------

function criarRadio(o, nome, escolhido, aoMudar) {
  {
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
}
function montarGrupo(idGrupo, nome, opcoes, escolhido, aoMudar) {
  const g = $(idGrupo);
  g.querySelectorAll('.radio, details').forEach((d) => d.remove());
  for (const o of opcoes) g.appendChild(criarRadio(o, nome, escolhido, aoMudar));
}
/** Opções em seções que abrem e fecham (cada seção é um details; os radios continuam um grupo só). A seção do escolhido já vem aberta. */
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
const valorDe = (nome) => { const r = document.querySelector(`input[name="${nome}"]:checked`); return r ? r.value : ''; };

// --- Etapas ---------------------------------------------------------------------------------------------

const NOMES = ['', 'Proporção da foto', 'Câmera e foto', 'Fundo e moldura', 'Escrito e figurinha'];
function irParaEtapa(n, { fala = true, revisao = false } = {}) {
  st.etapa = n;
  for (let i = 1; i <= 4; i++) $('ft-e' + i).hidden = i !== n;
  $('ft-previa').hidden = n !== 2;
  if (n === 2 && !revisao) { st.revisando = false; $('ft-captura-bloco').hidden = false; $('ft-revisao').hidden = true; abrirCamera(); } else if (n !== 2 || !revisao) pararCamera();
  if (n === 3) desenharResultado();
  if (n === 4) (st.escrever ? localDoTexto().catch(() => {}) : Promise.resolve()).then(() => desenharFinal()).then(() => { if (fala && st.etapa === 4) falarDepois(`Etapa 4 de 4: ${NOMES[4]}. ${resumoDaFoto()}`, 100); });
  if (n === 3) montarVisual();
  window.scrollTo(0, 0);
  const t = $(`ft-e${n}-titulo`);
  t.focus();
  if (fala && n !== 4) falarDepois(`Etapa ${n} de 4: ${NOMES[n]}.`);
  if (window.olho && window.olho.aoMudarEtapaFoto) window.olho.aoMudarEtapaFoto(n);
}

function proporcao() { return FT.acharProporcao(st.prop); }
/** A capa começa com Título (letras grandes); as outras proporções, com Legenda. */
function tipoPadrao() {
  const p = proporcao() || {};
  st.tipoEscrito = p.valor === 'capa-ebook' ? 'capa' : p.grande ? 'titulo' : 'legenda';
  const r = document.getElementById('ft-tipo-escrito-' + st.tipoEscrito); if (r) r.checked = true;
  ajustarTiposDeEscrito();
}
/** O tipo Capa só existe no formato Capa de ebook; nele aparecem os dois campos, o título e o nome. */
function ajustarTiposDeEscrito() {
  for (const t of FT.TIPOS_ESCRITO) {
    const r = document.getElementById('ft-tipo-escrito-' + t.valor);
    if (r && r.parentElement && t.soEm) r.parentElement.hidden = t.soEm !== st.prop;
  }
  if (st.tipoEscrito === 'capa' && st.prop !== 'capa-ebook') st.tipoEscrito = 'legenda';
  const capa = st.tipoEscrito === 'capa';
  $('ft-bloco-autor').hidden = !capa;
  $('ft-rotulo-texto').textContent = capa ? 'Título da capa' : 'Escrito na foto';
}

function continuar() {
  if (st.etapa === 2 && st.revisando) {
    st.revisando = false;
    irParaEtapa(3, { fala: false });
    falarDepois(`Etapa 3 de 4: Fundo e moldura. ${st.falaCores} ${st.avisoFoto} Escolha entre sem mudar, borrar, fundo completo, que é um cenário natural, ou moldura, que é um enquadramento com enfeites. Escrito e figurinha valem para todos. ${FT.avisoMolduras(st.prop)}`.replace(/\s+/g, ' ').trim(), 300);
    return;
  }
  if (st.etapa === 1) {
    if (!proporcao()) { falar('Antes de continuar, escolha a proporção da foto.'); const r = document.querySelector('input[name="ft-prop"]'); if (r) r.focus(); return; }
    return irParaEtapa(2);
  }
  if (st.etapa === 3) {
    return irParaEtapa(4);
  }
}
function voltar() {
  if (st.etapa === 2 && st.capaModo && !st.revisando) return terminarCapa(null);
  if (st.etapa === 2) { if (st.revisando) { st.revisando = false; st.foto = null; st.mascara = null; } return irParaEtapa(1); }
  if (st.etapa === 3) { irParaEtapa(2, { fala: false, revisao: true }); entrarRevisao('Voltei para a foto tirada.'); return; }
  if (st.etapa === 4) return irParaEtapa(3);
}
function focarGrupo(nome) {
  const r = document.querySelector(`input[name="${nome}"]:checked`) || document.querySelector(`input[name="${nome}"]`);
  if (r) { const d = r.closest('details'); if (d) d.open = true; r.focus(); }
}
function fechar() {
  if (st.capaModo) return terminarCapa(null);
  if (window.olho) window.olho.mostrarTela('inicial');
}
/** Modo capa: o Criar post pede uma foto, na proporção dele, que vai direto para a pasta do post. */
function pedirCapa(cfg) { st.capaModo = cfg; }
function terminarCapa(info) {
  const cfg = st.capaModo; st.capaModo = null;
  if (cfg && cfg.aoTerminar) cfg.aoTerminar(info);
}

// --- Câmera e prévia ---------------------------------------------------------------------------------

function video() {
  let v = $('ft-video');
  if (!v) { v = document.createElement('video'); v.id = 'ft-video'; v.muted = true; v.playsInline = true; v.hidden = true; document.body.appendChild(v); }
  return v;
}
function pararCamera() {
  if (st.desenho) { clearInterval(st.desenho); st.desenho = null; }
  if (st.stream) { st.stream.getTracks().forEach((t) => t.stop()); st.stream = null; }
}
async function listarCameras() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  const cams = devs.filter((d) => d.kind === 'videoinput');
  const sel = $('ft-camera');
  sel.innerHTML = '';
  if (!cams.length) { const o = document.createElement('option'); o.value = ''; o.textContent = 'Nenhuma câmera encontrada'; sel.appendChild(o); return 0; }
  cams.forEach((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || `Câmera ${i + 1}`; sel.appendChild(o); });
  const guardada = st.config.camera;
  if (guardada && cams.some((d) => d.deviceId === guardada)) sel.value = guardada;
  return cams.length;
}
async function abrirCamera() {
  pararCamera();
  if (!$('ft-camera').options.length || !$('ft-camera').value) await listarCameras();
  const id = $('ft-camera').value;
  if (!id) { $('ft-estado-foto').textContent = 'Nenhuma câmera encontrada. Confira se ela está ligada e liberada no Windows.'; return false; }
  const base = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  try {
    st.stream = await navigator.mediaDevices.getUserMedia({ video: { ...base, deviceId: { exact: id } } });
  } catch (_) {
    try { st.stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id } } }); } catch (e) {
      $('ft-estado-foto').textContent = 'Não consegui abrir a câmera. Confira se ela está ligada, liberada no Windows e fechada em outros programas.';
      falar($('ft-estado-foto').textContent);
      return false;
    }
  }
  const v = video();
  v.srcObject = st.stream;
  await v.play().catch(() => {});
  st.seguir.cx = 0.5; st.seguir.alvo = null;
  if (st.etapa === 2 && st.stream) { // a pessoa pode ter saído da tela enquanto a câmera abria
    st.desenho = setInterval(desenharPrevia, 1000 / 20);
    const r = st.stream.getVideoTracks()[0].getSettings();
    $('ft-estado-foto').textContent = r.width ? `Câmera aberta, ${r.width} por ${r.height} pontos.` : 'Câmera aberta.';
  }
  return true;
}

const seguindo = () => $('ft-seguir').checked;
function atualizarSeguimento(v) {
  const s = st.seguir;
  if (!seguindo()) { s.cx = 0.5; s.alvo = null; return; }
  const agora = performance.now();
  if (!s.ocupado && agora - s.ultimo > 400) {
    s.ocupado = true; s.ultimo = agora;
    createImageBitmap(v, { resizeWidth: 320, resizeHeight: Math.max(8, Math.round(320 * v.videoHeight / v.videoWidth)) })
      .then((bitmap) => tarefa('rostoRapido', { bitmap }, [bitmap]))
      .then((r) => { if (!r) return; const alvo = r.x + r.w / 2; if (s.alvo == null) s.cx = alvo; s.alvo = alvo; })
      .catch(() => {})
      .finally(() => { s.ocupado = false; });
  }
  if (s.alvo != null && Math.abs(s.alvo - s.cx) > 0.015) s.cx += (s.alvo - s.cx) * 0.12;
}
function desenharPrevia() {
  const p = proporcao(), v = video();
  if (st.revisando || !p || !v.videoWidth) return;
  const c = $('ft-previa');
  const k = 420 / Math.max(p.largura, p.altura);
  const w = Math.round(p.largura * k), h = Math.round(p.altura * k);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  atualizarSeguimento(v);
  const r = FT.recorteRazao(v.videoWidth, v.videoHeight, p.w / p.h, seguindo() ? st.seguir.cx : 0.5);
  c.getContext('2d').drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
}

// --- Worker de visão (rosto e recorte de pessoa) -------------------------------------------------------

function tarefa(tipo, dados, transferir = []) {
  if (!st.worker) {
    st.worker = new Worker('visao-worker.js');
    st.worker.onmessage = (ev) => {
      const p = st.pendentes.get(ev.data.id);
      if (!p) return;
      st.pendentes.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.valor); else p.reject(new Error(ev.data.erro));
    };
    st.worker.onerror = (ev) => {
      for (const p of st.pendentes.values()) p.reject(new Error(ev.message || 'Erro na detecção.'));
      st.pendentes.clear(); st.worker = null;
    };
  }
  const id = st.tarefa++;
  return new Promise((resolve, reject) => { st.pendentes.set(id, { resolve, reject }); st.worker.postMessage({ id, tipo, dados }, transferir); });
}

// --- Tirar a foto ---------------------------------------------------------------------------------------

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function capturarQuadro() {
  const v = video();
  // Câmeras costumam dar uma foto maior que o vídeo da prévia. Se não der, ou se demorar, vale o quadro do vídeo.
  try {
    const track = st.stream.getVideoTracks()[0];
    if (window.ImageCapture && track) {
      const blob = await Promise.race([new window.ImageCapture(track).takePhoto(), espera(4000).then(() => null)]);
      if (blob) {
        const bmp = await createImageBitmap(blob);
        if (bmp.width >= v.videoWidth && bmp.height >= v.videoHeight) return bmp;
        bmp.close();
      }
    }
  } catch (_) { /* segue com o quadro do vídeo */ }
  return createImageBitmap(v);
}

async function tirarFoto() {
  if (st.tirando) { if (st.contando) st.cancelar = true; return; }
  if (st.revisando) return falar('Para tirar outra foto, descarte esta com Alt D.');
  if (!proporcao()) return falar('Escolha a proporção na Etapa 1.');
  const v = video();
  if (!st.stream || !v.videoWidth) return falar('Nenhuma câmera aberta. Escolha uma câmera.');
  st.tirando = true;
  try {
    const seg = Number($('ft-timer').value) || 0;
    if (seg) {
      st.cancelar = false; st.contando = true;
      { falar(`Temporizador de ${seg} segundos. Alt R de novo cancela.`); await espera(1800); }
      for (let i = seg; i >= 1 && !st.cancelar; i--) {
        if (i <= 3 || i % 5 === 0) bipe(500 + (4 - Math.min(i, 4)) * 120);
        await espera(1000);
      }
      st.contando = false;
      if (st.cancelar) { st.cancelar = false; falar('Foto cancelada.'); return; }
    }
    bipe(1400);
    const bmp = await capturarQuadro();
    if (st.foto && st.foto.close) st.foto.close();
    st.foto = bmp;
    st.cx = seguindo() ? st.seguir.cx : 0.5;
    falar('Foto tirada. Fazendo o recorte da pessoa, um instante.');
    st.mascara = null; st.rosto = null;
    try {
      const peq = await createImageBitmap(bmp, { resizeWidth: 320, resizeHeight: Math.max(8, Math.round(320 * bmp.height / bmp.width)) });
      st.rosto = await tarefa('rostoRapido', { bitmap: peq }, [peq]);
    } catch (_) { st.rosto = null; }
    let aviso = '';
    try { st.mascara = await mascaraDaPessoa(bmp); } catch (_) { aviso = ' Não consegui separar a pessoa do fundo. Só ficam bem as opções que usam a foto inteira.'; }
    const p = proporcao();
    st.cores = null;
    try { st.cores = FT.coresDaPessoa(bmp, bmp.width, bmp.height, st.mascara, st.rosto); } catch (_) { st.cores = null; }
    const falaCores = FT.falaDasCores(st.cores);
    $('ft-cores').textContent = falaCores; $('ft-cores').hidden = !falaCores;
    st.contraste = ''; $('ft-contraste').hidden = true;
    const rec = FT.recorteRazao(bmp.width, bmp.height, p.w / p.h, st.cx);
    if (p.fixo) aviso += ` A capa sai sempre com exatamente ${p.largura} por ${p.altura} pontos${p.destino ? ', ' + p.destino : ', o tamanho ideal do Spotify'}. A câmera entregou ${bmp.width} por ${bmp.height}, então a sua imagem é ampliada na mesma proporção, sem cortar nada do que você enquadrou, e fica um pouco macia, mas o fundo, a moldura e o escrito saem nítidos.`;
    else if (rec.sw < p.largura * 0.75) aviso += ` A câmera entregou ${bmp.width} por ${bmp.height} pontos, então a foto sai com ${Math.round(Math.min(rec.sw, p.largura))} pontos de largura.`;
    st.falaCores = falaCores; st.avisoFoto = aviso.trim();
    let enq = '';
    if (seg && $('ft-falar-enq').checked) { try { enq = await textoDoEnquadre(bmp, rec, p); } catch (_) { enq = ''; } }
    entrarRevisao(enq);
  } catch (e) {
    falar('Não consegui tirar a foto. ' + (e.message || e));
  } finally { st.tirando = false; st.contando = false; }
}

/** Mostra a foto tirada, parada, com as escolhas: descartar, salvar e continuar ou voltar. */
function entrarRevisao(extra = '') {
  st.revisando = true;
  if (st.etapa !== 2) irParaEtapa(2, { fala: false, revisao: true });
  $('ft-captura-bloco').hidden = true; $('ft-revisao').hidden = false; $('ft-previa').hidden = false;
  const p = proporcao(), c = $('ft-previa'), k = 420 / Math.max(p.largura, p.altura);
  c.width = Math.round(p.largura * k); c.height = Math.round(p.altura * k);
  const r = FT.recorteRazao(st.foto.width, st.foto.height, p.w / p.h, st.cx);
  c.getContext('2d').drawImage(st.foto, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
  const t = `${extra} Descartar e tirar outra, Alt D. Salvar e continuar, Alt A. Voltar, Alt V. Alt E fala o enquadramento desta foto.`.trim();
  $('ft-revisao-info').textContent = t;
  $('ft-revisao-titulo').focus();
  falarDepois(`Foto tirada. ${t}`, 250);
}
function descartarFoto() {
  if (!st.revisando) return;
  st.revisando = false;
  if (st.foto && st.foto.close) st.foto.close();
  st.foto = null; st.mascara = null; st.rosto = null; st.cores = null;
  $('ft-captura-bloco').hidden = false; $('ft-revisao').hidden = true;
  if (!st.stream) abrirCamera();
  $('ft-tirar').focus();
  falar('Foto descartada. A câmera está pronta para outra.');
}

/** A máscara da pessoa (alfa) na foto inteira, num tamanho pequeno: o recorte fica suave quando é esticado. */
async function mascaraDaPessoa(bmp) {
  const k = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
  const w = Math.max(16, Math.round(bmp.width * k)), h = Math.max(16, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0, w, h);
  const dados = x.getImageData(0, 0, w, h).data;
  await tarefa('segmentarIniciar', {});
  const m = await tarefa('segmentar', { dados: dados.buffer.slice(0), w, h });
  const saida = new ImageData(w, h);
  for (let i = 0, j = 0; i < m.length; i++, j += 4) { saida.data[j] = saida.data[j + 1] = saida.data[j + 2] = 255; saida.data[j + 3] = m[i]; }
  x.putImageData(saida, 0, 0);
  return c;
}

// --- Fundo e resultado -----------------------------------------------------------------------------------

async function carregarFundo(valor, razao) {
  const f = FT.formatoDoFundo(razao);
  const chave = `${valor}-${f}`;
  if (st.fundoCache.has(chave)) return st.fundoCache.get(chave);
  const img = new Image();
  img.src = `app://olho/fundos/${valor}-${f}.jpg`;
  await img.decode();
  const r = { img, w: img.naturalWidth, h: img.naturalHeight };
  st.fundoCache.set(chave, r);
  return r;
}

function entrada(extra = {}) {
  return {
    foto: st.foto, fw: st.foto.width, fh: st.foto.height, mascara: st.mascara, cx: st.cx,
    rosto: st.rosto, grande: st.tipoEscrito === 'titulo' || st.tipoEscrito === 'capa' ? true : st.tipoEscrito === 'frase' ? 'frase' : false, efeito: st.efeito, moldura: st.moldura, fundoImg: null,
    texto: st.escrever && st.tipoEscrito !== 'capa' ? $('ft-texto').value : '', capa: st.escrever && st.tipoEscrito === 'capa' ? { titulo: $('ft-texto').value, autor: $('ft-autor').value } : null,
    figurinha: st.figurinha, localTexto: st.localTextoFixo || '', ...extra
  };
}
async function desenhar(canvas, W, H, comTextos, textoDeTeste = '') {
  if (!st.foto) return;
  const e = entrada(comTextos ? {} : { texto: textoDeTeste, capa: null, figurinha: '', localTexto: '' });
  if (st.efeito === 'fundo' && st.fundo) { try { e.fundoImg = await carregarFundo(st.fundo, W / H); } catch (_) { e.efeito = 'original'; } }
  canvas.width = W; canvas.height = H;
  const r = FT.compor(canvas.getContext('2d'), W, H, e);
  if (comTextos) { st.localTexto = r.localTexto; st.localFigurinha = r.localFigurinha; }
  return r;
}
const tamanhoDeTela = (p, maximo) => { const k = maximo / Math.max(p.largura, p.altura); return [Math.round(p.largura * k), Math.round(p.altura * k)]; };
let pedido = 0;
async function desenharResultado() { const eu = ++pedido; const [w, h] = tamanhoDeTela(proporcao(), 420); if (eu === pedido) await desenhar($('ft-resultado'), w, h, false); }
async function desenharFinal() { const eu = ++pedido; const [w, h] = tamanhoDeTela(proporcao(), 420); if (eu === pedido) await desenhar($('ft-final'), w, h, true); }
/** Onde o programa põe um escrito do tamanho máximo nesta foto, sem escrever nada na tela. */
async function localDoTexto() {
  const p = proporcao(); const [w, h] = tamanhoDeTela(p, 420);
  const c = document.createElement('canvas');
  const amostra = 'Mmmm Mmmm Mmmm Mmmm Mmmm Mmmm Mmmm Mmmm Mmmm'.slice(0, limiteAtual()).trim();
  const r = await desenhar(c, w, h, false, amostra);
  st.localTextoFixo = r ? r.localTexto : 'embaixo';
  return st.localTextoFixo;
}

/** Luminosidade do fundo escolhido (sem você), medida nas laterais, para dizer se você se destaca. */
async function contrasteAtual() {
  if (!st.foto || !st.mascara || !st.cores || st.efeito === 'original') return '';
  if (st.efeito === 'fundo' && !st.fundo) return '';
  if (st.efeito === 'moldura') { const m = FT.acharMoldura(st.moldura); if (!m || m.modo === 'foto') return ''; }
  const p = proporcao(); const [w, h] = tamanhoDeTela(p, 200);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const vazio = document.createElement('canvas'); vazio.width = 8; vazio.height = 8;
  const e = entrada({ mascara: vazio, texto: '', capa: null, figurinha: '' });
  if (st.efeito === 'fundo') { try { e.fundoImg = await carregarFundo(st.fundo, w / h); } catch (_) { return ''; } }
  const ctx = c.getContext('2d', { willReadFrequently: true });
  FT.compor(ctx, w, h, e);
  return FT.falaDoContraste(st.cores, FT.luminosidadeDasLaterais(ctx, w, h));
}
let pedidoContraste = 0;
async function atualizarContraste() {
  const eu = ++pedidoContraste;
  let t = '';
  try { t = await contrasteAtual(); } catch (_) { t = ''; }
  if (eu !== pedidoContraste) return;
  st.contraste = t;
  $('ft-contraste').textContent = t; $('ft-contraste').hidden = !t;
  // O aviso de contraste e de roupa não corta a navegação pela lista: ele sai quando a pessoa fecha a seleção, com Escape.
}

function nomeDoFundo() {
  if (st.efeito === 'borrar') return 'fundo borrado';
  if (st.efeito === 'fundo') { const f = PU.FUNDOS.find((x) => x.valor === st.fundo); return f ? f.sufixo : 'fundo'; }
  if (st.efeito === 'moldura') { const m = FT.acharMoldura(st.moldura); return m ? m.nome : 'moldura'; }
  return '';
}

async function salvarFoto() {
  if (st.etapa !== 4) return falar(st.etapa === 3 ? 'Alt S salva na Etapa 4. Use Salvar e continuar para chegar lá.' : 'Tire a foto primeiro. Alt S salva na Etapa 4.');
  if (st.salvando || !st.foto) return;
  st.salvando = true;
  try {
    const p = proporcao();
    const rec = FT.recorteRazao(st.foto.width, st.foto.height, p.w / p.h, st.cx);
    const k = p.fixo ? 1 : Math.min(1, rec.sw / p.largura, rec.sh / p.altura);
    const W = Math.max(2, Math.round((p.largura * k) / 2) * 2), H = Math.max(2, Math.round((p.altura * k) / 2) * 2);
    const c = document.createElement('canvas');
    await desenhar(c, W, H, true);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
    const dados = new Uint8Array(await blob.arrayBuffer());
    if (st.capaModo) {
      const descr = [nomeDoFundo(), st.escrever ? FT.limparTexto($('ft-texto').value) : ''].filter(Boolean).join(' ') || 'foto';
      const rc = await window.api.postSalvar({ pasta: st.capaModo.pasta, moldura: '', texto: descr, rotulo: 'capa', dados });
      if (!rc.ok) throw new Error(rc.erro);
      bipe('concluido');
      return terminarCapa({ nome: rc.valor.nome, numero: rc.valor.numero, caminho: rc.valor.caminho, pasta: rc.valor.pasta, figurinha: st.figurinha || '' });
    }
    const ehCapa = st.escrever && st.tipoEscrito === 'capa' && FT.limparTexto($('ft-texto').value);
    const r = await window.api.fotoSalvar({ dados, nome: ehCapa ? FT.nomeDaCapa($('ft-texto').value) : FT.nomeDaFoto({ efeitoNome: nomeDoFundo(), proporcao: p.valor }) });
    if (!r.ok) throw new Error(r.erro);
    st.ultimoSalvo = r.valor;
    const t = `${ehCapa ? 'Capa salva' : 'Foto salva'}: ${r.valor.nome}, ${W} por ${H} pontos, na pasta ${r.valor.pasta.split(/[\\/]/).pop()}.`;
    $('ft-salvo').textContent = t;
    bipe('concluido');
    falar(t);
  } catch (e) { falar('Não consegui salvar a foto. ' + (e.message || e)); } finally { st.salvando = false; }
}

// --- Alt E e Alt Q ----------------------------------------------------------------------------------------

/** O enquadramento de uma imagem (a câmera ao vivo ou a foto tirada), no recorte da proporção escolhida. */
async function textoDoEnquadre(origem, r, p) {
  const esc = Math.min(1, 960 / Math.max(r.sw, r.sh));
  const bitmap = await createImageBitmap(origem, r.sx, r.sy, r.sw, r.sh, { resizeWidth: Math.round(r.sw * esc), resizeHeight: Math.round(r.sh * esc) });
  const dados = await tarefa('analisar', { bitmap, largura: p.largura, altura: p.altura, sequencia: [] }, [bitmap]);
  const objetos = PU.descreverObjetos(dados.objetos || []).texto;
  return PU.descreverEnquadramento({ ...dados, espelhada: false, objetos }).texto;
}
async function enquadre() {
  const v = video();
  if (st.analisando) return '';
  const p = proporcao();
  let origem, r;
  if (st.revisando && st.foto) { origem = st.foto; r = FT.recorteRazao(st.foto.width, st.foto.height, p.w / p.h, st.cx); }
  else {
    if (!st.stream || !v.videoWidth) { falar('Nenhuma câmera aberta.'); return ''; }
    origem = v; r = FT.recorteRazao(v.videoWidth, v.videoHeight, p.w / p.h, seguindo() ? st.seguir.cx : 0.5);
  }
  st.analisando = true;
  const demora = setTimeout(() => falar('Olhando a imagem, um instante.'), 700);
  try {
    const texto = await textoDoEnquadre(origem, r, p);
    falar(texto);
    return texto;
  } catch (e) { falar('Não consegui analisar o enquadramento. ' + (e.message || e)); return ''; } finally { clearTimeout(demora); st.analisando = false; }
}

/** O que o programa aplicou na foto, para o descritor analisar a composição. */
function contextoDaFoto() {
  const partes = [];
  if (st.efeito === 'moldura') { const m = FT.acharMoldura(st.moldura); if (m) partes.push(`Moldura: ${m.nome}. ${m.descricao}`); }
  else if (st.efeito === 'fundo') { const f = PU.FUNDOS.find((x) => x.valor === st.fundo); if (f) partes.push(`Fundo completo no lugar do fundo real: ${f.nome}. ${f.cena || ''}`); }
  else if (st.efeito === 'borrar') partes.push('O fundo real foi borrado. Não há moldura.');
  else partes.push('Sem moldura e sem troca de fundo: a foto é como a câmera viu.');
  const escrito = st.escrever ? FT.limparTexto($('ft-texto').value) : '';
  if (st.escrever && st.tipoEscrito === 'capa' && st.etapa >= 4) { const au = FT.limparTexto($('ft-autor').value); partes.push(`Capa de ebook. O título${escrito ? ` "${escrito}"` : ''} fica em cima, em letras grandes${au ? `, e o nome "${au}" fica embaixo`: ''}, cada um numa faixa escura.`); }
  else if (escrito && st.etapa >= 4) partes.push(`Escrito na imagem: "${escrito}", numa faixa escura, ${({ embaixo: 'embaixo', cima: 'em cima', meio: 'no meio' })[st.localTexto] || st.localTexto}.`);
  const fig = st.etapa >= 4 ? FT.acharFigurinha(st.figurinha) : null;
  if (fig) partes.push(`Figurinha: ${fig.rotulo} Fica no canto ${({ 'inf-dir': 'de baixo, à direita', 'inf-esq': 'de baixo, à esquerda', 'sup-dir': 'de cima, à direita', 'sup-esq': 'de cima, à esquerda' })[st.localFigurinha] || ''}.`);
  return partes.join(' ');
}
async function descrever() {
  const alvo = st.etapa === 2 ? $('ft-previa') : st.etapa === 3 ? $('ft-resultado') : st.etapa === 4 ? $('ft-final') : null;
  if (!alvo || !alvo.width) return falar('Alt Q descreve a câmera na Etapa 2 e a foto nas Etapas 3 e 4.');
  const blob = await new Promise((ok) => alvo.toBlob(ok, 'image/png'));
  const r = await window.api.quadroSalvar({ dados: new Uint8Array(await blob.arrayBuffer()) });
  if (!r.ok) return falar('Não consegui preparar a imagem. ' + r.erro);
  st.ultimaDescricao = '';
  if (window.olho && window.olho.descreverQuadro) { const texto = await window.olho.descreverQuadro(r.valor.caminho, st.etapa >= 3 ? contextoDaFoto() : undefined); if (typeof texto === 'string' && texto) st.ultimaDescricao = texto; }
}
/** Alt C: copia a última descrição do Alt Q para a área de transferência. */
async function copiarDescricao() {
  if (!st.ultimaDescricao) return falar('Ainda não há descrição para copiar. Use Alt Q antes.');
  const r = await window.api.areaCopiar({ texto: st.ultimaDescricao });
  falar(r && r.ok ? 'Descrição copiada.' : 'Não consegui copiar a descrição.');
}

/** Uma lista só: sem mudar, borrar, e as seções com fundos completos e molduras (só as que combinam com a proporção). */
function valorVisual() { return st.efeito === 'fundo' ? 'f:' + st.fundo : st.efeito === 'moldura' ? 'm:' + st.moldura : st.efeito; }
function escolherVisual(v) {
  if (v === 'original' || v === 'borrar') { st.efeito = v; return; }
  const [tipo, valor] = [v.slice(0, 1), v.slice(2)];
  if (tipo === 'f') { st.efeito = 'fundo'; st.fundo = valor; } else { st.efeito = 'moldura'; st.moldura = valor; }
}
function montarVisual() {
  const { escondidas } = FT.moldurasPara(st.prop);
  const fora = new Set(escondidas.map((m) => m.valor));
  FT.MOLDURAS.forEach((m) => { if (m.soPost) fora.add(m.valor); }); // as só para post (preto) não servem para foto
  // Sem o recorte da pessoa, só funcionam as opções que mantêm o fundo real da foto.
  const semRecorte = !st.mascara;
  if (semRecorte) FT.MOLDURAS.forEach((m) => { if (m.fundoReal !== 'mantem') fora.add(m.valor); });
  if (st.efeito === 'moldura' && fora.has(st.moldura)) { st.efeito = 'original'; st.moldura = ''; }
  if (semRecorte && (st.efeito === 'borrar' || st.efeito === 'fundo')) { st.efeito = 'original'; st.fundo = ''; }
  const itens = [
    ...(semRecorte ? [] : PU.FUNDOS.map((f) => ({ valor: 'f:' + f.valor, nome: 'F ' + f.nome, texto: FT.textoDoFundo(f) }))),
    ...FT.MOLDURAS.filter((m) => !fora.has(m.valor)).map((m) => ({ valor: 'm:' + m.valor, nome: 'M ' + m.nome, texto: m.texto }))
  ];
  const ok = new Set(itens.map((i) => i.valor));
  const cats = FT.filtrarCategoriasVisual(FT.CATEGORIAS_VISUAL, (v) => ok.has(v));
  const primeiras = [
    { valor: 'original', nome: 'Sem mudar o fundo', texto: 'Tom: neutro e fiel. Indicação: Quando o lugar onde você está já é bom e você quer a foto como ela é. Contraindicação: Quando há gente passando ou coisas bagunçadas atrás de você. Descrição: Mantém o fundo real da sua foto. Sensação: a mais natural de todas.' },
    { valor: 'borrar', nome: 'Borrar o fundo', texto: 'Tom: natural e discreto. Indicação: Esconder o que há atrás de você sem inventar um cenário. Contraindicação: Luz fraca em você, que deixa o contorno com falhas. Descrição: Mantém o fundo real, mas desfocado, e você fica nítida. Sensação: natural, com destaque para você.' }
  ];
  montarArvore('ft-grupo-visual', 'ft-visual', cats, itens, valorVisual(), (v) => { escolherVisual(v); desenharResultado(); atualizarContraste(); }, semRecorte ? primeiras.slice(0, 1) : primeiras);
  const aviso = [semRecorte ? 'O programa não conseguiu separar você do fundo, por isso só aparecem as opções que mantêm o seu fundo real: Sem mudar o fundo, Polaroide e Filme de cinema. Borrar, fundos completos e as outras molduras precisam desse recorte. Tire outra foto com mais luz em você, ou com um fundo liso, para ver todas.' : '', ].filter(Boolean).join(' ');
  $('ft-aviso-molduras').textContent = aviso;
  $('ft-aviso-molduras').hidden = !aviso;
}

// --- Resumo falado da foto (na hora, sem o descritor) ---------------------------------------------------

function resumoDaFoto() {
  const p = proporcao();
  const partes = [`Foto ${p ? p.nome : ''}.`];
  if (st.efeito === 'borrar') partes.push('Fundo borrado, com a sua imagem nítida.');
  else if (st.efeito === 'fundo') { const f = PU.FUNDOS.find((x) => x.valor === st.fundo); partes.push(f ? `Fundo completo: ${f.nome}. ${f.cena || ''}` : 'Fundo completo ainda não escolhido.'); }
  else if (st.efeito === 'moldura') { const m = FT.acharMoldura(st.moldura); partes.push(m ? `Moldura: ${m.nome}. ${m.descricao}` : 'Moldura ainda não escolhida.'); }
  else partes.push('Sem mudar o fundo: a foto como a câmera viu.');
  const t = st.escrever ? FT.limparTexto($('ft-texto').value) : '';
  const autor = st.escrever && st.tipoEscrito === 'capa' ? FT.limparTexto($('ft-autor').value) : '';
  if (st.cores) partes.push(FT.falaDasCores(st.cores));
  if (st.contraste) partes.push(st.contraste);
  if (t && st.tipoEscrito === 'capa') partes.push(`Capa de ebook. Título: ${t}, em cima.${autor ? ` Nome: ${autor}, embaixo.` : ''}`);
  else if (t) partes.push(`Escrito: ${t}, ${((FT.LOCAIS_TEXTO.find((l) => l.valor === st.localTexto) || {}).nome || 'embaixo').toLowerCase()}, lugar escolhido pelo programa.`);
  const f = FT.acharFigurinha(st.figurinha);
  if (f) partes.push(`Figurinha: ${f.nome}, ${((FT.LOCAIS_FIGURINHA.find((l) => l.valor === st.localFigurinha) || {}).nome || 'no canto').toLowerCase()}, lugar escolhido pelo programa.`);
  return partes.join(' ').replace(/\s+/g, ' ').trim();
}
function falarResumo() {
  if (st.etapa < 3) return falar('O resumo da foto vale depois de tirar a foto, nas Etapas 3 e 4.');
  falar(resumoDaFoto());
}

// --- Escrito e figurinha -------------------------------------------------------------------------------

const limiteAtual = () => FT.limiteTexto(st.prop, st.tipoEscrito);
function contadorAutor() {
  const lim = FT.limiteTexto(st.prop, 'autor');
  const n = lim - $('ft-autor').value.length;
  $('ft-contador-autor').textContent = n === 0 ? `Limite de ${lim} caracteres atingido.` : `Restam ${n} caracteres.`;
  return n;
}
function contador() {
  const lim = limiteAtual();
  const n = lim - $('ft-texto').value.length;
  $('ft-contador').textContent = n === 0 ? `Limite de ${lim} caracteres atingido.` : `Restam ${n} caracteres.`;
  return n;
}
/** Figurinha retrô com frase: mostra a opção de usar a frase como escrito e fala qual é. */
function atualizarFrase() {
  const f = FT.acharFigurinha(st.figurinha);
  const tem = !!(f && f.legenda);
  $('ft-bloco-frase').hidden = !tem;
  if (!tem) { if ($('ft-usar-frase').checked) { $('ft-usar-frase').checked = false; } return; }
  if ($('ft-usar-frase').checked) usarFrase(true);
  else falarDepois(`Figurinha ${f.nome}. A frase dela é: ${f.legenda}. Para usar como escrito da foto, marque Usar a frase desta figurinha como escrito.`, 900);
}
async function usarFrase(ligar) {
  const f = FT.acharFigurinha(st.figurinha);
  if (!f || !f.legenda) return;
  if (ligar) {
    const sim = document.getElementById('ft-escrever-sim'); if (sim) sim.checked = true;
    st.escrever = true; $('ft-bloco-texto').hidden = false;
    st.tipoEscrito = 'frase'; const r = document.getElementById('ft-tipo-escrito-frase'); if (r) r.checked = true;
    await prepararEscrito();
    $('ft-texto').value = f.legenda.slice(0, limiteAtual()); contador(); desenharFinal();
    falar(`Frase escrita na foto: ${f.legenda}`);
  } else if ($('ft-texto').value === f.legenda) { $('ft-texto').value = ''; contador(); desenharFinal(); falar('Frase retirada do escrito.'); }
}
/** Uma frase curta para o tipo de escrita escolhido: como fica e quantos caracteres cabem. */
function falaDoTipo() {
  const nome = (FT.TIPOS_ESCRITO.find((x) => x.valor === st.tipoEscrito) || {}).nome || '';
  const lim = limiteAtual();
  if (st.tipoEscrito === 'capa') return `Capa: título em cima, até ${lim} caracteres, e o nome embaixo, até ${FT.limiteTexto(st.prop, 'autor')}.`;
  const linhas = st.tipoEscrito === 'titulo' ? 'em até duas linhas, letras grandes' : st.tipoEscrito === 'frase' ? 'em até três linhas' : 'em uma linha';
  return `${nome}: ${linhas}, até ${lim} caracteres.`;
}
/** Mostra e fala onde o escrito vai ficar e quantos caracteres cabem, assim que a pessoa diz que quer escrever. */
async function prepararEscrito() {
  ajustarTiposDeEscrito();
  const lim = limiteAtual();
  $('ft-texto').maxLength = lim;
  if ($('ft-texto').value.length > lim) $('ft-texto').value = $('ft-texto').value.slice(0, lim);
  contador();
  let local = 'embaixo';
  try { local = await localDoTexto(); } catch (_) { /* segue com o padrão */ }
  const nome = (FT.LOCAIS_TEXTO.find((l) => l.valor === local) || { nome: 'Embaixo' }).nome.toLowerCase();
  if (st.tipoEscrito === 'capa') {
    $('ft-autor').maxLength = FT.limiteTexto(st.prop, 'autor'); contadorAutor();
    const tc = `O título vai ficar em cima, em até duas linhas, em letras grandes, e o nome da autora ou do autor embaixo, em uma linha, os dois longe do seu rosto. Cabem até ${lim} caracteres no título e até ${$('ft-autor').maxLength} no nome, e o programa conta e avisa quando chegar no limite.`;
    $('ft-info-texto').textContent = tc;
    return tc;
  }
  const linhas = st.tipoEscrito === 'titulo' ? 'em até duas linhas, em letras grandes' : st.tipoEscrito === 'frase' ? 'em até três linhas, em letras menores' : 'em uma linha';
  const t = `O escrito vai ficar ${nome}, ${linhas}, longe do seu rosto. Neste formato cabem até ${lim} caracteres, e o programa conta e avisa quando chegar no limite.`;
  $('ft-info-texto').textContent = t;
  return t;
}

// --- Entrada e saída da tela -------------------------------------------------------------------------------

async function entrar() {
  st.aberto = true;
  try { const r = await window.api.configLer(); if (r && r.ok) st.config = r.valor; } catch (_) { /* segue */ }
  if (!st.preparado) preparar();
  $('ft-seguir').checked = st.config.seguirRosto !== false;
  { const v = String(st.config.fotoTimer === undefined ? 3 : st.config.fotoTimer); $('ft-timer').value = ['0', '3', '5', '15'].includes(v) ? v : '3'; }
  $('ft-falar-enq').checked = st.config.fotoFalarEnquadre === true;
  $('ft-falar-enq').disabled = $('ft-timer').value === '0';
  $('ft-salvo').textContent = '';
  tipoPadrao(); $('ft-autor').value = '';
  st.revisando = false; st.foto = null; st.mascara = null; st.rosto = null; st.escrever = false; $('ft-captura-bloco').hidden = false; $('ft-revisao').hidden = true; $('ft-bloco-texto').hidden = true; $('ft-texto').value = '';
  const rn = document.getElementById('ft-escrever-nao'); if (rn) rn.checked = true;
  if (st.capaModo) {
    st.prop = st.capaModo.propFoto; tipoPadrao();
    const r = document.getElementById('ft-prop-' + st.prop); if (r) r.checked = true;
    $('ft-e1-fechar').textContent = 'Voltar ao post, sem capa';
    irParaEtapa(2, { fala: false });
    falarDepois(`Capa do post ${st.capaModo.nomePasta}. A proporção já é a do post, ${(proporcao() || {}).nome}. Etapa 2 de 4: Câmera e foto. Ao salvar a foto na Etapa 4, ela vai para a pasta do post como a capa e eu volto para o post. Voltar, Alt V, volta ao post sem capa.`, 300);
    return;
  }
  $('ft-e1-fechar').textContent = 'Voltar ao início';
  irParaEtapa(1, { fala: false });
  falarDepois('Tirar fotos. Etapa 1 de 4: Proporção da foto. Escolha a proporção e continue.', 300);
}
function sair() {
  st.aberto = false;
  st.capaModo = null;
  pararCamera();
  if (st.worker) { st.worker.terminate(); st.worker = null; st.pendentes.clear(); }
}

function preparar() {
  st.preparado = true;
  st.prop = st.config.fotoProporcao || '';
  montarGrupo('ft-grupo-prop', 'ft-prop', FT.PROPORCOES_FOTO, st.prop, (v) => { st.prop = v; salvarConfig({ fotoProporcao: v }); tipoPadrao(); });
  montarArvore('ft-grupo-figurinha', 'ft-figurinha', FT.CATEGORIAS_FIGURINHA, FT.FIGURINHAS.map((f) => ({ valor: f.valor, nome: f.rotulo || f.nome, detalhes: f.detalhes })), '', (v) => { st.figurinha = v; atualizarFrase(); desenharFinal(); }, [{ valor: '', nome: 'Nenhuma figurinha', texto: 'Sem figurinha na foto.' }]);
  montarGrupo('ft-grupo-tipo-escrito', 'ft-tipo-escrito', FT.TIPOS_ESCRITO, st.tipoEscrito, async (v) => {
    st.tipoEscrito = v; ajustarTiposDeEscrito();
    if (st.escrever) { await prepararEscrito(); falar(falaDoTipo()); desenharFinal(); }
  });
  montarGrupo('ft-grupo-escrever', 'ft-escrever', [{ valor: 'nao', nome: 'Não' }, { valor: 'sim', nome: 'Sim' }], 'nao', async (v) => {
    st.escrever = v === 'sim';
    $('ft-bloco-texto').hidden = !st.escrever;
    if (st.escrever) { await prepararEscrito(); falar('Sim. Tab chega aos tipos de escrita.'); } else { $('ft-texto').value = ''; $('ft-autor').value = ''; falar('Não. Tab chega às figurinhas.'); }
    desenharFinal();
  });
  $('ft-texto').addEventListener('input', () => {
    const n = contador();
    if (n <= 0 || n === 10 || n === 5) falar($('ft-contador').textContent);
    desenharFinal();
  });
  $('ft-autor').addEventListener('input', () => {
    const n = contadorAutor();
    if (n <= 0 || n === 10 || n === 5) falar($('ft-contador-autor').textContent);
    desenharFinal();
  });
  $('ft-usar-frase').addEventListener('change', () => usarFrase($('ft-usar-frase').checked));
  $('ft-camera').addEventListener('change', () => { salvarConfig({ camera: $('ft-camera').value }); abrirCamera(); });
  $('ft-seguir').addEventListener('change', () => { salvarConfig({ seguirRosto: $('ft-seguir').checked }); st.seguir.cx = 0.5; st.seguir.alvo = null; falar($('ft-seguir').checked ? 'Seguir o rosto: marcado.' : 'Seguir o rosto: desmarcado.'); });
  $('ft-timer').addEventListener('change', () => {
    const v = Number($('ft-timer').value) || 0;
    salvarConfig({ fotoTimer: v });
    $('ft-falar-enq').disabled = !v;
    falar(v ? `Temporizador de ${v} segundos.` : 'Sem temporizador. A foto sai na hora.');
  });
  $('ft-falar-enq').addEventListener('change', () => { salvarConfig({ fotoFalarEnquadre: $('ft-falar-enq').checked }); falar($('ft-falar-enq').checked ? 'Ouvir o enquadramento depois de tirar a foto: marcado.' : 'Ouvir o enquadramento depois de tirar a foto: desmarcado.'); });
  $('ft-e1-continuar').addEventListener('click', continuar);
  $('ft-e3-continuar').addEventListener('click', continuar);
  $('ft-e2-voltar').addEventListener('click', voltar);
  $('ft-e3-voltar').addEventListener('click', voltar);
  $('ft-r-voltar').addEventListener('click', voltar);
  $('ft-r-continuar').addEventListener('click', continuar);
  $('ft-descartar').addEventListener('click', descartarFoto);
  $('ft-enquadre-foto').addEventListener('click', () => enquadre());
  $('ft-e4-voltar').addEventListener('click', voltar);
  $('ft-e1-fechar').addEventListener('click', fechar);
  $('ft-e4-fechar').addEventListener('click', fechar);
  $('ft-tirar').addEventListener('click', tirarFoto);
  $('ft-enquadre').addEventListener('click', enquadre);
  $('ft-salvar').addEventListener('click', salvarFoto);
  $('ft-descrever').addEventListener('click', descrever);
  $('ft-resumo-3').addEventListener('click', falarResumo);
  $('ft-resumo-4').addEventListener('click', falarResumo);
  $('ft-copiar').addEventListener('click', copiarDescricao);
  $('ft-abrir-pasta').addEventListener('click', async () => { const r = await window.api.pastaAbrir(); falar(r && r.ok ? 'Abrindo a pasta Olho da Cena.' : 'Não consegui abrir a pasta.'); });
  // Alt S salva aqui (o Alt S geral do programa não conhece esta tela); Alt Q descreve a câmera ou a foto; Alt R e Alt E valem na Etapa 2.
  document.addEventListener('keydown', (e) => {
    if (!st.aberto || $('tela-foto').hidden || document.querySelector('dialog[open]')) return;
    if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey)) return;
    const noPasso2 = (f, msg) => () => (st.etapa === 2 ? f() : falar(msg));
    const acao = e.code === 'KeyS' ? salvarFoto : e.code === 'KeyQ' ? descrever : e.code === 'KeyC' ? copiarDescricao : e.code === 'KeyD' ? (st.etapa === 2 && st.revisando ? descartarFoto : falarResumo)
      : e.code === 'KeyR' ? noPasso2(tirarFoto, 'Alt R tira a foto na Etapa 2, Câmera e foto.')
      : e.code === 'KeyE' ? noPasso2(enquadre, 'Alt E fala o enquadramento na Etapa 2, Câmera e foto.') : null;
    if (!acao) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) acao();
  }, true);
}

document.addEventListener('selecao-fechada', (e) => {
  if (!st.aberto || st.etapa !== 3 || !e.detail || e.detail.id !== 'ft-grupo-visual') return;
  if (st.contraste) falarDepois(st.contraste, 1400);
});

window.fotoTela = { entrar, sair, irParaEtapa, pedirCapa, estado: st };
