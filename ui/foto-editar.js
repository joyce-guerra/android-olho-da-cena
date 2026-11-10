/* Olho da Cena 3.0.4: Editar fotos.
   A pessoa escolhe uma pasta. O programa só trabalha com o que é seguro (src/fotos-editar.js) e diz o motivo do resto.
   Ela marca as fotos, escolhe uma ação por vez (fundo ou moldura, formato, escrito e figurinha), vê os resultados,
   salva as boas com Alt S, que saem da lista, e segue com as outras. O original nunca muda.
   Módulo à parte: os nomes daqui não se misturam com os dos outros. */

const $ = (id) => document.getElementById(id);
const PU = window.api.puro;
const FT = window.Fotos;
const FE = window.FotosEditar;

const ed = {
  aberto: false, preparado: false, etapa: 1, worker: null, tarefa: 1, pendentes: new Map(), analisando: false, cancelar: false,
  pasta: '', fotos: [], descartadas: [], marcadas: new Set(), trabalho: [], resMarcadas: new Set(), fundoCache: new Map(),
  ultimaDescricao: '', anuncios: [], ocupado: false, maximo: 200, cacheBmp: new Map()
};
window.__editfoto = ed; // usado só pelos testes automáticos

// --- Fala e ajudantes -------------------------------------------------------------------------------------

let alterna = false;
let adiada = null;
function falar(msg) {
  clearTimeout(adiada); // uma fala nova não é atropelada por uma antiga que estava esperando
  alterna = !alterna;
  $('status').textContent = msg ? msg + (alterna ? ' ' : '') : '';
  if (msg) ed.anuncios.push(msg);
}
function falarDepois(msg, ms = 250) { clearTimeout(adiada); adiada = setTimeout(() => falar(msg), ms); }
const bipe = (t) => { try { if (window.gravarTela && window.gravarTela.bipe) window.gravarTela.bipe(t); } catch (_) { /* sem som, segue */ } };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const plural = (n, um, varios) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

function tarefa(tipo, dados, transferir = []) {
  if (!ed.worker) {
    ed.worker = new Worker('visao-worker.js');
    ed.worker.onmessage = (ev) => {
      const p = ed.pendentes.get(ev.data.id);
      if (!p) return;
      ed.pendentes.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.valor); else p.reject(new Error(ev.data.erro));
    };
    ed.worker.onerror = (ev) => {
      for (const p of ed.pendentes.values()) p.reject(new Error(ev.message || 'Erro na detecção.'));
      ed.pendentes.clear(); ed.worker = null;
    };
  }
  const id = ed.tarefa++;
  return new Promise((resolve, reject) => { ed.pendentes.set(id, { resolve, reject }); ed.worker.postMessage({ id, tipo, dados }, transferir); });
}

// --- A lista de fotos: opções que se marcam, e detalhes item a item ---------------------------------------------

/**
 * Uma lista em que as setas andam, o Espaço marca, o asterisco e o Control A marcam todas, e Enter abre os detalhes, um item para cada coisa.
 * itens: [{ id, nome, resumo, detalhes: [{ r, t }] }]. marcadas: Set de ids, ou null se a lista não marca.
 */
function montarLista(el, itens, marcadas, aoMudar) {
  el.textContent = '';
  const papelOpcao = marcadas ? 'option' : 'listitem';
  itens.forEach((it, i) => {
    const o = document.createElement('div');
    o.className = 'ed-opcao'; o.dataset.id = String(it.id); o.setAttribute('role', papelOpcao); o.tabIndex = i === 0 ? 0 : -1;
    const nome = `${it.nome}${it.resumo ? ', ' + it.resumo : ''}`;
    o.textContent = nome; o.setAttribute('aria-label', nome);
    if (marcadas) o.setAttribute('aria-selected', marcadas.has(it.id) ? 'true' : 'false');
    o._detalhes = it.detalhes || [];
    el.appendChild(o);
  });
  el._marcadas = marcadas; el._aoMudar = aoMudar;
}
const opcoesDe = (el) => [...el.querySelectorAll(':scope > .ed-opcao')];
function focarOpcao(el, o) {
  opcoesDe(el).forEach((x) => { x.tabIndex = x === o ? 0 : -1; });
  if (o) o.focus();
}
function fecharDetalhes(el, voltar = true) {
  const b = el.querySelector(':scope > .detalhe-aberto');
  if (!b) return false;
  const dono = b.previousElementSibling;
  b.remove();
  if (voltar && dono) focarOpcao(el, dono);
  return true;
}
function abrirDetalhes(el, o) {
  fecharDetalhes(el, false);
  if (!o._detalhes.length) return falar('Sem detalhes para esta foto.');
  const b = document.createElement('div');
  b.className = 'detalhe-aberto'; b.setAttribute('role', 'list'); b.setAttribute('aria-label', `Detalhes de ${o.dataset.nome || o.textContent}`);
  for (const x of o._detalhes) {
    const li = document.createElement('div');
    li.className = 'detalhe-item'; li.setAttribute('role', 'listitem'); li.tabIndex = -1;
    li.textContent = `${x.r}: ${x.t}`; li.setAttribute('aria-label', li.textContent);
    b.appendChild(li);
  }
  o.after(b);
  b.firstElementChild.focus();
}
function alternar(el, o, valor) {
  const m = el._marcadas; if (!m) return;
  const id = Number(o.dataset.id);
  const agora = valor === undefined ? !m.has(id) : valor;
  if (agora) m.add(id); else m.delete(id);
  o.setAttribute('aria-selected', agora ? 'true' : 'false');
}
function marcarTodas(el) {
  if (!el._marcadas) return;
  const todas = opcoesDe(el);
  const tudo = todas.every((o) => el._marcadas.has(Number(o.dataset.id)));
  todas.forEach((o) => alternar(el, o, !tudo));
  falar(tudo ? 'Nenhuma marcada.' : `Todas as ${todas.length} marcadas.`);
  if (el._aoMudar) el._aoMudar();
}
function ligarLista(el) {
  el.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey) return;
    const alvo = document.activeElement;
    const dentro = alvo && alvo.closest && alvo.closest('.detalhe-aberto');
    if (dentro && el.contains(alvo)) {
      const itens = [...dentro.querySelectorAll('.detalhe-item')];
      const i = Math.max(0, itens.indexOf(alvo));
      let j = null;
      if (e.key === 'ArrowDown') j = Math.min(itens.length - 1, i + 1);
      else if (e.key === 'ArrowUp') j = Math.max(0, i - 1);
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = itens.length - 1;
      if (j !== null) { e.preventDefault(); e.stopPropagation(); itens[j].focus(); return; }
      if (['Escape', 'ArrowLeft', 'Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); fecharDetalhes(el); }
      return;
    }
    const o = alvo && alvo.classList && alvo.classList.contains('ed-opcao') && el.contains(alvo) ? alvo : null;
    if (!o) return;
    const todas = opcoesDe(el), i = todas.indexOf(o);
    const ir = (j) => { e.preventDefault(); e.stopPropagation(); focarOpcao(el, todas[Math.max(0, Math.min(todas.length - 1, j))]); };
    if (e.key === 'ArrowDown') ir(i + 1);
    else if (e.key === 'ArrowUp') ir(i - 1);
    else if (e.key === 'Home') ir(0);
    else if (e.key === 'End') ir(todas.length - 1);
    else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); abrirDetalhes(el, o); }
    else if (e.key === ' ' && el._marcadas) { e.preventDefault(); e.stopPropagation(); alternar(el, o); falar(`${o.getAttribute('aria-selected') === 'true' ? 'Marcada' : 'Desmarcada'}. ${plural(el._marcadas.size, 'marcada', 'marcadas')}.`); if (el._aoMudar) el._aoMudar(); }
    else if ((e.key === '*' || (e.ctrlKey && (e.key === 'a' || e.key === 'A'))) && el._marcadas) { e.preventDefault(); e.stopPropagation(); marcarTodas(el); }
  });
}

