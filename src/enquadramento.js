'use strict';
/**
 * Alt E: transforma o que os detectores acharam numa frase curta para o leitor de tela.
 *
 * Entrada (tudo normalizado de 0 a 1 em relação ao quadro já recortado no formato escolhido):
 *   rostos: [{ x, y, w, h, score }]   (caixa do detector de rostos: da sobrancelha ao queixo, mais ou menos)
 *   pose:   [{ x, y, v }] x 33, ou null  (pontos do corpo do MediaPipe; v = visibilidade)
 *   brilho: 0 a 255 (média da imagem)
 *   largura, altura: tamanho do quadro em pixels (para medir distâncias sem deformar)
 *
 * Direções: numa câmera que NÃO espelha (como uma foto tirada por outra pessoa), o rosto do
 * lado esquerdo da imagem está à DIREITA de quem está na frente da câmera. Muitas webcams
 * espelham (como um espelho): aí o lado esquerdo da imagem é a ESQUERDA da pessoa.
 * `espelhada: true` trata esse caso. As frases falam sempre do ponto de vista da pessoa.
 */

const P = { nariz: 0, olhoE: 2, olhoD: 5, orelhaE: 7, orelhaD: 8, ombroE: 11, ombroD: 12, cotoveloE: 13, cotoveloD: 14,
  punhoE: 15, punhoD: 16, quadrilE: 23, quadrilD: 24,
  joelhoE: 25, joelhoD: 26, tornozeloE: 27, tornozeloD: 28, calcanharE: 29, calcanharD: 30 };

const LIMITES = {
  centro: 0.08,      // até 8% do quadro para o lado ainda é "centralizado"
  bastante: 0.25,    // mais que isso é "bastante"
  baixo: 0.62,       // centro do rosto abaixo disso (só rosto/ombros) = rosto baixo na imagem
  pertoAltura: 0.5,  // rosto ocupando mais da metade da altura = muito perto
  pertoLargura: 0.6,
  longe: 0.09,       // rosto menor que 9% da altura (sem mostrar a cintura) = longe
  escuro: 50,
  muitoEscuro: 22,
  visivel: 0.6,
  visivelPernas: 0.8,
  visivelMao: 0.5,   // pontos da mão (punho, dedos) com pelo menos essa confiança
  visivelBraco: 0.3, // cotovelo e punho fora do quadro vêm com confiança mais baixa
  borda: 0.01,       // braço a menos de 1% da borda (ou além dela) = cortado
  // 1.2: medidas diretas da imagem (sem modelo treinado).
  estourado: 0.2,    // mais de 20% dos pontos no branco máximo (luma >= 250) = imagem estourada
  rostoEstourado: 228, // rosto com brilho médio acima disso = rosto estourado
  contraLuz: 55,     // fundo (média) pelo menos 55 mais claro que o rosto...
  contraLuzRosto: 95, // ...com o rosto abaixo de 95 = luz por trás
  desfocado: 40,     // variância do laplaciano (rosto, ou quadro, em 128x128) abaixo disso = desfocado
  tremorPasso: 1,    // deslocamento do fundo entre dois quadros (em pontos, quadro de 128 de largura)
  tremorPares: 0.6,  // tremendo se pelo menos 60% dos pares de quadros mexeram
  // 1.3.2: cabelo (modelo pronto hair_segmenter do MediaPipe; grade de 0 a 1 por célula).
  cabeloMinimo: 0.05,   // menos que isso de cabelo em volta da cabeça = não fala de cabelo
  cabeloNoRosto: 0.22,  // olhos, nariz e boca com mais que isso de cabelo = cabelo na frente do rosto
  cabeloEmCima: 2,      // 2 células ou mais de cabelo na linha de cima, na largura do rosto = cortado em cima
  cabeloLongo: 0.45     // cabelo descendo mais que 45% da altura do rosto abaixo do queixo = longo e solto
};

// Pontos da mão no modelo de pose: punho (15, 16), mindinho (17, 18), indicador (19, 20), polegar (21, 22).
const PONTOS_MAO = [15, 16, 17, 18, 19, 20, 21, 22];

function visivel(pt, margem = 0.01, minimo = LIMITES.visivel) {
  return !!pt && (pt.v === undefined || pt.v >= minimo) &&
    pt.x >= -margem && pt.x <= 1 + margem && pt.y >= -margem && pt.y <= 1 - margem;
}

