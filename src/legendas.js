'use strict';
/**
 * 1.9: tela de legenda. Estilos de legenda ("Pra onde é esse vídeo?"), divisão das palavras do
 * Whisper em legendas, ajuste de um SRT trazido de fora e o arquivo ASS que o FFmpeg queima no vídeo.
 * Puro: funciona no Node (processo principal e testes) e no navegador (window.Legendas).
 *
 * Regra de todos os estilos: título e logo ficam sempre em cima, então nenhuma legenda usa a
 * parte de cima do vídeo.
 */
(function (raiz) {
  /**
   * Cada estilo: textos para a pessoa escolher (para que serve, pontos fortes, quando evitar),
   * a divisão das legendas e o desenho. Tamanhos em fração do menor lado do vídeo; distâncias
   * verticais em fração da altura. Cores no formato do ASS, &HAABBGGRR, com AA 00 = opaco.
   */
  const ESTILOS = [
    {
      id: 'youtube',
      nome: 'Vídeo horizontal de até uns 10 minutos, para o YouTube',
      uso: 'Para vídeos gravados na horizontal, de até uns 10 minutos.',
      fortes: 'Legenda embaixo, centralizada, com letra média sobre um fundo escuro suave. Fica fácil de ler em qualquer imagem e ajuda quem assiste sem som ou tem dificuldade para ouvir.',
      evitar: 'Em vídeo vertical, porque embaixo ficam os botões da plataforma. Em imagem com detalhe importante na parte de baixo, porque o fundo escuro cobre um pedaço dela.',
      divisao: { caracteresPorLinha: 42, linhas: 2, palavrasMax: null, duracaoMin: 1, duracaoMax: 6, pausa: 0.8 },
      desenho: { fonte: 0.05, negrito: false, cor: '&H00FFFFFF', caixa: '&H50000000', contorno: 0, sombra: 0, folgaCaixa: 0.012, margemBaixo: 0.06, margemLados: 0.08 }
    },
    {
      id: 'shorts',
      nome: 'Shorts e Reels, vídeo vertical',
      uso: 'Para vídeos verticais e curtos, no Shorts, no Reels ou no TikTok.',
      fortes: 'Frases curtas, de 2 a 4 palavras, com letra grande e em negrito, um pouco acima do meio da tela, onde os botões e a descrição da plataforma não cobrem. Prende a atenção de quem rola a tela sem som.',
      evitar: 'Em vídeo horizontal e em fala longa, porque as frases trocam rápido e cansam quem lê por vários minutos. Também pode passar na frente do rosto, se ele estiver no meio da tela.',
      divisao: { caracteresPorLinha: 18, linhas: 2, palavrasMin: 2, palavrasMax: 4, duracaoMin: 0.5, duracaoMax: 2.5, pausa: 0.5 },
      desenho: { fonte: 0.075, negrito: true, cor: '&H00FFFFFF', caixa: null, contorno: 0.008, sombra: 0.003, corContorno: '&H00000000', margemBaixo: 0.5, margemBaixoHorizontal: 0.3, margemLados: 0.08 }
    },
    {
      id: 'conto',
      nome: 'Conto narrado com ilustrações',
      uso: 'Para histórias narradas sobre imagens ou ilustrações.',
      fortes: 'Letra pequena embaixo, cor creme, sem tarja, só com um contorno fino, para a ilustração ter espaço e aparecer inteira.',
      evitar: 'Em imagem muito clara ou cheia de detalhes embaixo, porque sem tarja a letra pode se misturar com o fundo. Em vídeo para celular, porque a letra pequena fica difícil de ler numa tela pequena.',
      divisao: { caracteresPorLinha: 40, linhas: 2, palavrasMax: null, duracaoMin: 1.2, duracaoMax: 6, pausa: 0.8 },
      desenho: { fonte: 0.038, negrito: false, cor: '&H00C8F0FF', caixa: null, contorno: 0.0022, sombra: 0.0012, corContorno: '&H00121C2D', margemBaixo: 0.035, margemLados: 0.08 }
    },
    {
      id: 'aula',
      nome: 'Fala longa, aula ou depoimento no YouTube',
      uso: 'Para falas longas, aulas, palestras e depoimentos, em que a pessoa lê a legenda por muito tempo.',
      fortes: 'Embaixo e mais discreta, com letra média e uma tarja bem transparente. Cada legenda fica um pouco mais na tela. Cansa menos os olhos em vídeos longos.',
      evitar: 'Em vídeo curto ou vertical, onde uma legenda mais chamativa prende mais a atenção.',
      divisao: { caracteresPorLinha: 42, linhas: 2, palavrasMax: null, duracaoMin: 1.2, duracaoMax: 7, pausa: 1 },
      desenho: { fonte: 0.042, negrito: false, cor: '&H00F0F0F0', caixa: '&H90000000', contorno: 0, sombra: 0, folgaCaixa: 0.008, margemBaixo: 0.045, margemLados: 0.1 }
    }
  ];
  const estilo = (id) => ESTILOS.find((e) => e.id === id) || null;

  const FIM_DE_FRASE = /[.!?…]["»”']?$/;
  // Palavras que pedem a seguinte: legenda ou linha não termina nelas.
  const FRACAS = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
    'e', 'ou', 'que', 'se', 'por', 'pra', 'para', 'com', 'sem', 'ao', 'à', 'aos', 'às', 'meu', 'minha', 'seu', 'sua', 'mais', 'muito', 'não']);
  const fraca = (t) => FRACAS.has(String(t).toLowerCase());
  const PAUSA_DE_FRASE = /[,;:]["»”']?$/;

  /** Palavras do JSON do whisper-cli (-ml 1 -sow -oj): [{ inicio, fim, texto }], sem as vazias. */
  function palavrasDoWhisper(json) {
    const lista = (json && json.transcription) || [];
    const r = [];
    for (const s of lista) {
      const texto = String(s.text || '').replace(/\s+/g, ' ').trim();
      if (!texto) continue;
      const inicio = (Number(s.offsets && s.offsets.from) || 0) / 1000;
      const fim = Math.max(inicio, (Number(s.offsets && s.offsets.to) || 0) / 1000);
      r.push({ inicio, fim, texto });
    }
    return r;
  }

  /** Quebra o texto em até n linhas de no máximo `limite` letras, o mais equilibradas possível. */
  function quebrar(texto, limite, n) {
    const palavras = String(texto).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (!palavras.length) return [];
    const total = palavras.join(' ').length;
    if (total <= limite || n <= 1) return [palavras.join(' ')];
    // Duas linhas: procura o ponto de quebra que deixa as linhas mais parecidas, sem passar do limite.
    let melhor = null;
    for (let i = 1; i < palavras.length; i++) {
      const a = palavras.slice(0, i).join(' ');
      const b = palavras.slice(i).join(' ');
      const passa = Math.max(0, a.length - limite) + Math.max(0, b.length - limite);
      const nota = passa * 100 + Math.abs(a.length - b.length) + (fraca(palavras[i - 1]) ? 12 : 0) + (FIM_DE_FRASE.test(palavras[i - 1]) || PAUSA_DE_FRASE.test(palavras[i - 1]) ? -6 : 0);
      if (!melhor || nota < melhor.nota) melhor = { nota, linhas: [a, b] };
    }
    return melhor.linhas;
  }

  /**
   * Junta as palavras em legendas, seguindo a divisão do estilo: cabe no espaço (letras por linha
   * vezes linhas), não passa da duração máxima, respeita o número de palavras (Shorts) e quebra
   * no fim da frase ou numa pausa da fala.
   */
  function legendasDasPalavras(palavras, idEstilo) {
    const e = estilo(idEstilo) || ESTILOS[0];
    const d = e.divisao;
    const espaco = d.caracteresPorLinha * d.linhas;
    const grupos = [];
    let atual = [];
    const fecha = () => { if (atual.length) grupos.push(atual); atual = []; };
    for (let i = 0; i < palavras.length; i++) {
      const p = palavras[i];
      if (atual.length) {
        const texto = atual.map((x) => x.texto).concat(p.texto).join(' ');
        const anterior = atual[atual.length - 1];
        const pausa = p.inicio - anterior.fim;
        const passaEspaco = texto.length > espaco;
        const passaTempo = p.fim - atual[0].inicio > d.duracaoMax;
        const passaPalavras = d.palavrasMax && atual.length >= d.palavrasMax;
        const fimDeFrase = FIM_DE_FRASE.test(anterior.texto);
        const minimo = d.palavrasMin || 1;
        const quebraNatural = fimDeFrase || (atual.length >= minimo && (pausa > d.pausa ||
          (d.palavrasMax && PAUSA_DE_FRASE.test(anterior.texto))));
        if (quebraNatural) fecha();
        else if (passaEspaco || passaTempo || passaPalavras) {
          // Corte forçado: a palavra fraca do fim passa para a próxima legenda.
          const solta = atual.length > 1 && fraca(anterior.texto) ? atual.pop() : null;
          fecha();
          if (solta) atual.push(solta);
        }
      }
      atual.push(p);
    }
    fecha();
    // Shorts: uma palavra sozinha no fim de uma frase volta para a legenda anterior, se couber.
    if (d.palavrasMin) {
      for (let i = grupos.length - 1; i > 0; i--) {
        const g = grupos[i], ant = grupos[i - 1];
        const texto = ant.concat(g).map((x) => x.texto).join(' ');
        if (g.length < d.palavrasMin && ant.length + g.length <= d.palavrasMax + 1 && texto.length <= espaco &&
            g[g.length - 1].fim - ant[0].inicio <= d.duracaoMax + 1) {
          grupos.splice(i - 1, 2, ant.concat(g));
        }
      }
    }
    const legendas = grupos.map((g) => ({ inicio: g[0].inicio, fim: g[g.length - 1].fim, texto: g.map((x) => x.texto).join(' ') }));
    return ajustarTempos(legendas, d);
  }

  /** Duração mínima, sem invadir a próxima legenda; sem sobreposição. */
  function ajustarTempos(legendas, d) {
    for (let i = 0; i < legendas.length; i++) {
      const c = legendas[i];
      const prox = legendas[i + 1];
      const limite = prox ? prox.inicio - 0.04 : Infinity;
      if (c.fim - c.inicio < d.duracaoMin) c.fim = Math.min(c.inicio + d.duracaoMin, Math.max(c.fim, limite));
      if (prox && c.fim > prox.inicio - 0.04) c.fim = Math.max(c.inicio + 0.2, prox.inicio - 0.04);
      c.fim = Math.round(c.fim * 1000) / 1000;
      c.inicio = Math.round(c.inicio * 1000) / 1000;
    }
    return legendas;
  }

  /**
   * SRT trazido de fora (já revisado pelo src/srt.js): fica como a pessoa dividiu. Só no estilo
   * Shorts, que pede frases de 2 a 4 palavras, cada legenda é dividida de novo, com o tempo dela
   * repartido pelo tamanho de cada palavra.
   */
  function legendasDoSrt(cues, idEstilo) {
    const e = estilo(idEstilo) || ESTILOS[0];
    const base = cues.map((c) => ({ inicio: c.inicio, fim: c.fim, texto: (c.texto != null ? c.texto : (c.linhas || []).join(' ')).replace(/\s+/g, ' ').trim() }))
      .filter((c) => c.texto);
    if (!e.divisao.palavrasMax) return ajustarTempos(base, e.divisao);
    const palavras = [];
    for (const c of base) {
      const ps = c.texto.split(' ');
      const letras = ps.reduce((s, p) => s + p.length + 1, 0);
      let t = c.inicio;
      for (const p of ps) {
        const dur = (c.fim - c.inicio) * (p.length + 1) / letras;
        palavras.push({ inicio: t, fim: t + dur, texto: p });
        t += dur;
      }
    }
    return legendasDasPalavras(palavras, idEstilo);
  }

  // --- Arquivos ---------------------------------------------------------------------------------

  function tempoSrt(s) {
    const ms = Math.max(0, Math.round(s * 1000));
    const p = (n, k = 2) => String(n).padStart(k, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  }
  function tempoAss(s) {
    const cs = Math.max(0, Math.round(s * 100));
    const p = (n) => String(n).padStart(2, '0');
    return `${Math.floor(cs / 360000)}:${p(Math.floor(cs / 6000) % 60)}:${p(Math.floor(cs / 100) % 60)}.${p(cs % 100)}`;
  }
  /** SRT com as linhas já quebradas no tamanho do estilo. */
  function srtDasLegendas(legendas, idEstilo) {
    const e = estilo(idEstilo) || ESTILOS[0];
    return legendas.map((c, i) => `${i + 1}\n${tempoSrt(c.inicio)} --> ${tempoSrt(c.fim)}\n${quebrar(c.texto, e.divisao.caracteresPorLinha, e.divisao.linhas).join('\n')}\n`).join('\n');
  }

  /** Arquivo ASS do estilo, no tamanho real do vídeo (cada pixel do ASS é um pixel do vídeo). */
  function assDasLegendas(legendas, idEstilo, largura, altura) {
    const e = estilo(idEstilo) || ESTILOS[0];
    const g = e.desenho;
    const menor = Math.min(largura, altura);
    const px = (f) => Math.max(1, Math.round(f * menor));
    const caixa = !!g.caixa;
    const contorno = caixa ? Math.max(2, Math.round((g.folgaCaixa || 0.01) * menor)) : Math.round(g.contorno * menor * 10) / 10;
    const estiloLinha = [
      'Olho', 'Arial', px(g.fonte), g.cor, '&H000000FF',
      // Com tarja: estilo 4 do libass, uma tarja só para a legenda inteira (no 3, as tarjas das
      // linhas se sobrepõem e o meio fica mais escuro). O contorno, transparente, vira a folga da tarja.
      caixa ? '&HFF000000' : (g.corContorno || '&H00000000'),
      caixa ? g.caixa : '&H80000000',
      g.negrito ? -1 : 0, 0, 0, 0, 100, 100, 0, 0,
      caixa ? 4 : 1, contorno, caixa ? 0 : Math.round(g.sombra * menor * 10) / 10,
      2, Math.round(g.margemLados * largura), Math.round(g.margemLados * largura), Math.round((largura > altura && g.margemBaixoHorizontal != null ? g.margemBaixoHorizontal : g.margemBaixo) * altura), 1
    ].join(',');
    const escapar = (t) => String(t).replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
    const eventos = legendas.map((c) => `Dialogue: 0,${tempoAss(c.inicio)},${tempoAss(c.fim)},Olho,,0,0,0,,${quebrar(c.texto, e.divisao.caracteresPorLinha, e.divisao.linhas).map(escapar).join('\\N')}`);
    return [
      '[Script Info]',
      'ScriptType: v4.00+',
      `PlayResX: ${largura}`,
      `PlayResY: ${altura}`,
      'WrapStyle: 2',
      'ScaledBorderAndShadow: yes',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      `Style: ${estiloLinha}`,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...eventos,
      ''
    ].join('\n');
  }

  /** Texto corrido da transcrição, com um parágrafo a cada pausa longa depois do fim de uma frase. */
  function textoDaTranscricao(palavras) {
    const paragrafos = [];
    let atual = [];
    for (let i = 0; i < palavras.length; i++) {
      const p = palavras[i];
      atual.push(p.texto);
      const prox = palavras[i + 1];
      if (prox && FIM_DE_FRASE.test(p.texto) && prox.inicio - p.fim > 1.5) { paragrafos.push(atual.join(' ')); atual = []; }
    }
    if (atual.length) paragrafos.push(atual.join(' '));
    return paragrafos.join('\n\n') + '\n';
  }

  const api = { ESTILOS, estilo, palavrasDoWhisper, quebrar, legendasDasPalavras, legendasDoSrt, srtDasLegendas, assDasLegendas, textoDaTranscricao, tempoSrt, tempoAss };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Legendas = api;
})(typeof window !== 'undefined' ? window : globalThis);