// --- Etapas -------------------------------------------------------------------------------------------------

function irPara(n, foco) {
  ed.etapa = n;
  for (let i = 1; i <= 4; i++) $('ed-e' + i).hidden = i !== n;
  window.scrollTo(0, 0);
  const alvo = foco || ({ 1: $('ed-fotos'), 2: $('ed-lista').querySelector('.ed-opcao') || $('ed-diag'), 3: $('ed-acoes').querySelector('button') || $('ed-e3-voltar'), 4: $('ed-res-lista').querySelector('.ed-opcao') || $('ed-outra') })[n];
  if (alvo) alvo.focus();
}

// --- Medir e avaliar cada foto ----------------------------------------------------------------------------------

/** A foto inteira, só enquanto se compõe: poucas ficam na memória, para aguentar muitas fotos. */
async function carregarBmp(f) {
  if (ed.cacheBmp.has(f.id)) { const b = ed.cacheBmp.get(f.id); ed.cacheBmp.delete(f.id); ed.cacheBmp.set(f.id, b); return b; }
  const b = await carregar(f.url);
  ed.cacheBmp.set(f.id, b);
  while (ed.cacheBmp.size > 6) { const [k, v] = ed.cacheBmp.entries().next().value; ed.cacheBmp.delete(k); if (v && v.close) v.close(); }
  return b;
}
function liberarBmp(id) { const b = ed.cacheBmp.get(id); ed.cacheBmp.delete(id); if (b && b.close) b.close(); }
async function carregar(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`o programa não conseguiu ler o arquivo, erro ${r.status}`);
    return await createImageBitmap(await r.blob());
  } catch (e) {
    // Reserva: deixa o próprio navegador abrir a imagem.
    const img = new Image();
    img.src = url;
    try { await img.decode(); return await createImageBitmap(img); } catch (_) { throw e; }
  }
}
/** As medidas de uma foto, em tamanho pequeno: nitidez, luz, fundo, rostos e, se houver uma pessoa só, o recorte dela. */
async function medir(bmp) {
  const k = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
  const w = Math.max(16, Math.round(bmp.width * k)), h = Math.max(16, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  let soma = 0, estourados = 0;
  for (let i = 0, j = 0; i < g.length; i++, j += 4) { const v = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]; g[i] = v; soma += v; if (v >= 250) estourados++; }
  let ls = 0, ls2 = 0, n = 0;
  for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
    const i = yy * w + xx, l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    ls += l; ls2 += l * l; n++;
  }
  const media = ls / n, nitidez = ls2 / n - media * media;
  // O fundo perto das laterais, onde a pessoa quase nunca está: quanto há de detalhe ali.
  const lat = Math.max(2, Math.round(w * 0.18));
  let gs = 0, gn = 0;
  for (let yy = 0; yy < h - 1; yy++) for (const [a, b] of [[0, lat], [w - lat, w - 1]]) for (let xx = a; xx < b; xx++) { const i = yy * w + xx; gs += Math.abs(g[i] - g[i + 1]) + Math.abs(g[i] - g[i + w]); gn += 2; }
  const m = { largura: bmp.width, altura: bmp.height, nitidez, luz: { media: soma / g.length / 255, estourada: estourados / g.length }, detalheFundo: gn ? gs / gn / 255 : 0, rostos: [], cobertura: null };
  try {
    const peq = await createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h });
    m.rostos = await tarefa('todosOsRostos', { bitmap: peq }, [peq]);
  } catch (_) { m.rostos = []; m.deteccaoFalhou = true; }
  return m;
}
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
  let dentro = 0;
  for (let i = 0, j = 0; i < m.length; i++, j += 4) { saida.data[j] = saida.data[j + 1] = saida.data[j + 2] = 255; saida.data[j + 3] = m[i]; if (m[i] > 127) dentro++; }
  x.putImageData(saida, 0, 0);
  return { canvas: c, cobertura: dentro / m.length };
}