/** Quanto do corpo aparece: rosto | ombros | peito | cintura | joelhos | inteiro | null. */
function faixaDoCorpo(pose, largura, altura) {
  if (!pose || pose.length < 33) return null;
  const ve = (i) => visivel(pose[i]);
  // Pernas: o modelo "adivinha" joelhos e pés escondidos com confiança média; exige mais certeza.
  const vp = (i) => visivel(pose[i], 0.01, LIMITES.visivelPernas);
  if (vp(P.tornozeloE) || vp(P.tornozeloD) || vp(P.calcanharE) || vp(P.calcanharD)) return 'inteiro';
  if (vp(P.joelhoE) || vp(P.joelhoD)) return 'joelhos';
  if (ve(P.quadrilE) || ve(P.quadrilD)) return 'cintura';
  const oe = pose[P.ombroE], od = pose[P.ombroD];
  if (visivel(oe) && visivel(od)) {
    const larguraOmbros = Math.hypot((oe.x - od.x) * largura, (oe.y - od.y) * altura);
    const abaixo = (1 - Math.max(oe.y, od.y)) * altura;
    // O peito (altura do mamilo) fica mais ou menos a 0,6 da largura dos ombros abaixo deles.
    return larguraOmbros > 0 && abaixo >= 0.6 * larguraOmbros ? 'peito' : 'ombros';
  }
  if (visivel(oe) || visivel(od)) return 'ombros';
  return 'rosto';
}

const FRASE_FAIXA = {
  rosto: 'Mostrando só o rosto.',
  ombros: 'Mostrando até os ombros.',
  peito: 'Mostrando até o peito.',
  cintura: 'Mostrando até a cintura.',
  joelhos: 'Mostrando até os joelhos.',
  inteiro: 'Mostrando o corpo inteiro.'
};

/** Quando o detector de rostos não acha nada, mas a pose vê nariz e olhos de frente. */
function rostoPelaPose(pose, largura, altura) {
  if (!pose || pose.length < 33) return null;
  const n = pose[P.nariz], oe = pose[P.olhoE], od = pose[P.olhoD];
  if (!(visivel(n, 0) && visivel(oe, 0) && visivel(od, 0))) return null;
  if ((n.v ?? 1) < 0.85 || (oe.v ?? 1) < 0.85 || (od.v ?? 1) < 0.85) return null;
  const re = pose[P.orelhaE], rd = pose[P.orelhaD];
  const lpx = visivel(re, 0) && visivel(rd, 0) ? Math.abs(re.x - rd.x) * largura : Math.abs(oe.x - od.x) * largura * 2.2;
  const w = lpx / largura, h = (lpx * 1.15) / altura;
  return { x: n.x - w / 2, y: n.y - h * 0.55, w, h, score: 0.5, pelaPose: true };
}

/**
 * Junta os rostos achados na imagem inteira e nos pedaços (para achar rostos pequenos, longe):
 * caixas que se sobrepõem são a mesma pessoa; fica a de maior confiança.
 */
function juntarRostos(listas, sobreposicao = 0.3) {
  const todos = listas.flat().filter((r) => r && r.w > 0 && r.h > 0).sort((a, b) => b.score - a.score);
  const ficam = [];
  const iou = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const i = ix * iy;
    return i / Math.min(a.w * a.h, b.w * b.h);
  };
  for (const r of todos) if (!ficam.some((f) => iou(f, r) > sobreposicao)) ficam.push(r);
  return ficam;
}

const NUMEROS = ['Nenhum', 'Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez'];

function quantosRostos(n) {
  if (n === 1) return 'Um rosto';
  return `${n <= 10 ? NUMEROS[n] : n} rostos`;
}

/**
 * Mão na frente do rosto: algum ponto da mão dentro da caixa do rosto (um pouco aumentada).
 * Sem caixa (a mão pode esconder o rosto do detector), usa o nariz da pose e a largura dos
 * ombros ou das orelhas para medir "perto do rosto".
 */
