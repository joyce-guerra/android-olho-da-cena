'use strict';
/**
 * 1.8.2: Analisar fundo / Analisar vídeo / Alt E. Medidas de um quadro (rosto, luz, fundo, recorte)
 * e o diagnóstico em português. Funções puras: rodam no worker e nos testes. Tudo sem internet.
 */
const LIM = {
  escuro: 70, claro: 215, estourado: 0.15, sombraLado: 0.25,
  fundoBordas: 0.3, fundoCores: 70, mudaFundo: 80,
  rostoFundo: 70, misturaRoupa: 38, misturaCabelo: 32,
  halo: 3.5, cabeloFalha: Infinity /* 1.8.3: medida saturava até em vídeo bom; desligada */, corpoSome: 0.3,
  // 1.8.4: perto e longe iguais aos do Alt E (enquadramento.js: pertoAltura, pertoLargura, longe).
  longe: 0.09, perto: 0.5, pertoLargura: 0.6, desvio: 0.15, rostoMinimo: 0.5
};

const luz = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** rgba: quadro (w x h). mascara: pessoa 0..255 (mesmo tamanho) ou null. rosto: {x,y,w,h} 0..1 ou null.
 *  cabelo: {grade,gw,gh} ou null. */
function medirQuadro({ rgba, w, h, mascara = null, rosto = null, cabelo = null, original = null }) {
  // Luz do rosto e cor do cabelo: do quadro gravado (o fundo novo não muda a luz do rosto).
  const orig = original || rgba;
  const m = { rosto: rosto ? { ...rosto } : null };
  // Pessoa: a máscara; sem máscara, uma caixa em volta do rosto descendo até embaixo.
  const pessoa = (x, y) => {
    if (mascara) return mascara[y * w + x] / 255;
    if (!rosto) return 0;
    const fx = x / w, fy = y / h;
    return fx > rosto.x - rosto.w * 0.9 && fx < rosto.x + rosto.w * 1.9 && fy > rosto.y - rosto.h * 0.5 ? 1 : 0;
  };
  let sl = 0, n = 0, ll = 0, nl = 0, lr = 0, nr = 0, est = 0;
  let fb = 0, fn = 0, fr = 0, fg = 0, fbb = 0, fq = 0, bordas = 0;
  let rr = 0, rg = 0, rb = 0, rn = 0, area = 0, franja = 0, contorno = 0, dentroRosto = 0, nRosto = 0;
  const rx0 = rosto ? Math.max(0, Math.floor(rosto.x * w)) : 0, rx1 = rosto ? Math.min(w, Math.ceil((rosto.x + rosto.w) * w)) : 0;
  const ry0 = rosto ? Math.max(0, Math.floor(rosto.y * h)) : 0, ry1 = rosto ? Math.min(h, Math.ceil((rosto.y + rosto.h) * h)) : 0;
  const meio = (rx0 + rx1) / 2, queixo = rosto ? (rosto.y + rosto.h) * h : h;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4, L = luz(rgba, i), p = pessoa(x, y), Lo = original ? luz(orig, i) : L;
    sl += L; n++;
    if (mascara) {
      area += p > 0.5; if (p > 0.15 && p < 0.85) franja++;
      const k = y * w + x;
      if (mascara[k] >= 128 && (mascara[k - 1] < 128 || mascara[k + 1] < 128 || mascara[k - w] < 128 || mascara[k + w] < 128)) contorno++;
    }
    if (rosto && x >= rx0 && x < rx1 && y >= ry0 && y < ry1) {
      if (x < meio) { ll += Lo; nl++; } else { lr += Lo; nr++; }
      if (Lo > 245) est++;
      dentroRosto += p; nRosto++;
    } else if (p < 0.25) {
      fb += L; fn++; fr += rgba[i]; fg += rgba[i + 1]; fbb += rgba[i + 2]; fq += L * L;
      const gx = luz(rgba, i + 4) - luz(rgba, i - 4), gy = luz(rgba, i + w * 4) - luz(rgba, i - w * 4);
      if (Math.abs(gx) + Math.abs(gy) > 40) bordas++;
    }
    // 1.8.4: roupa numa caixa fixa no peito, abaixo do queixo, no quadro gravado (sem depender da máscara, que varia).
    if (rosto && x >= rx0 && x < rx1 && y > queixo + rosto.h * h * 0.4 && y < queixo + rosto.h * h * 1.2) { rr += orig[i]; rg += orig[i + 1]; rb += orig[i + 2]; rn++; }
  }
  m.brilho = sl / n;
  if (rosto && nl && nr) {
    m.luzEsq = ll / nl; m.luzDir = lr / nr; m.luzRosto = (ll + lr) / (nl + nr);
    m.estourado = est / (nl + nr);
    m.pessoaNoRosto = mascara ? dentroRosto / nRosto : null;
  }
  if (fn > 50) {
    m.luzFundo = fb / fn; m.corFundo = [fr / fn, fg / fn, fbb / fn];
    m.variacaoFundo = Math.sqrt(Math.max(0, fq / fn - m.luzFundo ** 2));
    m.bordasFundo = bordas / fn;
  }
  if (rn > 150) m.corRoupa = [rr / rn, rg / rn, rb / rn];
  // Halo: largura média, em pixels (no quadro de 384), da faixa incerta em volta da pessoa.
  // A borda suave normal dá 1 a 2 pixels; só uma faixa larga é contorno borrado de verdade.
  if (mascara) { m.area = area / n; m.halo = contorno >= 20 ? franja / contorno : 0; }
  if (cabelo && cabelo.grade && rosto) {
    let c = 0, falha = 0, cr = 0, cg = 0, cb = 0, cn = 0;
    for (let gy = 0; gy < cabelo.gh; gy++) for (let gx = 0; gx < cabelo.gw; gx++) {
      if (cabelo.grade[gy * cabelo.gw + gx] < 0.7) continue;
      const x = Math.min(w - 1, Math.floor((gx + 0.5) * w / cabelo.gw)), y = Math.min(h - 1, Math.floor((gy + 0.5) * h / cabelo.gh));
      c++; if (mascara && mascara[y * w + x] < 64) falha++;
      const i = (y * w + x) * 4; cr += orig[i]; cg += orig[i + 1]; cb += orig[i + 2]; cn++;
    }
    if (c >= 3) { m.cabeloFalha = mascara ? falha / c : null; m.corCabelo = [cr / cn, cg / cn, cb / cn]; }
  }
  return m;
}