async function analisarPasta(info) {
  ed.analisando = true; ed.cancelar = false;
  ed.pasta = info.pasta; ed.fotos = []; ed.descartadas = []; ed.marcadas = new Set(); ed.trabalho = []; ed.resMarcadas = new Set();
  const total = info.arquivos.length;
  if (total > ed.maximo) {
    ed.analisando = false;
    const t = `Esta escolha tem ${plural(total, 'foto', 'fotos')}. Para o programa trabalhar bem, escolha até ${ed.maximo} por vez. Use Escolher as fotos, Alt E, e marque só as que você quer, com Control A para todas as da pasta.`;
    $('ed-estado').textContent = t; return falar(t);
  }
  if (!total) {
    ed.analisando = false;
    const tipos = Object.entries(info.outros || {}).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([x, n]) => `${x.replace('.', '').toUpperCase()}, ${n}`);
    const t = info.totalDeArquivos
      ? `Achei ${plural(info.totalDeArquivos, 'arquivo', 'arquivos')} na pasta ${info.nome}, mas nenhum em formato de imagem que o programa abre. Vi: ${tipos.join('; ')}. O programa abre JPG, PNG, WEBP, BMP, GIF e AVIF. ${tipos.some((x) => /^HEI/.test(x)) ? 'As fotos de iPhone em HEIC precisam ser salvas em JPG antes.' : 'As fotos podem estar numa subpasta: escolha a pasta que as contém.'}`
      : `A pasta ${info.nome} está vazia. As fotos podem estar numa subpasta: escolha a pasta que as contém.`;
    $('ed-estado').textContent = t; return falar(t);
  }
  $('ed-fotos').disabled = true; $('ed-pasta').disabled = true; $('ed-cancelar').hidden = false; $('ed-barra').hidden = false; $('ed-barra').value = 0;
  $('ed-estado').textContent = `Analisando ${plural(total, 'foto', 'fotos')}.`;
  falar(`Analisando ${plural(total, 'foto', 'fotos')} da pasta ${info.nome}. O beep sobe a cada dez por cento.`);
  let degrau = 0;
  for (let i = 0; i < total && !ed.cancelar; i++) {
    const arq = info.arquivos[i];
    let aval, bmp = null, extra = {}, medidoRostos = [];
    try {
      bmp = await carregar(arq.url);
      const med = await medir(bmp);
      medidoRostos = med.rostos;
      if (med.rostos.length === 1 && !med.deteccaoFalhou) {
        try {
          const mk = await mascaraDaPessoa(bmp);
          med.cobertura = mk.cobertura; extra.mascara = mk.canvas;
          extra.cores = FT.coresDaPessoa(bmp, bmp.width, bmp.height, mk.canvas, med.rostos[0]);
        } catch (_) { med.cobertura = null; }
      }
      aval = FE.avaliarFoto(med);
      if (med.deteccaoFalhou) { aval.aprovada = false; aval.motivos.push('Não consegui procurar rostos nesta foto.'); aval.acoes = { fundo: false, moldura: false, formato: false, escrito: false, gemma: false }; }
      if (extra.cores) { const fc = FT.falaDasCores(extra.cores); if (fc) aval.itens.push({ r: 'Cores', t: fc }); }
    } catch (e) {
      aval = { aprovada: false, motivos: [`Não consegui abrir esta imagem${e && e.message ? ': ' + e.message : ''}.`], itens: [], acoes: { fundo: false, moldura: false, formato: false, escrito: false, gemma: false } };
    }
    if (aval.aprovada && bmp) {
      const rosto = medidoRostos.length === 1 ? medidoRostos[0] : null;
      ed.fotos.push({ id: i, nome: arq.nome, caminho: arq.caminho, url: arq.url, largura: bmp.width, altura: bmp.height, mascara: extra.mascara || null, cores: extra.cores || null, rosto, cx: rosto ? rosto.x + rosto.w / 2 : 0.5, aval, params: {}, resumo: resumoCurto(aval) });
      if (bmp && bmp.close) bmp.close(); // a foto inteira só volta à memória na hora de compor
    } else {
      if (bmp && bmp.close) bmp.close();
      ed.descartadas.push({ id: i, nome: arq.nome, aval });
    }
    const pct = Math.round(((i + 1) / total) * 100);
    $('ed-barra').value = pct;
    const g = Math.floor(pct / 10);
    if (g > degrau) { degrau = g; bipe(450 + g * 90); }
    await espera(0);
  }
  ed.analisando = false;
  $('ed-fotos').disabled = false; $('ed-pasta').disabled = false; $('ed-cancelar').hidden = true; $('ed-barra').hidden = true;
  if (ed.cancelar) { $('ed-estado').textContent = 'Análise cancelada.'; falar('Análise cancelada.'); return; }
  bipe('concluido');
  mostrarTriagem(total);
}
const resumoCurto = (aval) => {
  const p = (aval.itens.find((x) => x.r === 'Pessoas') || {}).t || '';
  const l = (aval.itens.find((x) => x.r === 'Luz') || {}).t || '';
  return `${p.replace(/\.$/, '').replace(/^Nenhuma pessoa, parece.*/, 'sem pessoa').toLowerCase()}, luz ${l.replace(/\.$/, '').toLowerCase()}`.replace(/^uma pessoa/, 'uma pessoa');
};