function maoNoRosto(pose, rosto, largura, altura) {
  if (!pose || pose.length < 33) return false;
  const maos = PONTOS_MAO.map((i) => pose[i]).filter((p) => p && (p.v === undefined || p.v >= LIMITES.visivelMao) &&
    p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  if (!maos.length) return false;
  if (rosto) {
    const mx = rosto.w * 0.1, my = rosto.h * 0.1;
    return maos.some((p) => p.x >= rosto.x - mx && p.x <= rosto.x + rosto.w + mx && p.y >= rosto.y - my && p.y <= rosto.y + rosto.h + my);
  }
  const n = pose[P.nariz];
  if (!n || !(n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1)) return false;
  const oe = pose[P.orelhaE], od = pose[P.orelhaD], se = pose[P.ombroE], sd = pose[P.ombroD];
  let raio = 0;
  if (oe && od) raio = Math.abs(oe.x - od.x) * largura * 0.75;
  if (!raio && se && sd) raio = Math.abs(se.x - sd.x) * largura * 0.3;
  if (!raio) return false;
  return maos.some((p) => Math.hypot((p.x - n.x) * largura, (p.y - n.y) * altura) <= raio);
}

/**
 * Braço cortado na lateral: com os ombros na imagem, o cotovelo ou o punho encostado na borda
 * da esquerda ou da direita, ou além dela (o modelo estima onde ficam os pontos fora do quadro).
 * Braço cortado embaixo é normal em quem aparece só até o peito: não conta.
 * Devolve os lados do ponto de vista da pessoa (coordenadas já sem espelho): 'direita', 'esquerda'.
 */
function bracosCortados(pose) {
  if (!pose || pose.length < 33) return [];
  const ombros = [pose[P.ombroE], pose[P.ombroD]].filter((o) => visivel(o, 0.01, 0.5));
  if (!ombros.length) return [];
  const lados = new Set();
  for (const i of [P.cotoveloE, P.cotoveloD, P.punhoE, P.punhoD]) {
    const p = pose[i];
    if (!p || (p.v !== undefined && p.v < LIMITES.visivelBraco)) continue;
    if (p.y < 0 || p.y > 1) continue; // fora por cima ou por baixo não é corte lateral
    if (p.x <= LIMITES.borda) lados.add('direita');      // lado esquerdo da imagem = direita da pessoa
    else if (p.x >= 1 - LIMITES.borda) lados.add('esquerda');
  }
  return ['direita', 'esquerda'].filter((l) => lados.has(l));
}

/** Monta a frase falada do Alt E. Devolve { texto, dados } (dados para os testes). */
/** Imagem espelhada: vira as coordenadas na horizontal, para os lados ficarem do ponto de vista da pessoa. */
function desespelhar(rostos, pose) {
  return {
    rostos: (rostos || []).map((r) => (r ? { ...r, x: 1 - r.x - r.w } : r)),
    pose: pose ? pose.map((p) => (p ? { ...p, x: 1 - p.x } : p)) : pose
  };
}

/**
 * 1.3.2: cabelo, a partir da grade do modelo de cabelo (cabelo: { grade, gw, gh }, valores 0 a 1,
 * linha por linha) e da caixa do rosto. Não fala de cabelo preso. Devolve null se não deu para ver cabelo.
 */
function analisarCabelo(cabelo, r) {
  if (!cabelo || !r || !cabelo.grade || !cabelo.gw || !cabelo.gh) return null;
  const { grade, gw, gh } = cabelo;
  const val = (cx, cy) => grade[cy * gw + cx] || 0;
  const col = (x) => Math.max(0, Math.min(gw - 1, Math.floor(x * gw)));
  const lin = (y) => Math.max(0, Math.min(gh - 1, Math.floor(y * gh)));
  const media = (xa, xb, ya, yb) => { let s = 0, n = 0; for (let y = lin(ya); y <= lin(yb); y++) for (let x = col(xa); x <= col(xb); x++) { s += val(x, y); n++; } return n ? s / n : 0; };
  // Só vale o cabelo em volta da cabeça (manchas longe dela são outra coisa).
  if (media(r.x - r.w * 0.3, r.x + r.w * 1.3, r.y - r.h * 0.6, r.y + r.h) < LIMITES.cabeloMinimo) return null;
  // Olhos, nariz e boca: o miolo da caixa do rosto.
  let s = 0, n = 0;
  for (let y = lin(r.y + r.h * 0.2); y <= lin(r.y + r.h * 0.75); y++) for (let x = col(r.x + r.w * 0.2); x <= col(r.x + r.w * 0.8); x++) { s += val(x, y); n++; }
  const noRosto = n > 0 && s / n > LIMITES.cabeloNoRosto;
  // Linha de cima, na largura do rosto: cabelo encostando na borda de cima.
  const x0 = col(r.x), x1 = col(r.x + r.w);
  let topo = 0;
  for (let x = x0; x <= x1; x++) if (val(x, 0) > 0.5) topo++;
  const emCima = topo >= LIMITES.cabeloEmCima;
  // Até onde o cabelo desce, dos lados do rosto (fora do miolo, para a barba não contar).
  // Desce linha a linha a partir do meio do rosto, enquanto o cabelo continua (sem pular buracos).
  let fundo = -1;
  const lados = [];
  for (let x = col(r.x - r.w * 0.7); x <= col(r.x + r.w * 1.7); x++) if (x < col(r.x + r.w * 0.15) || x > col(r.x + r.w * 0.85)) lados.push(x);
  for (let y = lin(r.y + r.h * 0.5); y < gh && lados.some((x) => val(x, y) > 0.5); y++) fundo = y;
  const abaixoDoQueixo = fundo < 0 ? 0 : ((fundo + 1) / gh - (r.y + r.h)) / r.h;
  const comprimento = abaixoDoQueixo > LIMITES.cabeloLongo ? 'longo' : 'curto';
  return { noRosto, emCima, comprimento, abaixoDoQueixo: Math.round(abaixoDoQueixo * 100) / 100 };
}

function espelharGrade(cabelo) {
  if (!cabelo || !cabelo.grade) return cabelo;
  const { grade, gw, gh } = cabelo;
  const g = new Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = grade[y * gw + (gw - 1 - x)];
  return { ...cabelo, grade: g };
}

function descreverEnquadramento({ rostos = [], pose = null, brilho = 128, brilhoRosto = null, largura = 1920, altura = 1080, espelhada = false, objetos = '',
  estourado = null, nitidez = null, tremendo = false, cabelo = null }) {
  if (espelhada) { ({ rostos, pose } = desespelhar(rostos, pose)); cabelo = espelharGrade(cabelo); }
  const partes = [];
  let lista = rostos.filter((r) => r && r.w > 0 && r.h > 0);
  if (!lista.length) {
    const r = rostoPelaPose(pose, largura, altura);
    if (r) lista = [r];
  }
  const faixa = faixaDoCorpo(pose, largura, altura);
  const dados = { rostos: lista.length, faixa, horizontal: null, cortado: [], distancia: null, escuro: brilho < LIMITES.escuro };

  if (!lista.length) {
    partes.push('Nenhum rosto.');
    if (faixa && faixa !== 'rosto') partes.push('Aparece uma pessoa, mas o rosto não foi encontrado: talvez de lado, de costas ou longe demais.');
  } else {
    // Fala sobre o maior rosto (quem está mais perto).
    const r = lista.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const dx = cx - 0.5; // negativo: rosto no lado esquerdo da imagem = à direita da pessoa
    let pos;
    if (Math.abs(dx) <= LIMITES.centro) { pos = 'centralizado'; dados.horizontal = 'centro'; } else {
      const muito = Math.abs(dx) > LIMITES.bastante;
      const ladoPessoa = dx < 0 ? 'direita' : 'esquerda';
      const irPara = dx < 0 ? 'esquerda' : 'direita';
      dados.horizontal = ladoPessoa;
      pos = `${muito ? 'bem deslocado' : 'um pouco deslocado'} para a sua ${ladoPessoa}. Vá ${muito ? '' : 'um pouco '}para a sua ${irPara}`;
    }
    partes.push(`${quantosRostos(lista.length)}${lista.length > 1 ? '. O mais perto está' : ','} ${pos}.`);

    // Cortes: o alto da cabeça fica uns 60% da caixa acima dela.
    const cortes = [];
    if (r.y - r.h * 0.6 < 0) cortes.push('em cima');
    if (r.x < 0.005) cortes.push('à sua direita');
    if (r.x + r.w > 0.995) cortes.push('à sua esquerda');
    if (r.y + r.h > 0.995) cortes.push('embaixo');
    dados.cortado = cortes;
    if (cortes.length) {
      const dica = cortes.includes('em cima') && cortes.length === 1 ? ' Incline a câmera um pouco para cima ou se afaste um pouco.' : '';
      partes.push(`Rosto cortado ${cortes.join(' e ')}.${dica}`);
    }

    // Distância.
    if (r.h > LIMITES.pertoAltura || r.w > LIMITES.pertoLargura) {
      dados.distancia = 'perto';
      partes.push('Muito perto da câmera: afaste-se um pouco.');
    } else if (r.h < LIMITES.longe && !['cintura', 'joelhos', 'inteiro'].includes(faixa)) {
      dados.distancia = 'longe';
      partes.push('Rosto pequeno, longe da câmera: chegue um pouco mais perto.');
    }

    // Rosto baixo demais quando só aparece rosto/ombros/peito.
    if (!cortes.includes('em cima') && cy > LIMITES.baixo && ['rosto', 'ombros', 'peito', null].includes(faixa)) {
      partes.push('Rosto baixo na imagem: incline a câmera um pouco para baixo.');
    }
  }
  // Corpo: mão na frente do rosto e braço cortado na lateral.
  const maior = lista.length ? lista.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a)) : null;
  dados.maoNoRosto = maoNoRosto(pose, maior, largura, altura);
  if (dados.maoNoRosto) partes.push('Mão na frente do rosto.');
  // 1.3.2: cabelo.
  dados.cabelo = analisarCabelo(cabelo, maior);
  if (dados.cabelo) {
    if (dados.cabelo.noRosto) partes.push('Cabelo na frente do rosto.');
    if (dados.cabelo.emCima && !dados.cortado.includes('em cima')) partes.push('Cabelo cortado em cima: incline a câmera um pouco para cima ou se afaste um pouco.');
    partes.push(dados.cabelo.comprimento === 'longo' ? 'Cabelo longo e solto.' : 'Cabelo curto.');
  }
  dados.bracoCortado = bracosCortados(pose);
  if (dados.bracoCortado.length) {
    const lados = dados.bracoCortado.length === 2 ? 'dos dois lados' : `à sua ${dados.bracoCortado[0]}`;
    partes.push(`Braço cortado na lateral, ${lados}: aproxime o braço do corpo ou se afaste um pouco.`);
  }
  if (lista.length && faixa) partes.push(FRASE_FAIXA[faixa]);
  // Fundo escuro com o rosto bem iluminado não é "ambiente escuro".
  const escuro = brilho < LIMITES.escuro && (brilhoRosto === null || brilhoRosto < LIMITES.escuro + 10);
  dados.escuro = escuro;
  if (escuro && brilho < LIMITES.muitoEscuro) partes.push('Ambiente muito escuro: quase nada aparece.');
  else if (escuro) partes.push('Ambiente escuro.');
  // 1.2: luz demais, luz por trás, desfoque e câmera tremendo.
  dados.estourada = !escuro && ((estourado !== null && estourado > LIMITES.estourado) || (brilhoRosto !== null && brilhoRosto > LIMITES.rostoEstourado));
  dados.contraLuz = !escuro && !dados.estourada && brilhoRosto !== null && brilhoRosto < LIMITES.contraLuzRosto && brilho - brilhoRosto > LIMITES.contraLuz;
  if (dados.estourada) partes.push('Luz demais: imagem estourada.');
  if (dados.contraLuz) partes.push('Luz por trás: o rosto está na sombra.');
  dados.desfocada = !escuro && nitidez !== null && nitidez < LIMITES.desfocado;
  if (dados.desfocada) partes.push('Imagem desfocada: limpe a lente ou verifique o foco.');
  dados.tremendo = !!tremendo;
  if (dados.tremendo) partes.push('Câmera tremendo.');
  if (objetos) partes.push(objetos);
  dados.espelhada = !!espelhada;
  return { texto: partes.join(' ').replace(/\s+/g, ' ').trim(), dados };
}

