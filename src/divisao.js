'use strict';
/**
 * 1.9.2: Dividir vídeo. Partes por tempo, orientação de cada parte e o pedaço da legenda que cai em
 * cada parte. Puro: funciona no Node (processo principal e testes) e no navegador (window.Divisao).
 */
(function (raiz) {
  // 2.0: cada orientação diz nome, indicação, contraindicação e descrição, como nas outras telas.
  const ORIENTACOES = [
    { valor: 'manter', nome: 'Manter como está',
      descricao: 'Indicação: Quando o vídeo já está no formato que você quer. Contraindicação: Quando o vídeo vai para uma rede que pede outro formato. Descrição: Só divide, sem mexer na imagem.' },
    { valor: 'horizontal', nome: 'Horizontal',
      descricao: 'Indicação: YouTube e vídeo para ver no computador ou na TV. Contraindicação: Vídeo vertical, que fica pequeno, numa faixa estreita no meio da tela. Descrição: Tela larga, 1920 por 1080.' },
    { valor: 'vertical', nome: 'Vertical, com o vídeo inteiro e fundo desfocado',
      descricao: 'Indicação: Shorts, Reels e TikTok, quando nada do vídeo pode ser cortado. Contraindicação: Vídeo horizontal quando a imagem precisa aparecer grande, porque ela fica numa faixa no meio da tela. Descrição: Tela alta, 1080 por 1920, com o vídeo inteiro no meio e um fundo desfocado em cima e embaixo.' },
    { valor: 'vertical-cheio', nome: 'Vertical, preenchendo a tela, cortando as laterais',
      descricao: 'Indicação: Shorts, Reels e TikTok com a pessoa ou o assunto no centro da imagem. Contraindicação: Vídeo com legenda, título ou coisas importantes nas bordas, porque as laterais somem. Descrição: Tela alta, 1080 por 1920, com a imagem ampliada até encher a tela.' },
    { valor: 'quadrado', nome: 'Quadrado, com o vídeo inteiro e fundo desfocado',
      descricao: 'Indicação: Feed do Instagram e do Facebook e carrossel. Contraindicação: YouTube, shorts e stories. Descrição: Tela quadrada, 1080 por 1080, com o vídeo inteiro no meio e fundo desfocado nas sobras.' }
  ];
  const TAMANHOS = { horizontal: [1920, 1080], vertical: [1080, 1920], 'vertical-cheio': [1080, 1920], quadrado: [1080, 1080] };

  /** "1:30", "1,5", "90s"... em segundos. 0 vale (só muda a orientação). null se não entender. */
  function lerTempo(texto) {
    const t = String(texto == null ? '' : texto).trim().replace(/\s+/g, '').replace(/s$/i, '');
    if (!t) return null;
    const num = (s) => (/^\d+([.,]\d+)?$/.test(s) ? parseFloat(s.replace(',', '.')) : NaN);
    if (!t.includes(':')) { const m = num(t); return isFinite(m) && m >= 0 ? m * 60 : null; }
    const p = t.split(':').map(num);
    if (p.length > 3 || p.some((v) => !isFinite(v))) return null;
    const [h, m, s] = p.length === 3 ? p : [0, ...p];
    return h * 3600 + m * 60 + s;
  }

  /**
   * Partes de no máximo `tamanho` segundos, todas iguais, menos a última: se a sobra for pequena
   * (menos da metade de uma parte), ela entra na última, que fica um pouco maior; senão, vira a
   * última parte, um pouco menor. tamanho 0: uma parte só (o vídeo inteiro).
   */
  function planejarPartes(duracao, tamanho) {
    const d = Math.max(0, Number(duracao) || 0);
    if (!tamanho || tamanho >= d) return [{ inicio: 0, fim: d }];
    let n = Math.floor(d / tamanho);
    const sobra = d - n * tamanho;
    if (sobra >= tamanho / 2) n++;
    const partes = [];
    for (let i = 0; i < n; i++) partes.push({ inicio: i * tamanho, fim: i === n - 1 ? d : (i + 1) * tamanho });
    return partes;
  }

  const formatoDe = (w, h) => (w > h * 1.1 ? 'horizontal' : h > w * 1.1 ? 'vertical' : 'quadrado');

  /** Filtro do FFmpeg ([0:v] para [v]) e o tamanho de saída, para a orientação escolhida. */
  function filtroOrientacao(orientacao, w, h) {
    if (!TAMANHOS[orientacao]) {
      const W = Math.max(2, Math.round(w / 2) * 2), H = Math.max(2, Math.round(h / 2) * 2);
      return { filtro: `[0:v]scale=${W}:${H},setsar=1,format=yuv420p[v]`, largura: W, altura: H };
    }
    const [W, H] = TAMANHOS[orientacao];
    if (orientacao === 'vertical-cheio') {
      return { filtro: `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[v]`, largura: W, altura: H };
    }
    return {
      filtro: `[0:v]split=2[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:2,eq=brightness=-0.08[fundo];` +
        `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[meio];[fundo][meio]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]`,
      largura: W, altura: H
    };
  }

  /** Avisos antes de mudar a orientação, quando o resultado tende a ficar ruim. */
  function avisosOrientacao(orientacao, w, h, temLegenda) {
    const avisos = [];
    const atual = formatoDe(w, h);
    const alvo = orientacao === 'vertical-cheio' ? 'vertical' : orientacao;
    if (orientacao === 'manter') return avisos;
    if (alvo === atual && orientacao !== 'vertical-cheio') avisos.push(`O vídeo já é ${atual}: a orientação não muda.`);
    if (atual === 'vertical' && alvo === 'horizontal') avisos.push('Um vídeo vertical na horizontal fica pequeno, numa faixa estreita no meio da tela.');
    if (atual === 'horizontal' && orientacao === 'vertical') avisos.push('Um vídeo horizontal no vertical inteiro fica numa faixa no meio da tela, com bastante fundo desfocado em cima e embaixo.');
    if (atual === 'horizontal' && orientacao === 'vertical-cheio') avisos.push('Preenchendo a tela, as laterais do vídeo são cortadas: o que estiver nas bordas some.');
    if (Math.min(w, h) < 700) avisos.push('A imagem original é pequena: no tamanho novo, ela pode ficar sem nitidez.');
    if (temLegenda && orientacao === 'vertical-cheio') avisos.push('Parece ter legenda: ela pode ficar cortada no formato vertical.');
    else if (temLegenda && alvo !== atual) avisos.push('Parece ter legenda: no formato novo, ela fica menor.');
    return avisos;
  }

  /** As legendas que caem no trecho, com os tempos a partir do começo do trecho. */
  function legendasDoTrecho(legendas, inicio, fim) {
    return legendas
      .filter((c) => c.fim > inicio + 0.05 && c.inicio < fim - 0.05)
      .map((c) => ({ inicio: Math.max(0, c.inicio - inicio), fim: Math.min(fim, c.fim) - inicio, texto: c.texto }));
  }

  const api = { ORIENTACOES, lerTempo, planejarPartes, filtroOrientacao, avisosOrientacao, legendasDoTrecho, formatoDe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Divisao = api;
})(typeof window !== 'undefined' ? window : globalThis);