function mostrarTriagem(total) {
  const res = FE.resumoDaTriagem(total, ed.fotos.length);
  $('ed-resumo').textContent = res;
  $('ed-diag').hidden = !ed.descartadas.length;
  $('ed-diag-lista').hidden = true;
  montarLista($('ed-diag-lista'), ed.descartadas.map((d) => ({ id: d.id, nome: d.nome, resumo: d.aval.motivos[0] || '', detalhes: d.aval.motivos.map((t, k) => ({ r: `Motivo ${k + 1}`, t })) })), null);
  montarLista($('ed-lista'), ed.fotos.map((f) => ({ id: f.id, nome: f.nome, resumo: f.resumo, detalhes: f.aval.itens })), ed.marcadas, atualizarContagem);
  $('ed-lista').hidden = !ed.fotos.length;
  $('ed-continuar').hidden = !ed.fotos.length;
  atualizarContagem();
  irPara(2);
  falarDepois(`${res} Espaço marca uma foto, asterisco marca todas, Enter abre os detalhes.`, 300);
}
function atualizarContagem() {
  $('ed-marcadas').textContent = ed.marcadas.size ? `${plural(ed.marcadas.size, 'foto marcada', 'fotos marcadas')}.` : '';
}

// --- Ações ------------------------------------------------------------------------------------------------------------

const NOMES_ACAO = { fundo: 'Fundo ou moldura', formato: 'Formato', escrito: 'Escrito e figurinha' };
function continuarComMarcadas() {
  ed.trabalho = ed.fotos.filter((f) => ed.marcadas.has(f.id));
  if (!ed.trabalho.length) { falar('Marque pelo menos uma foto com a barra de espaço, ou todas com asterisco.'); return; }
  mostrarAcoes();
}
function mostrarAcoes(fala = true) {
  ['ed-p-fundo', 'ed-p-formato', 'ed-p-escrito'].forEach((p) => { $(p).hidden = true; });
  const acoes = FE.acoesDoConjunto(ed.trabalho.map((f) => f.aval));
  const n = ed.trabalho.length;
  $('ed-acoes-info').textContent = `${plural(n, 'foto marcada', 'fotos marcadas')}. Posso fazer ${acoes.length} ${acoes.length === 1 ? 'coisa' : 'coisas'}, uma de cada vez.`;
  const caixa = $('ed-acoes'); caixa.textContent = '';
  for (const a of acoes) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'ed-acao-' + a.valor;
    b.textContent = `${a.nome}${a.para < a.de ? `, vale para ${a.para} de ${a.de}` : ''}`;
    b.addEventListener('click', () => abrirPainel(a.valor));
    caixa.appendChild(b);
  }
  irPara(3);
  if (fala) falarDepois($('ed-acoes-info').textContent, 250);
}

// O formato escolhido, ou o mais parecido com a foto quando ainda não há um. O programa decide e avisa.
function garantirFormato(f) {
  if (f.params.prop) return '';
  const p = FE.formatoMaisProximo(FT.PROPORCOES_FOTO, f.largura, f.altura);
  f.params.prop = p.valor;
  return p.nome;
}

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
  inp.addEventListener('change', () => { if (inp.checked) aoMudar(o.valor); });
  return d;
}
function montarGrupo(idGrupo, nome, opcoes, escolhido, aoMudar) {
  const g = $(idGrupo);
  g.querySelectorAll('.radio, details').forEach((d) => d.remove());
  for (const o of opcoes) g.appendChild(criarRadio(o, nome, escolhido, aoMudar));
}
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
    } else {
      sum.textContent = `${cat.nome}, ${cat.itens.length === 1 ? '1 opção' : cat.itens.length + ' opções'}`;
      for (const v of cat.itens) { const o = opcoes.find((x) => x.valor === v); if (o) det.appendChild(criarRadio(o, nome, escolhido, aoMudar)); }
    }
    pai.appendChild(det);
  };
  for (const cat of categorias) secao(cat, g);
}
const valorDe = (nome) => { const r = document.querySelector(`input[name="${nome}"]:checked`); return r ? r.value : ''; };