/**
 * Teste do espelho: com a mão DIREITA levantada (punho acima do ombro), onde ela aparece na imagem?
 * Numa câmera que não espelha, a mão direita fica do lado ESQUERDO da imagem (x menor que o do nariz).
 * Devolve true (espelhada), false (não espelhada) ou null (não deu para ver uma só mão levantada).
 * Usa só a posição na imagem, não o "lado" que o modelo dá ao ponto (que pode errar com espelho).
 */
function testarEspelho(pose) {
  if (!pose || pose.length < 33) return null;
  const nariz = pose[P.nariz];
  if (!visivel(nariz, 0)) return null;
  const ombroY = Math.min(...[pose[P.ombroE], pose[P.ombroD]].filter((o) => visivel(o, 0.05, 0.3)).map((o) => o.y), 2);
  const limite = ombroY < 2 ? ombroY : nariz.y + 0.1;
  const levantadas = [15, 16].map((i) => pose[i]).filter((p) => p && (p.v === undefined || p.v >= 0.5) && p.y < limite && p.y >= -0.02);
  if (levantadas.length !== 1) return null;
  const dx = levantadas[0].x - nariz.x;
  if (Math.abs(dx) < 0.03) return null;
  return dx > 0;
}

// --- 1.2: medidas diretas da imagem -------------------------------------------------------
// Todas recebem tons de cinza (0 a 255), um número por ponto, linha por linha.

