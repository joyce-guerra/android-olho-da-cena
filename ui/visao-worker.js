'use strict';
/* Gravador de Vídeo (teste): detecção (Alt E) e segmentação (Melhorar) num worker,
   para a gravação e a tela não travarem enquanto o MediaPipe trabalha. Tudo sem internet. */

function carregarCommonJS(url, nome) {
  importScripts(`${url}?cjs=${nome}`);
  return self.__modulos[nome];
}
const V = carregarCommonJS('vision_bundle.cjs', 'visao');
const EQ = carregarCommonJS('../src/enquadramento.js', 'enquadramento');
importScripts('mascara.js');
const DG = carregarCommonJS('../src/diagnostico.js', 'diagnostico');

const VISAO = '../visao/';
const FILESET = { wasmLoaderPath: VISAO + 'wasm/vision_wasm_internal.js', wasmBinaryPath: VISAO + 'wasm/vision_wasm_internal.wasm' };
const MODELO_SEGMENTACAO = 'selfie_segmenter.tflite';
// Objetos do Alt E (rótulos COCO; os nomes em português ficam em src/objetos.js).
const MODELO_OBJETOS = 'efficientdet_lite0_float16.tflite'; // escolhido em test/e2e/comparar-objetos.js
const CONFIANCA_OBJETOS = 0.3; // o corte de verdade (0,5 ou mais) é feito em src/objetos.js

const detectoresObjetos = new Map();
function carregarObjetos(modelo = MODELO_OBJETOS) {
  if (!detectoresObjetos.has(modelo)) {
    const p = V.ObjectDetector.createFromOptions(FILESET, {
      baseOptions: { modelAssetPath: VISAO + 'modelos/' + modelo, delegate: 'CPU' },
      runningMode: 'IMAGE', scoreThreshold: CONFIANCA_OBJETOS, maxResults: 25
    });
    p.catch(() => detectoresObjetos.delete(modelo));
    detectoresObjetos.set(modelo, p);
  }
  return detectoresObjetos.get(modelo);
}
function detectarObjetos(detector, img) {
  return detector.detect(img).detections.map((d) => {
    const c = d.categories && d.categories[0];
    return { rotulo: c ? c.categoryName : '', score: c ? c.score : 0,
      x: d.boundingBox.originX / img.width, y: d.boundingBox.originY / img.height,
      w: d.boundingBox.width / img.width, h: d.boundingBox.height / img.height };
  });
}