function abrirPainel(qual) {
  ['ed-p-fundo', 'ed-p-formato', 'ed-p-escrito'].forEach((p) => { $(p).hidden = true; });
  const id = { fundo: 'ed-p-fundo', formato: 'ed-p-formato', escrito: 'ed-p-escrito' }[qual];
  $(id).hidden = false;
  let foco;
  if (qual === 'fundo') {
    const comRecorte = ed.trabalho.some((f) => f.aval.acoes.fundo);
    const fora = new Set();
    if (!comRecorte) FT.MOLDURAS.forEach((m) => { if (m.fundoReal !== 'mantem') fora.add('m:' + m.valor); });
    FT.MOLDURAS.forEach((m) => { if (m.soPost) fora.add('m:' + m.valor); });
    const itens = [
      ...(comRecorte ? PU.FUNDOS.map((f) => ({ valor: 'f:' + f.valor, nome: 'F ' + f.nome, texto: FT.textoDoFundo(f) })) : []),
      ...FT.MOLDURAS.filter((m) => !fora.has('m:' + m.valor)).map((m) => ({ valor: 'm:' + m.valor, nome: 'M ' + m.nome, texto: m.texto }))
    ];
    const ok = new Set(itens.map((i) => i.valor));
    const cats = FT.filtrarCategoriasVisual(FT.CATEGORIAS_VISUAL, (v) => ok.has(v));
    const primeiras = comRecorte ? [{ valor: 'borrar', nome: 'Borrar o fundo', texto: 'Tom: natural e discreto. Indicação: Esconder o que há atrás de você sem inventar um cenário. Contraindicação: Luz fraca em você, que deixa o contorno com falhas. Descrição: Mantém o fundo real, borrado, com a pessoa nítida.' }] : [];
    montarArvore('ed-grupo-visual', 'ed-visual', cats, itens, '', () => {}, primeiras);
    foco = $('ed-grupo-visual').querySelector('input, summary');
  } else if (qual === 'formato') {
    montarGrupo('ed-grupo-formato', 'ed-formato', FT.PROPORCOES_FOTO.map((p) => ({ valor: p.valor, nome: p.nome, texto: p.texto })), '', () => {});
    foco = $('ed-grupo-formato').querySelector('input');
  } else {
    const comCapa = ed.trabalho.some((f) => f.params.prop === 'capa-ebook');
    montarGrupo('ed-grupo-tipo', 'ed-tipo', FT.TIPOS_ESCRITO.filter((t) => !t.soEm || comCapa).map((t) => ({ valor: t.valor, nome: t.nome, texto: t.texto })), comCapa ? 'capa' : 'legenda', ajustarEscrito);
    montarArvore('ed-grupo-figurinha', 'ed-figurinha', FT.CATEGORIAS_FIGURINHA, FT.FIGURINHAS.map((f) => ({ valor: f.valor, nome: f.rotulo || f.nome, detalhes: f.detalhes })), '', () => {});
    $('ed-texto').value = ''; $('ed-autor').value = '';
    ajustarEscrito();
    foco = $('ed-grupo-tipo').querySelector('input:checked') || $('ed-grupo-tipo').querySelector('input');
  }
  const nome = NOMES_ACAO[qual];
  falarDepois(`${nome}. Escolha, e depois use Aplicar às marcadas.`, 250);
  if (foco) foco.focus();
}
function ajustarEscrito() {
  const tipo = valorDe('ed-tipo') || 'legenda';
  const capa = tipo === 'capa';
  $('ed-bloco-autor').hidden = !capa;
  $('ed-rotulo-texto').textContent = capa ? 'Título da capa' : 'Escrito';
  $('ed-texto').maxLength = FT.limiteTexto('feed', tipo === 'frase' ? 'frase' : tipo === 'titulo' || capa ? 'titulo' : false);
  $('ed-autor').maxLength = FT.limiteTexto('feed', 'autor');
}

function aplicarFundo() {
  const v = valorDe('ed-visual');
  if (!v) return falar('Escolha uma opção da lista primeiro.');
  const tipo = v === 'borrar' ? 'b' : v.slice(0, 1), valor = v.slice(2);
  const exigeRecorte = v === 'borrar' || tipo === 'f' || (tipo === 'm' && (FT.acharMoldura(valor) || {}).fundoReal !== 'mantem');
  const { servem, ficam } = FE.quemAceita(ed.trabalho.map((f) => f.aval), exigeRecorte);
  const idsServem = new Set(servem.map((a) => a));
  const avisos = [];
  for (const f of ed.trabalho) {
    if (!idsServem.has(f.aval)) continue;
    const novo = garantirFormato(f); if (novo) avisos.push(novo);
    f.params.efeito = v === 'borrar' ? 'borrar' : tipo === 'f' ? 'fundo' : 'moldura';
    f.params.fundo = tipo === 'f' ? valor : ''; f.params.moldura = tipo === 'm' ? valor : '';
  }
  const nomes = ficam.map((a) => (ed.trabalho.find((f) => f.aval === a) || {}).nome);
  concluirAcao('Fundo', servem.length, nomes, exigeRecorte ? 'sem um recorte seguro da pessoa' : '', avisos);
}
function aplicarFormato() {
  const v = valorDe('ed-formato');
  if (!v) return falar('Escolha um formato primeiro.');
  for (const f of ed.trabalho) f.params.prop = v;
  const p = FT.acharProporcao(v);
  concluirAcao('Formato', ed.trabalho.length, [], '', [], `${p.nome}.`);
}
function aplicarEscrito() {
  const tipo = valorDe('ed-tipo') || 'legenda';
  const texto = FT.limparTexto($('ed-texto').value, FT.limiteTexto('feed', tipo === 'frase' ? 'frase' : tipo === 'titulo' || tipo === 'capa' ? 'titulo' : false));
  const autor = tipo === 'capa' ? FT.limparTexto($('ed-autor').value, FT.limiteTexto('feed', 'autor')) : '';
  const fig = valorDe('ed-figurinha');
  if (!texto && !autor && !fig) return falar('Escreva um texto ou escolha uma figurinha primeiro.');
  const avisos = [];
  for (const f of ed.trabalho) {
    const novo = garantirFormato(f); if (novo) avisos.push(novo);
    f.params.escrito = (texto || autor) ? { tipo, texto, autor } : null;
    if (fig) f.params.figurinha = fig;
  }
  concluirAcao('Escrito e figurinha', ed.trabalho.length, [], '', avisos);
}
function concluirAcao(nome, servem, fora, motivo, avisos, extra = '') {
  let t = FE.falaDaAplicacao(nome, servem, fora, motivo);
  const novos = [...new Set(avisos)];
  if (novos.length) t += ` Escolhi o formato ${novos.join(' e ')}, o mais parecido com a foto.`;
  if (extra) t += ' ' + extra;
  mostrarResultados(t);
}

// --- Compor, descrever e salvar -------------------------------------------------------------------------------------