/** Tons de cinza de um RGBA (ImageData.data). */
function cinza(rgba) {
  const g = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return g;
}

/** Fração dos pontos no branco máximo (estourados). */
function fracaoEstourada(g) {
  let n = 0;
  for (let i = 0; i < g.length; i++) if (g[i] >= 250) n++;
  return g.length ? n / g.length : 0;
}

/** Nitidez: variância do laplaciano (quanto mais baixo, mais borrado). Use um recorte de 128x128. */
function nitidezLaplaciano(g, w, h) {
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      s += l; s2 += l * l; n++;
    }
  }
  if (!n) return 0;
  const m = s / n;
  return s2 / n - m * m;
}

/**
 * Deslocamento do FUNDO entre dois quadros pequenos (ex.: 128 de largura), em pontos.
 * `fora(x, y)` diz quais pontos ficam de fora (a pessoa); assim mexer a cabeça não conta.
 */
function deslocamento(a, b, w, h, fora = null, raio = 4) {
  const custo = (dx, dy) => {
    let s = 0, n = 0;
    for (let y = raio; y < h - raio; y += 1) {
      for (let x = raio; x < w - raio; x += 1) {
        if (fora && fora(x / w, y / h)) continue;
        s += Math.abs(a[y * w + x] - b[(y + dy) * w + (x + dx)]); n++;
      }
    }
    return n ? s / n : 0;
  };
  const parado = custo(0, 0);
  let melhor = { dx: 0, dy: 0, c: parado };
  for (let dy = -raio; dy <= raio; dy++) for (let dx = -raio; dx <= raio; dx++) {
    if (!dx && !dy) continue;
    const c = custo(dx, dy);
    if (c < melhor.c) melhor = { dx, dy, c };
  }
  // Só conta se o deslocamento explica a diferença bem melhor que "parado" (não é só ruído da câmera).
  if (melhor.c > parado * 0.8) return 0;
  return Math.hypot(melhor.dx, melhor.dy);
}