let deteccao = null;
function carregarDeteccao() {
  if (!deteccao) {
    deteccao = (async () => {
      const rosto = await V.FaceDetector.createFromOptions(FILESET, {
        baseOptions: { modelAssetPath: VISAO + 'modelos/blaze_face_short_range.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE', minDetectionConfidence: 0.5
      });
      const pose = await V.PoseLandmarker.createFromOptions(FILESET, {
        baseOptions: { modelAssetPath: VISAO + 'modelos/pose_landmarker_full.task', delegate: 'CPU' },
        runningMode: 'IMAGE', numPoses: 1
      });
      const objetos = await carregarObjetos().catch(() => null); // sem o detector de objetos, o resto continua
      // 1.3.2: modelo pronto de cabelo (MediaPipe hair_segmenter, sem treino). Sem ele, o resto continua.
      const cabelo = await V.ImageSegmenter.createFromOptions(FILESET, {
        baseOptions: { modelAssetPath: VISAO + 'modelos/hair_segmenter.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false
      }).catch(() => null);
      return { rosto, pose, objetos, cabelo };
    })();
    deteccao.catch(() => { deteccao = null; });
  }
  return deteccao;
}

function brilhoMedio(fonte, sx = 0, sy = 0, sw = fonte.width, sh = fonte.height) {
  const c = new OffscreenCanvas(32, 32);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(fonte, sx, sy, sw, sh, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 32).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return s / (d.length / 4);
}

/** Pedaço (px, py, pw, ph em 0..1) da imagem, como ImageData. */
function pedaco(ctx, W, H, px, py, pw, ph) {
  const w = Math.round(pw * W), h = Math.round(ph * H);
  if (w < 4 || h < 4) return null;
  return ctx.getImageData(Math.round(px * W), Math.round(py * H), w, h);
}

function detectarRostos(detector, img, px, py, pw, ph, minimo) {
  if (!img) return [];
  return detector.detect(img).detections.map((d) => ({
    x: px + (d.boundingBox.originX / img.width) * pw, y: py + (d.boundingBox.originY / img.height) * ph,
    w: (d.boundingBox.width / img.width) * pw, h: (d.boundingBox.height / img.height) * ph,
    score: d.categories && d.categories[0] ? d.categories[0].score : 1
  })).filter((r) => r.score >= minimo);
}

/** Pedaço da imagem reduzido para pw x ph (RGBA). */
function cinzaPequeno(fonte, sx, sy, sw, sh, pw, ph) {
  const c = new OffscreenCanvas(pw, ph);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(fonte, sx, sy, sw, sh, 0, 0, pw, ph);
  return ctx.getImageData(0, 0, pw, ph).data;
}

async function analisar({ bitmap, largura, altura, sequencia }) {
  const visao = await carregarDeteccao();
  const W = bitmap.width, H = bitmap.height;
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const inteira = ctx.getImageData(0, 0, W, H);
  // Rostos: na imagem inteira e em 6 pedaços sobrepostos, para achar também rostos pequenos (longe).
  const listas = [detectarRostos(visao.rosto, inteira, 0, 0, 1, 1, 0.5)];
  for (const [px, py] of [[0, 0], [0.275, 0], [0.55, 0], [0, 0.4], [0.275, 0.4], [0.55, 0.4]]) {
    listas.push(detectarRostos(visao.rosto, pedaco(ctx, W, H, px, py, 0.45, 0.6), px, py, 0.45, 0.6, 0.7));
  }
  const rostos = EQ.juntarRostos(listas);
  const pr = visao.pose.detect(inteira);
  const pose = pr.landmarks && pr.landmarks[0] ? pr.landmarks[0].map((p) => ({ x: p.x, y: p.y, v: p.visibility })) : null;
  const brilho = brilhoMedio(c);
  let brilhoRosto = null;
  if (rostos.length) {
    const g = rostos.reduce((x, y) => (y.w * y.h > x.w * x.h ? y : x));
    const x0 = Math.max(0, g.x), y0 = Math.max(0, g.y);
    const x1 = Math.min(1, g.x + g.w), y1 = Math.min(1, g.y + g.h);
    if ((x1 - x0) * W >= 4 && (y1 - y0) * H >= 4) brilhoRosto = brilhoMedio(c, x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H);
  }
  let objetos = [];
  if (visao.objetos) { try { objetos = detectarObjetos(visao.objetos, inteira); } catch (_) { objetos = []; } }
  // 1.2: luz demais, desfoque e tremor (medidas diretas da imagem).
  const maior = rostos.length ? rostos.reduce((x, y) => (y.w * y.h > x.w * x.h ? y : x)) : null;
  const estourado = EQ.fracaoEstourada(EQ.cinza(cinzaPequeno(c, 0, 0, W, H, 128, Math.max(2, Math.round(128 * H / W)))));
  const area = maior ? [Math.max(0, maior.x) * W, Math.max(0, maior.y) * H, Math.min(1 - Math.max(0, maior.x), maior.w) * W, Math.min(1 - Math.max(0, maior.y), maior.h) * H] : null;
  // Só no rosto: uma parede lisa sem rosto pareceria "desfocada" (sem detalhe para medir).
  const nitidez = maior && area[2] >= 16 && area[3] >= 16 ? EQ.nitidezLaplaciano(EQ.cinza(cinzaPequeno(c, ...area, 128, 128)), 128, 128) : null;
  let tremendo = false;
  if (Array.isArray(sequencia) && sequencia.length >= 3) {
    const qw = 128, qh = Math.max(8, Math.round(128 * H / W));
    const quadros = sequencia.map((b) => { const g = EQ.cinza(cinzaPequeno(b, 0, 0, b.width, b.height, qw, qh)); b.close(); return g; });
    tremendo = EQ.cameraTremendo(quadros, qw, qh, maior).tremendo;
  }
  let cabelo = null;
  if (visao.cabelo) { try { cabelo = gradeCabelo(visao.cabelo, c, W, H); } catch (_) { cabelo = null; } }
  return { rostos, pose, brilho, brilhoRosto, largura, altura, objetos, estourado, nitidez, tremendo, cabelo };
}

/** 1.3.2: máscara do cabelo reduzida a uma grade de 48 colunas (0 a 1 por célula). */
function gradeCabelo(seg, fonte, W, H) {
  const lw = 256, lh = Math.max(16, Math.round(256 * H / W));
  const c = new OffscreenCanvas(lw, lh);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(fonte, 0, 0, W, H, 0, 0, lw, lh);
  const r = seg.segment(ctx.getImageData(0, 0, lw, lh));
  const ms = r.confidenceMasks || [];
  const m = ms.length > 1 ? ms[1] : ms[0];
  if (!m) { for (const x of ms) x.close(); return null; }
  const f = m.getAsFloat32Array(), mw = m.width, mh = m.height;
  for (const x of ms) x.close();
  const gw = 48, gh = Math.max(8, Math.round(48 * H / W));
  const soma = new Float32Array(gw * gh), cont = new Float32Array(gw * gh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const i = Math.min(gh - 1, Math.floor(y * gh / mh)) * gw + Math.min(gw - 1, Math.floor(x * gw / mw));
    soma[i] += f[y * mw + x]; cont[i]++;
  }
  const grade = Array.from(soma, (v, i) => Math.round((cont[i] ? v / cont[i] : 0) * 100) / 100);
  return { grade, gw, gh };
}

/** Só para os testes: compara modelos de objetos numa imagem. */
async function objetosTeste({ bitmap, modelo }) {
  const d = await carregarObjetos(modelo);
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const t = performance.now();
  const objetos = detectarObjetos(d, img);
  return { objetos, ms: performance.now() - t };
}

// --- Segmentação (Melhorar) ---------------------------------------------------------

let segmentador = null;
let seg = { anterior: null, ts: 0 };
async function segmentarIniciar() {
  if (!segmentador) {
    segmentador = V.ImageSegmenter.createFromOptions(FILESET, {
      baseOptions: { modelAssetPath: VISAO + 'modelos/' + MODELO_SEGMENTACAO, delegate: 'CPU' },
      runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false
    });
    segmentador.catch(() => { segmentador = null; });
  }
  await segmentador;
  seg = { anterior: null, ts: seg.ts + 1000 };
  return true;
}

async function segmentar({ dados, w, h }) {
  const s = await segmentador;
  const img = new ImageData(new Uint8ClampedArray(dados), w, h);
  seg.ts += 33;
  let pessoa = null;
  s.segmentForVideo(img, seg.ts, (r) => {
    const ms = r.confidenceMasks || [];
    // Modelo de uma classe (pessoa). Se um dia for o de várias classes, a primeira é o fundo: pessoa = 1 - fundo.
    if (ms.length > 1) { const f = ms[0].getAsFloat32Array(); pessoa = new Float32Array(f.length); for (let i = 0; i < f.length; i++) pessoa[i] = 1 - f[i]; }
    else if (ms.length === 1) pessoa = Float32Array.from(ms[0].getAsFloat32Array());
    for (const m of ms) m.close();
  });
  if (!pessoa) throw new Error('A segmentação não devolveu máscara.');
  if (!seg.anterior) seg.anterior = Float32Array.from(pessoa);
  const saida = new Uint8Array(pessoa.length);
  self.Mascara.suavizarMascara(seg.anterior, pessoa, saida);
  return saida;
}

// --- 1.8.2: Analisar fundo / Analisar vídeo / Alt E ------------------------------------------

// 1.8.3: telas reaproveitadas (uma por uso), sempre na memória (willReadFrequently). Criar telas novas a
// cada quadro gastava a memória de vídeo e o WebGL do MediaPipe se perdia: rosto sumia e a máscara piorava.
const telas = new Map();
function tela(nome, w, h) {
  let t = telas.get(nome);
  if (!t || t.c.width !== w || t.c.height !== h) {
    const c = new OffscreenCanvas(w, h);
    t = { c, ctx: c.getContext('2d', { willReadFrequently: true }) };
    telas.set(nome, t);
  }
  return t;
}

/** Rosto: na imagem inteira e em 6 pedaços sobrepostos (como no Alt E), para achar também rosto pequeno. */
function maiorRosto(det, img) {
  const { ctx } = tela('rosto', img.width, img.height);
  ctx.putImageData(img, 0, 0);
  const listas = [detectarRostos(det, img, 0, 0, 1, 1, 0.5)];
  for (const [px, py] of [[0, 0], [0.275, 0], [0.55, 0], [0, 0.4], [0.275, 0.4], [0.55, 0.4]]) {
    listas.push(detectarRostos(det, pedaco(ctx, img.width, img.height, px, py, 0.45, 0.6), px, py, 0.45, 0.6, 0.7));
  }
  const r = EQ.juntarRostos(listas);
  return r.length ? r.reduce((x, y) => (y.w * y.h > x.w * x.h ? y : x)) : null;
}

/** Fundo borrado como no Melhorar: reduz, borra e amplia. */
function borrado(img, w, h) {
  const a = tela('borrar-a', w, h); a.ctx.putImageData(img, 0, 0);
  const pw = Math.max(4, Math.round(w / 6)), ph = Math.max(4, Math.round(h / 6));
  const b = tela('borrar-b', pw, ph);
  b.ctx.filter = 'blur(2px)'; b.ctx.clearRect(0, 0, pw, ph); b.ctx.drawImage(a.c, 0, 0, pw, ph); b.ctx.filter = 'none';
  const c = tela('borrar-c', w, h);
  c.ctx.drawImage(b.c, 0, 0, w, h);
  return c.ctx.getImageData(0, 0, w, h).data;
}

/** janelas: [[ArrayBuffer RGBA]], efeito: nenhum | borrar | substituir, imagemFundo: ArrayBuffer ou null. */
async function diagnosticarJanelas({ janelas, w, h, efeito = 'nenhum', imagemFundo = null, comMascara = true, rostos = null, rw = 0, rh = 0, rostoFixo = null }) {
  // O segmentador é criado antes dos modelos de detecção (criado depois, falha em algumas placas de vídeo).
  if (comMascara) await segmentarIniciar();
  const visao = await carregarDeteccao();
  const fundo = imagemFundo ? new Uint8ClampedArray(imagemFundo) : null;
  const saida = [];
  // Duas passadas por trecho: primeiro todas as máscaras, depois rosto e cabelo
  // (alternar os modelos a cada quadro trava o WebGL em algumas máquinas).
  for (let jn = 0; jn < janelas.length; jn++) {
    const j = janelas[jn];
    const quadros = j.map((buf) => new Uint8ClampedArray(buf));
    const mascaras = [];
    if (comMascara) {
      await segmentarIniciar();
      
      for (const d of quadros) { mascaras.push(await segmentar({ dados: d.slice().buffer, w, h })); }
    }
    const medidas = [];
    for (let q = 0; q < quadros.length; q++) {
      const dados = quadros[q], mascara = mascaras[q] || null;
      // O rosto vem do quadro original (é o mesmo lugar com qualquer fundo).
      // 1.8.4: rosto no quadro maior, como no Alt E (posição de 0 a 1 vale para os dois tamanhos).
      const grande = rostos && rostos[jn] && rostos[jn][q] ? new ImageData(new Uint8ClampedArray(rostos[jn][q]), rw, rh) : null;
      const rosto = rostoFixo || maiorRosto(visao.rosto, grande || new ImageData(dados, w, h));
      let img = new ImageData(dados, w, h);
      if (efeito !== 'nenhum' && mascara) {
        const f = efeito === 'substituir' && fundo ? fundo : borrado(img, w, h);
        const o = new Uint8ClampedArray(dados.length);
        for (let i = 0, k = 0; i < o.length; i += 4, k++) {
          const a = mascara[k] / 255;
          o[i] = f[i] + (dados[i] - f[i]) * a; o[i + 1] = f[i + 1] + (dados[i + 1] - f[i + 1]) * a;
          o[i + 2] = f[i + 2] + (dados[i + 2] - f[i + 2]) * a; o[i + 3] = 255;
        }
        img = new ImageData(o, w, h);
      }
      let cabelo = null;
      if (visao.cabelo && rosto) {
        const t = tela('cabelo', w, h); t.ctx.putImageData(new ImageData(dados, w, h), 0, 0);
        try { cabelo = gradeCabelo(visao.cabelo, t.c, w, h); } catch (_) { cabelo = null; }
      }
      medidas.push(DG.medirQuadro({ rgba: img.data, w, h, mascara, rosto, cabelo, original: img.data === dados ? null : dados }));
    }
    saida.push(medidas);
  }
  return saida;
}

/** 2.0.7: só o rosto maior, rápido, para a prévia seguir a pessoa no vertical e no quadrado. */
async function rostoRapido({ bitmap }) {
  const visao = await carregarDeteccao();
  const W = bitmap.width, H = bitmap.height;
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const lista = detectarRostos(visao.rosto, ctx.getImageData(0, 0, W, H), 0, 0, 1, 1, 0.5);
  if (!lista.length) return null;
  const g = lista.reduce((x, y) => (y.w * y.h > x.w * x.h ? y : x));
  return { x: g.x, y: g.y, w: g.w, h: g.h };
}

/** 3.0.4: todos os rostos de uma foto, em medidas de 0 a 1, para a triagem do Editar fotos. */
async function todosOsRostos({ bitmap }) {
  const visao = await carregarDeteccao();
  const W = bitmap.width, H = bitmap.height;
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return detectarRostos(visao.rosto, ctx.getImageData(0, 0, W, H), 0, 0, 1, 1, 0.6).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
}

const tarefas = { todosOsRostos, rostoRapido, carregar: () => carregarDeteccao().then(() => true), analisar, segmentarIniciar, segmentar, objetosTeste, diagnosticarJanelas };
self.onmessage = async (ev) => {
  const { id, tipo, dados } = ev.data;
  try {
    const valor = await tarefas[tipo](dados || {});
    const transferir = valor instanceof Uint8Array ? [valor.buffer] : [];
    self.postMessage({ id, ok: true, valor }, transferir);
  } catch (e) {
    self.postMessage({ id, ok: false, erro: ((e && e.message) || String(e)) });
  }
};