async function carregarFundo(valor, razao) {
  const f = FT.formatoDoFundo(razao);
  const chave = `${valor}-${f}`;
  if (ed.fundoCache.has(chave)) return ed.fundoCache.get(chave);
  const img = new Image();
  img.src = `app://olho/fundos/${valor}-${f}.jpg`;
  await img.decode();
  const r = { img, w: img.naturalWidth, h: img.naturalHeight };
  ed.fundoCache.set(chave, r);
  return r;
}
async function entradaDe(f, W, H, comTextos = true) {
  const p = f.params, esc = comTextos ? p.escrito : null;
  const e = {
    foto: await carregarBmp(f), fw: f.largura, fh: f.altura, mascara: f.mascara, cx: f.cx, rosto: f.rosto,
    grande: esc && (esc.tipo === 'titulo' || esc.tipo === 'capa') ? true : esc && esc.tipo === 'frase' ? 'frase' : false,
    efeito: p.efeito || 'original', moldura: p.moldura || '', fundoImg: null,
    texto: esc && esc.tipo !== 'capa' ? esc.texto : '', capa: esc && esc.tipo === 'capa' ? { titulo: esc.texto, autor: esc.autor } : null,
    figurinha: comTextos ? (p.figurinha || '') : '', localTexto: ''
  };
  if (e.efeito === 'fundo' && p.fundo) { try { e.fundoImg = await carregarFundo(p.fundo, W / H); } catch (_) { e.efeito = 'original'; } }
  return e;
}
async function desenharFoto(f, canvas, W, H, comTextos = true) {
  canvas.width = W; canvas.height = H;
  const e = await entradaDe(f, W, H, comTextos);
  return FT.compor(canvas.getContext('2d'), W, H, e);
}
/** O tamanho final: o do formato, ou menor se a foto não tem pontos para tanto, como no Tirar fotos. */
function tamanhoFinal(f) {
  const p = FT.acharProporcao(f.params.prop);
  const rec = FT.recorteRazao(f.largura, f.altura, p.w / p.h, f.cx);
  const k = p.fixo ? 1 : Math.min(1, rec.sw / p.largura, rec.sh / p.altura);
  return [Math.max(2, Math.round((p.largura * k) / 2) * 2), Math.max(2, Math.round((p.altura * k) / 2) * 2)];
}
const nomeDeResultado = (f) => `${f.nome.replace(/\.[^.]+$/, '')} editada.jpg`;

function descricaoDoResultado(f) {
  const p = f.params, itens = [];
  const pr = FT.acharProporcao(p.prop);
  if (pr) itens.push({ r: 'Formato', t: `${pr.nome}, ${tamanhoFinal(f).join(' por ')} pontos.` });
  if (p.efeito === 'borrar') itens.push({ r: 'Fundo', t: 'Fundo real borrado, com a pessoa nítida.' });
  else if (p.efeito === 'fundo') { const x = PU.FUNDOS.find((y) => y.valor === p.fundo); itens.push({ r: 'Fundo', t: `${x ? x.nome : 'Fundo pronto'}, no lugar do fundo real. ${x && x.cena ? x.cena : ''}`.trim() }); }
  else if (p.efeito === 'moldura') { const m = FT.acharMoldura(p.moldura); itens.push({ r: 'Moldura', t: m ? `${m.nome}. ${m.descricao}` : 'Moldura.' }); }
  else itens.push({ r: 'Fundo', t: 'O fundo real, sem mudança.' });
  if (p.escrito) {
    const e = p.escrito;
    itens.push({ r: e.tipo === 'capa' ? 'Capa' : 'Escrito', t: e.tipo === 'capa' ? `Título "${e.texto}" em cima${e.autor ? `, nome "${e.autor}" embaixo` : ''}, cada um numa faixa escura.` : `"${e.texto}", numa faixa escura, num lugar escolhido pelo programa, longe do rosto.` });
  }
  const fig = FT.acharFigurinha(p.figurinha);
  if (fig) itens.push({ r: 'Figurinha', t: fig.rotulo || fig.nome });
  if (f.contraste) itens.push({ r: 'Contraste', t: f.contraste });
  if (f.cores) { const c = FT.falaDasCores(f.cores); if (c) itens.push({ r: 'Cores', t: c }); }
  return itens;
}
async function medirContraste(f) {
  const p = f.params;
  f.contraste = '';
  if (!f.cores || !f.mascara || !(p.efeito === 'fundo' || (p.efeito === 'moldura' && (FT.acharMoldura(p.moldura) || {}).fundoReal !== 'mantem'))) return;
  try {
    const W = 200, H = Math.round(200 * (FT.acharProporcao(p.prop).h / FT.acharProporcao(p.prop).w));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const vazio = document.createElement('canvas'); vazio.width = 8; vazio.height = 8;
    const e = await entradaDe({ ...f, mascara: vazio }, W, H, false);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    FT.compor(ctx, W, H, e);
    f.contraste = FT.falaDoContraste(f.cores, FT.luminosidadeDasLaterais(ctx, W, H));
  } catch (_) { f.contraste = ''; }
}
const resumoDoResultado = (f) => {
  const p = f.params, partes = [];
  const pr = FT.acharProporcao(p.prop); if (pr) partes.push(pr.nome.split(',')[0]);
  if (p.efeito === 'borrar') partes.push('fundo borrado');
  else if (p.efeito === 'fundo') partes.push('fundo ' + ((PU.FUNDOS.find((y) => y.valor === p.fundo) || {}).nome || 'pronto'));
  else if (p.efeito === 'moldura') partes.push('moldura ' + ((FT.acharMoldura(p.moldura) || {}).nome || ''));
  if (p.escrito) partes.push(p.escrito.tipo === 'capa' ? 'capa de ebook' : 'com escrito');
  if (p.figurinha) partes.push('com figurinha');
  return partes.join(', ');
};