/** Área da pessoa (a partir do rosto, para baixo), para tirar do cálculo do tremor. */
function areaDaPessoa(rosto) {
  if (!rosto) return null;
  const x0 = rosto.x - rosto.w * 0.8, x1 = rosto.x + rosto.w * 1.8, y0 = rosto.y - rosto.h * 0.8;
  return (x, y) => x >= x0 && x <= x1 && y >= y0;
}

/** Câmera tremendo: o fundo mexeu na maioria dos pares de quadros seguidos (um esbarrão só não conta). */
function cameraTremendo(quadros, w, h, rosto = null) {
  if (!quadros || quadros.length < 3) return { tremendo: false, passos: [] };
  const fora = areaDaPessoa(rosto);
  const passos = [];
  for (let i = 1; i < quadros.length; i++) passos.push(deslocamento(quadros[i - 1], quadros[i], w, h, fora));
  const mexeu = passos.filter((p) => p >= LIMITES.tremorPasso).length;
  return { tremendo: mexeu / passos.length >= LIMITES.tremorPares, passos };
}

module.exports = { descreverEnquadramento, analisarCabelo, cinza, fracaoEstourada, nitidezLaplaciano, deslocamento, cameraTremendo, areaDaPessoa, faixaDoCorpo, rostoPelaPose, juntarRostos, testarEspelho, desespelhar, maoNoRosto, bracosCortados, LIMITES, P };