const media = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const NOMES = ['no começo', 'no meio', 'no fim'];
function ondeAcontece(janelas, teste, fracao = 0.4) {
  const onde = janelas.map((j, k) => (j.length && j.filter(teste).length / j.length >= fracao ? NOMES[k] || '' : null)).filter(Boolean);
  if (!onde.length) return null;
  if (janelas.length === 1) return 'o vídeo todo';
  if (onde.length === janelas.length && janelas.length > 1) return 'o vídeo todo';
  return onde.join(' e ');
}

/**
 * 1.8.4: cada item vem com o que significa e se está ok, em palavras simples (para quem nunca viu).
 * nivel: ok | info | ajuste (dá pra continuar, vale um ajuste) | trocar (melhor trocar o fundo).
 * conserto: o que vale fazer (entra na conclusão). curto: frase curta para o Alt E.
 */
const item = (nivel, texto, conserto = '', curto = '') => ({ nivel, texto, conserto, curto: curto || texto });

/** janelas: [[medidas...], ...] (começo, meio, fim; ou uma só no Alt E). efeito: 'nenhum' | 'borrar' | 'substituir'. */
function diagnosticar(janelas, { efeito = 'nenhum', nomeFundo = '', avaliarRecorte = true } = {}) {
  const todos = janelas.flat(), valores = {};
  const comRosto = todos.filter((m) => m.rosto && m.luzRosto != null);
  const partes = { enquadre: [], luz: [], fundo: [], recorte: [] };
  if (!todos.length) return { texto: 'Não consegui ler o vídeo para analisar.', partes, conclusao: '' };
  // Rosto achado em menos da metade: nada de enquadre nem de luz no rosto (seriam medidas de poucos quadros).
  const rostoSeguro = comRosto.length >= todos.length * LIM.rostoMinimo;
  if (!rostoSeguro) {
    partes.enquadre.push(item('info', 'não consegui analisar o enquadre com segurança, porque achei seu rosto em menos da metade do vídeo. Isso não quer dizer que esteja errado; durante a gravação, o Alt E confere o enquadre'));
    partes.luz.push(item('info', 'não consegui avaliar a luz do rosto porque não achei seu rosto'));
  } else {
    const cx = media(comRosto.map((m) => m.rosto.x + m.rosto.w / 2)), alt = media(comRosto.map((m) => m.rosto.h)), larg = media(comRosto.map((m) => m.rosto.w));
    const topo = media(comRosto.map((m) => m.rosto.y)), base = media(comRosto.map((m) => m.rosto.y + m.rosto.h));
    const lados = media(comRosto.map((m) => Math.min(m.rosto.x, 1 - m.rosto.x - m.rosto.w)));
    if (topo < 0.01 || base > 0.99 || lados < 0.005) partes.enquadre.push(item('ajuste', 'seu rosto fica cortado na borda da imagem: uma parte dele não aparece. Vale se afastar um pouco ou ir para o centro', 'se afastar um pouco da câmera, para o rosto não ficar cortado', 'rosto cortado na borda da imagem'));
    else if (alt > LIM.perto || larg > LIM.pertoLargura) partes.enquadre.push(item('ajuste', 'seu rosto está muito perto da câmera: ocupa mais da metade da imagem. Vale se afastar um pouco', 'se afastar um pouco da câmera', 'rosto perto demais da câmera'));
    else if (alt < LIM.longe) partes.enquadre.push(item('ajuste', 'seu rosto está longe da câmera, pequeno na imagem: quem assiste vê pouco da sua expressão. Vale chegar mais perto', 'chegar mais perto da câmera', 'rosto longe da câmera'));
    if (cx < 0.5 - LIM.desvio || cx > 0.5 + LIM.desvio) {
      const lado = cx < 0.5 ? 'esquerda' : 'direita';
      partes.enquadre.push(item('ajuste', `seu rosto está mais para a ${lado} da imagem: não está no centro. Vale se mover um pouco para o centro`, 'ir um pouco para o centro da imagem', `rosto mais para a ${lado} da imagem`));
    }
    if (!partes.enquadre.length) partes.enquadre.push(item('ok', 'seu rosto está centralizado'));
    const lr = media(comRosto.map((m) => m.luzRosto)), est = media(comRosto.map((m) => m.estourado || 0));
    if (lr < LIM.escuro) partes.luz.push(item('ajuste', 'seu rosto está escuro, falta luz: quem assiste pode não ver bem sua expressão. Vale acender uma luz na sua frente', 'acender uma luz na sua frente', 'rosto escuro, falta luz'));
    else if (lr > LIM.claro || est > LIM.estourado) partes.luz.push(item('ajuste', 'a luz no seu rosto está forte demais: parte da pele fica branca, sem detalhe. Vale diminuir ou afastar a luz', 'diminuir ou afastar a luz do rosto', 'luz estourada no rosto, clara demais'));
    const e = media(comRosto.map((m) => m.luzEsq)), d = media(comRosto.map((m) => m.luzDir));
    if (Math.abs(e - d) / Math.max(1, e, d) > LIM.sombraLado) {
      const lado = e < d ? 'esquerdo' : 'direito';
      partes.luz.push(item('ajuste', `tem sombra no lado ${lado} do seu rosto, olhando a imagem: um lado fica mais escuro que o outro. Não impede o vídeo; se quiser, ponha uma luz desse lado`, `pôr uma luz no lado ${lado} do rosto`, `sombra no lado ${lado} do rosto, olhando a imagem`));
    }
    if (!partes.luz.length) partes.luz.push(item('ok', 'a luz no seu rosto está boa'));
  }
  const comFundo = todos.filter((m) => m.bordasFundo != null);
  if (comFundo.length) {
    const b = media(comFundo.map((m) => m.bordasFundo)), v = media(comFundo.map((m) => m.variacaoFundo));
    // Bagunça só no fundo de verdade: os fundos do app foram escolhidos para isso, e o borrado já some com os detalhes.
    if (efeito === 'nenhum' && (b > LIM.fundoBordas || v > LIM.fundoCores)) partes.fundo.push(item('ajuste', 'o fundo tem muitos objetos, cores ou contrastes: pode tirar a atenção de você. Vale borrar o fundo ou escolher um fundo do app', 'borrar o fundo ou escolher um fundo do app', 'fundo com muitos objetos, pode distrair'));
    if (efeito === 'nenhum' && janelas.length > 1) {
      const pri = janelas[0].filter((m) => m.corFundo), ult = janelas[janelas.length - 1].filter((m) => m.corFundo);
      if (pri.length && ult.length) {
        const a = [0, 1, 2].map((k) => media(pri.map((m) => m.corFundo[k]))), z = [0, 1, 2].map((k) => media(ult.map((m) => m.corFundo[k])));
        valores.muda = dist(a, z);
        if (dist(a, z) > LIM.mudaFundo) partes.fundo.push(item('ajuste', 'o fundo muda bastante do começo para o fim do vídeo, talvez a luz ou algo que passou atrás: quem assiste pode notar. Se não foi de propósito, vale conferir a luz do ambiente', 'conferir a luz do ambiente, que muda durante o vídeo', 'o fundo muda durante o vídeo'));
      }
    }
    if (efeito !== 'nenhum') {
      const lf = media(comFundo.map((m) => m.luzFundo)), lr = rostoSeguro ? media(comRosto.map((m) => m.luzRosto)) : null;
      if (lr != null && lr - lf > LIM.rostoFundo) partes.fundo.push(item('ok', 'seu rosto está bem mais claro que o fundo: você se destaca'));
      else if (lr != null && lf - lr > LIM.rostoFundo) partes.fundo.push(item('ajuste', 'seu rosto está bem mais escuro que o fundo: pode parecer que você está contra a luz, na sombra. Vale acender uma luz na sua frente ou escolher um fundo mais escuro', 'acender uma luz na sua frente ou escolher um fundo mais escuro, porque seu rosto está bem mais escuro que o fundo'));
      const cf = [0, 1, 2].map((k) => media(comFundo.map((m) => m.corFundo[k])));
      const ro0 = todos.filter((m) => m.corRoupa), ro = ro0.length >= todos.length * 0.5 ? ro0 : [], ca = todos.filter((m) => m.corCabelo);
      if (ro.length) valores.roupa = dist(cf, [0, 1, 2].map((k) => media(ro.map((m) => m.corRoupa[k]))));
      if (lr != null) valores.rostoFundo = lr - lf;
      if (ro.length && dist(cf, [0, 1, 2].map((k) => media(ro.map((m) => m.corRoupa[k])))) < LIM.misturaRoupa) partes.fundo.push(item('trocar', 'a cor do fundo é parecida com a da sua roupa: você se perde nele, isso atrapalha. Vale trocar o fundo ou a roupa', 'a cor dele é parecida com a da sua roupa'));
      if (ca.length && dist(cf, [0, 1, 2].map((k) => media(ca.map((m) => m.corCabelo[k])))) < LIM.misturaCabelo) partes.fundo.push(item('trocar', 'a cor do fundo é parecida com a do seu cabelo: o contorno da cabeça se perde, isso atrapalha. Vale trocar o fundo', 'a cor dele é parecida com a do seu cabelo'));
    }
    if (!partes.fundo.length) partes.fundo.push(item('ok', efeito === 'nenhum' ? 'o fundo é tranquilo, não distrai' : 'nada no fundo atrapalha'));
  }
  const avalia = efeito !== 'nenhum' && avaliarRecorte && todos.some((m) => m.area != null);
  if (avalia) {
    const halo = janelas.every((j) => j.length && j.filter((m) => m.halo > LIM.halo).length / j.length >= 0.7);
    if (halo) partes.recorte.push(item('trocar', 'o contorno em volta de você fica borrado no vídeo todo: o recorte aparece e chama atenção, isso atrapalha. Vale mais luz em você ou outro fundo', 'o contorno em volta de você fica borrado'));
    const cab = ondeAcontece(janelas, (m) => m.cabeloFalha != null && m.cabeloFalha > LIM.cabeloFalha, 0.7);
    if (cab) partes.recorte.push(item('ajuste', `o cabelo tem falhas ${cab === 'o vídeo todo' ? 'n' : ''}${cab}: partes do cabelo somem. Vale mais luz no cabelo`, 'mais luz no cabelo'));
    const some = janelas.map((j) => {
      const areas = j.filter((m) => m.area != null).map((m) => m.area).sort((a, b) => a - b);
      const med = areas[Math.floor(areas.length / 2)] || 0;
      return j.map((m) => ({ ...m, some: med > 0.02 && (m.area < med * (1 - LIM.corpoSome) || (m.pessoaNoRosto != null && m.pessoaNoRosto < 0.6)) }));
    });
    const sm = ondeAcontece(some, (m) => m.some);
    if (sm) partes.recorte.push(item('ajuste', `partes de você somem por instantes ${sm === 'o vídeo todo' ? 'n' : ''}${sm}: o recorte falha nesses momentos. Vale mais luz em você`, 'mais luz em você, para o recorte não falhar'));
    if (!partes.recorte.length) partes.recorte.push(item('ok', 'o contorno em volta de você está limpo'));
  }
  const todosItens = [...partes.recorte, ...partes.enquadre, ...partes.luz, ...partes.fundo];
  const trocar = todosItens.find((i) => i.nivel === 'trocar'), ajuste = todosItens.find((i) => i.nivel === 'ajuste');
  // 1.8.6: linhas boas ficam curtas (sem "isso está ok").
  const conclusao = trocar ? `Melhor trocar o fundo, porque ${trocar.conserto}.`
    : ajuste ? `Dá pra continuar, mas vale ${ajuste.conserto}.` : 'Pode continuar com este fundo.';
  const linha = (titulo, l) => (l.length ? `${titulo}: ${l.map((i) => i.texto).join('. Também, ')}. ` : '');
  let texto = `${conclusao} ${nomeFundo ? nomeFundo + '. ' : ''}`;
  texto += linha('Recorte', partes.recorte) + linha('Enquadre', partes.enquadre) + linha('Luz', partes.luz) + linha('Fundo', partes.fundo);
  return { texto: texto.trim(), partes, conclusao, valores };
}


/** Tempos de início das 3 janelas de 6 segundos (começo, meio, fim). */
function janelasDoVideo(duracao, seg = 6) {
  const d = Math.max(0, Number(duracao) || 0);
  if (d <= seg * 3) return [{ inicio: 0, duracao: d }];
  return [0, d / 2 - seg / 2, d - seg].map((i) => ({ inicio: Math.round(i * 1000) / 1000, duracao: seg }));
}

module.exports = { medirQuadro, diagnosticar, janelasDoVideo, LIM };