async function mostrarResultados(fala) {
  for (const f of ed.trabalho) await medirContraste(f);
  ed.resMarcadas = new Set();
  montarLista($('ed-res-lista'), ed.trabalho.map((f) => ({ id: f.id, nome: f.nome, resumo: resumoDoResultado(f), detalhes: descricaoDoResultado(f) })), ed.resMarcadas, () => {});
  $('ed-res-info').textContent = `${plural(ed.trabalho.length, 'foto na lista', 'fotos na lista')}.`;
  $('ed-salvo').textContent = '';
  irPara(4);
  if (fala) falarDepois(`${fala} Enter abre a descrição de cada uma. Marque com a barra de espaço e use Alt S para salvar e tirar da lista.`, 300);
}
function focoDaLista(el) {
  const a = document.activeElement;
  const o = a && a.closest ? a.closest('.ed-opcao') || (a.closest('.detalhe-aberto') ? a.closest('.detalhe-aberto').previousElementSibling : null) : null;
  return o && el.contains(o) ? o : null;
}
function alvosDosResultados() {
  const el = $('ed-res-lista');
  if (ed.resMarcadas.size) return ed.trabalho.filter((f) => ed.resMarcadas.has(f.id));
  const o = focoDaLista(el);
  return o ? ed.trabalho.filter((f) => f.id === Number(o.dataset.id)) : [];
}
function refazerResultados(focoId) {
  montarLista($('ed-res-lista'), ed.trabalho.map((f) => ({ id: f.id, nome: f.nome, resumo: resumoDoResultado(f), detalhes: descricaoDoResultado(f) })), ed.resMarcadas, () => {});
  $('ed-res-info').textContent = `${plural(ed.trabalho.length, 'foto na lista', 'fotos na lista')}.`;
  const el = $('ed-res-lista');
  if (!ed.trabalho.length) { falar('A lista de resultados está vazia.'); return voltarParaSelecao(); }
  const alvo = opcoesDe(el).find((o) => Number(o.dataset.id) === focoId) || opcoesDe(el)[0];
  focarOpcao(el, alvo);
}
async function salvarMarcadas() {
  if (ed.ocupado) return;
  const alvos = alvosDosResultados();
  if (!alvos.length) return falar('Nada marcado. Marque com a barra de espaço, ou fique sobre uma foto, e aperte Alt S.');
  ed.ocupado = true;
  try {
    const salvas = [];
    for (const f of alvos) {
      const [W, H] = tamanhoFinal(f);
      const c = document.createElement('canvas');
      await desenharFoto(f, c, W, H, true);
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
      const dados = new Uint8Array(await blob.arrayBuffer());
      const r = await window.api.fotoSalvar({ dados, nome: nomeDeResultado(f) });
      if (!r.ok) throw new Error(r.erro);
      salvas.push({ f, r: r.valor, W, H });
    }
    const ids = new Set(salvas.map((s) => s.f.id));
    ed.trabalho = ed.trabalho.filter((f) => !ids.has(f.id));
    ed.fotos = ed.fotos.filter((f) => !ids.has(f.id));
    for (const s of salvas) liberarBmp(s.f.id);
    ids.forEach((i) => { ed.marcadas.delete(i); ed.resMarcadas.delete(i); });
    const pasta = salvas[0].r.pasta.split(/[\\/]/).pop();
    const t = salvas.length === 1
      ? `Salvei ${salvas[0].r.nome}, ${salvas[0].W} por ${salvas[0].H} pontos, na pasta ${pasta}, e tirei da lista.`
      : `Salvei ${salvas.length} fotos na pasta ${pasta} e tirei da lista.`;
    bipe('concluido');
    $('ed-salvo').textContent = t;
    ed.ultimoSalvo = salvas.map((s) => s.r.caminho);
    refazerResultados();
    falar(`${t} ${ed.trabalho.length ? plural(ed.trabalho.length, 'sobrou', 'sobraram') + '.' : ''}`.trim());
  } catch (e) { falar('Não consegui salvar. ' + (e.message || e)); } finally { ed.ocupado = false; }
}
function tirarMarcadas() {
  const alvos = alvosDosResultados();
  if (!alvos.length) return falar('Nada marcado. Marque com a barra de espaço, ou fique sobre uma foto, e aperte Delete.');
  const ids = new Set(alvos.map((f) => f.id));
  for (const f of alvos) f.params = {}; // volta ao que era, para poder trabalhar de novo
  ed.trabalho = ed.trabalho.filter((f) => !ids.has(f.id));
  ids.forEach((i) => ed.resMarcadas.delete(i));
  falar(`${plural(alvos.length, 'foto tirada', 'fotos tiradas')} da lista, sem salvar. A original não mudou.`);
  refazerResultados();
}
function voltarParaSelecao() {
  ed.marcadas = new Set(); ed.trabalho = [];
  mostrarTriagem(ed.fotos.length + ed.descartadas.length);
}
function outraCoisa() {
  if (!ed.trabalho.length) return falar('Não há fotos na lista. Volte à seleção.');
  mostrarAcoes();
}

async function descreverComGemma() {
  const el = $('ed-res-lista'), o = focoDaLista(el);
  if (!o) return falar('Fique sobre uma foto da lista e aperte Alt Q.');
  const f = ed.trabalho.find((x) => x.id === Number(o.dataset.id));
  if (!f) return;
  const [W, H] = tamanhoFinal(f);
  const k = Math.min(1, 1024 / Math.max(W, H));
  const c = document.createElement('canvas');
  await desenharFoto(f, c, Math.round(W * k), Math.round(H * k), true);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  const r = await window.api.quadroSalvar({ dados: new Uint8Array(await blob.arrayBuffer()) });
  if (!r.ok) return falar('Não consegui preparar a imagem. ' + r.erro);
  ed.ultimaDescricao = '';
  const contexto = descricaoDoResultado(f).map((i) => `${i.r}: ${i.t}`).join(' ');
  if (window.olho && window.olho.descreverQuadro) { const t = await window.olho.descreverQuadro(r.valor.caminho, contexto); if (typeof t === 'string' && t) ed.ultimaDescricao = t; }
}
async function copiarDescricao() {
  if (!ed.ultimaDescricao) return falar('Ainda não há descrição para copiar. Use Alt Q antes.');
  const r = await window.api.areaCopiar({ texto: ed.ultimaDescricao });
  falar(r && r.ok ? 'Descrição copiada.' : 'Não consegui copiar a descrição.');
}

// --- Entrada e saída da tela -------------------------------------------------------------------------------------------

async function escolherFotos(pasta) {
  if (ed.analisando) return;
  const r = pasta ? await window.api.editfotoEscolherpasta() : await window.api.editfotoEscolherfotos();
  if (!r || !r.ok || !r.valor) return falar(pasta ? 'Nenhuma pasta escolhida.' : 'Nenhuma foto escolhida.');
  await analisarPasta(r.valor);
}
function entrar() {
  ed.aberto = true;
  if (!ed.preparado) preparar();
  ed.preparado = true;
  // O foco vai para o botão, e não para o título: com o foco no título, o NVDA toma as setas e o Page Up e o Page Down.
  if (ed.etapa === 1 || !ed.fotos.length) { irPara(1); setTimeout(() => { if (ed.aberto && ed.etapa === 1) $('ed-fotos').focus(); }, 120); }
  falarDepois('Editar fotos. Escolha as fotos, ou uma pasta inteira.', 250);
}
function sair() { ed.aberto = false; }
function preparar() {
  ligarLista($('ed-lista')); ligarLista($('ed-diag-lista')); ligarLista($('ed-res-lista'));
  $('ed-fotos').addEventListener('click', () => escolherFotos(false));
  $('ed-pasta').addEventListener('click', () => escolherFotos(true));
  $('ed-cancelar').addEventListener('click', () => { ed.cancelar = true; });
  $('ed-e1-voltar').addEventListener('click', () => window.olho.mostrarTela('inicial'));
  $('ed-diag').addEventListener('click', () => {
    const l = $('ed-diag-lista');
    l.hidden = !l.hidden;
    if (!l.hidden) { const o = l.querySelector('.ed-opcao'); if (o) { o.focus(); falar(`${plural(ed.descartadas.length, 'foto descartada', 'fotos descartadas')}. Enter abre os motivos.`); } }
  });
  $('ed-continuar').addEventListener('click', continuarComMarcadas);
  $('ed-e2-voltar').addEventListener('click', () => irPara(1));
  $('ed-e3-voltar').addEventListener('click', () => { ed.trabalho.forEach((f) => { /* o que já foi aplicado fica até sair da lista */ }); voltarParaSelecao(); });
  $('ed-aplicar-fundo').addEventListener('click', aplicarFundo);
  $('ed-aplicar-formato').addEventListener('click', aplicarFormato);
  $('ed-aplicar-escrito').addEventListener('click', aplicarEscrito);
  $('ed-salvar').addEventListener('click', salvarMarcadas);
  $('ed-tirar').addEventListener('click', tirarMarcadas);
  $('ed-descrever').addEventListener('click', descreverComGemma);
  $('ed-copiar').addEventListener('click', copiarDescricao);
  $('ed-outra').addEventListener('click', outraCoisa);
  $('ed-abrir-pasta').addEventListener('click', async () => { const r = await window.api.pastaAbrir(); falar(r && r.ok ? 'Abrindo a pasta Olho da Cena.' : 'Não consegui abrir a pasta.'); });
  document.addEventListener('keydown', (e) => {
    if (!ed.aberto || $('tela-editfoto').hidden || document.querySelector('dialog[open]')) return;
    if (e.key === 'Delete' && !e.altKey && !e.ctrlKey && ed.etapa === 4) {
      const a = document.activeElement;
      if (a && a.closest && a.closest('#ed-res-lista')) { e.preventDefault(); e.stopImmediatePropagation(); tirarMarcadas(); }
      return;
    }
    if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey)) return;
    const acao = {
      KeyE: () => (ed.etapa === 1 ? escolherFotos(false) : falar('Alt E escolhe as fotos na primeira tela.')),
      KeyP: () => (ed.etapa === 1 ? escolherFotos(true) : falar('Alt P escolhe uma pasta inteira na primeira tela.')),
      KeyA: () => (ed.etapa === 2 ? continuarComMarcadas() : ed.etapa === 4 ? outraCoisa() : falar('Alt A continua nas telas de seleção e de resultados.')),
      KeyV: () => (ed.etapa === 1 ? window.olho.mostrarTela('inicial') : ed.etapa === 2 ? irPara(1) : voltarParaSelecao()),
      KeyS: () => (ed.etapa === 4 ? salvarMarcadas() : falar('Alt S salva na tela de resultados.')),
      KeyQ: () => (ed.etapa === 4 ? descreverComGemma() : falar('Alt Q descreve uma foto na tela de resultados.')),
      KeyC: () => (ed.etapa === 4 ? copiarDescricao() : falar('Alt C copia a descrição na tela de resultados.'))
    }[e.code];
    if (!acao) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) acao();
  }, true);
}

window.fotoEditarTela = { entrar, sair, estado: ed };
