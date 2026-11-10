'use strict';

/**
 * Aqui mora todo o FFmpeg. O resto do programa nunca vê uma linha de filtro.
 *
 * Os comandos saem como array de argumentos (sem shell), então não precisa
 * escapar aspas nem se preocupar com espaço no caminho do arquivo.
 *
 * Nada aqui tem resolução fixa: o formato (horizontal ou vertical) e a
 * qualidade (que define a resolução de trabalho) chegam de fora, de
 * src/formatos.js.
 */

const { resolucaoDeTrabalho } = require('./formatos');

/** Caminho dentro de um filtro: barra normal e dois-pontos escapado. */
function caminhoFiltro(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/**
 * Um texto sobreposto, com entrada e saída suaves.
 *
 * A opacidade animada vale para o texto E para a caixa escura atrás — os dois
 * aparecem e somem juntos, sem a tarja piscar sozinha. Isso foi conferido
 * renderizando e medindo o pixel, não presumido.
 *
 * Os tempos aqui são locais ao segmento. Um título que atravessa a troca de
 * imagem é desenhado nos dois segmentos, com as pontas aparadas por 'enable',
 * e a animação continua igual porque as contas seguem o tempo original.
 */
function filtroTexto({ arquivoTexto, fonte, estilo, formato, inicio, duracao, entrada, tamanho, visivelDe, visivelAte }) {
  const fim = inicio + duracao;
  const f = Math.max(0.05, entrada);

  // Sobe de 0 a 1 na entrada, fica em 1, desce na saída.
  const alpha =
    `max(0\,min(1\,min((t-${inicio.toFixed(3)})/${f.toFixed(3)}` +
    `\,(${fim.toFixed(3)}-t)/${f.toFixed(3)})))`;

  return [
    `drawtext=fontfile='${caminhoFiltro(fonte)}'`,
    `textfile='${caminhoFiltro(arquivoTexto)}'`,
    `fontcolor=${estilo.corTexto || 'white'}`,
    `fontsize=${Math.round(tamanho)}`,
    `borderw=2`,
    `bordercolor=black@0.85`,
    `box=1`,
    `boxcolor=${estilo.corCaixa || 'black'}@${estilo.opacidadeCaixa}`,
    `boxborderw=${estilo.margemCaixa}`,
    `line_spacing=${estilo.espacoLinha}`,
    `x=(w-tw)/2`,
    `y=h*${estilo.posicao}-th/2`,
    `alpha='${alpha}'`,
    `enable='between(t\,${visivelDe.toFixed(3)}\,${visivelAte.toFixed(3)})'`
  ].join(':');
}

/**
 * Tela preta com o título no meio, em creme, para quem não quer imagens.
 * Cada linha é desenhada e centrada à parte: não dependo de alinhamento
 * de bloco do drawtext, que varia entre versões do FFmpeg.
 */
function argsTelaTitulo({ fonte, arquivosLinhas, formato, saida }) {
  const tam = Math.round(Math.min(formato.largura, formato.altura) * 0.062);
  const passo = Math.round(tam * 1.45);
  const n = arquivosLinhas.length;
  const topo = `(h-${(n - 1) * passo})/2`;
  const filtros = arquivosLinhas.map((arq, i) =>
    `drawtext=fontfile='${caminhoFiltro(fonte)}':textfile='${caminhoFiltro(arq)}'` +
    `:fontcolor=0xF5E9D0:fontsize=${tam}:x=(w-tw)/2:y=${topo}+${i * passo}-th/2`
  );
  return [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=black:s=${formato.largura}x${formato.altura}`,
    '-vf', filtros.join(','),
    '-frames:v', '1',
    saida
  ];
}

/**
 * Passo 1 — deixar todas as imagens do mesmo tamanho.
 *
 * A imagem original entra inteira, centrada e sem distorção; o que sobraria de
 * borda é preenchido com uma cópia ampliada e desfocada da própria imagem,
 * escurecida. Foto em pé, print quadrado, wallpaper deitado — tudo sai com o
 * mesmo enquadramento e nada fica esticado.
 *
 * Isso importa ainda mais no formato vertical, onde quase toda imagem comum vai
 * sobrar borda dos dois lados.
 */
function argsNormalizar({ entrada, saida, formato, qualidade, fundo: estiloFundo }) {
  const { largura, altura } = resolucaoDeTrabalho(formato, qualidade);
  // O fundo desfocado segue o clima do preset: mais escuro num, mais claro e
  // colorido noutro.
  const ef = { desfoque: 60, brilho: -0.12, saturacao: 0.85, ...(estiloFundo || {}) };

  const fundo = [
    `[0:v]scale=${largura}:${altura}:force_original_aspect_ratio=increase`,
    `crop=${largura}:${altura}`,
    `boxblur=${ef.desfoque}:3`,
    `eq=brightness=${ef.brilho}:saturation=${ef.saturacao}[bg]`
  ].join(',');

  const frente =
    `[0:v]scale=${largura}:${altura}:force_original_aspect_ratio=decrease[fg]`;

  const junta = `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[out]`;

  return [
    '-y',
    '-i', entrada,
    '-filter_complex', `${fundo};${frente};${junta}`,
    '-map', '[out]',
    '-frames:v', '1',
    saida
  ];
}

/**
 * Passo 2 — transformar uma imagem normalizada num pedaço de vídeo com
 * movimento. O zoom e o deslocamento são escritos em função do número de
 * quadros do próprio segmento, então o movimento completa exatamente no fim,
 * não importa se o segmento dura 5 segundos ou 3 minutos.
 */
function argsSegmento({ imagem, segmento, preset, formato, qualidade, saida, textos }) {
  const fps = preset.fps;
  const dur = segmento.duracao;
  const quadros = Math.max(2, Math.round(dur * fps));
  // Imagem pequena que precisa ser ampliada perde nitidez com o zoom; nesse
  // caso o zoom encolhe sozinho (zoomFator vem da conta feita na montagem).
  const amp = preset.zoomAmount * (segmento.zoomFator > 0 ? segmento.zoomFator : 1);

  // Expressão do zoom. 'on' é o número do quadro que está saindo.
  const z = segmento.zoomIn
    ? `min(1+${amp}*on/${quadros}\\,${(1 + amp).toFixed(4)})`
    : `max(${(1 + amp).toFixed(4)}-${amp}*on/${quadros}\\,1)`;

  // Margem disponível pra deslocar sem mostrar borda vazia.
  const margemX = `(iw-iw/zoom)`;
  const margemY = `(ih-ih/zoom)`;

  // pan = -1, 0 ou 1. Vai de um lado ao outro da margem ao longo do segmento.
  const sinal = segmento.pan > 0 ? '+' : '-';
  const x = segmento.pan
    ? `${margemX}/2${sinal}${margemX}/2*(on/${quadros}*2-1)*0.8`
    : `${margemX}/2`;
  const y = `${margemY}/2`;

  const etapas = [
    `zoompan=z='${z}':x='${x}':y='${y}':d=1:` +
    `s=${formato.largura}x${formato.altura}:fps=${fps}`
  ];

  if (preset.grade) etapas.push(preset.grade);

  // Entrada e saída são independentes: o primeiro segmento nasce do preto com
  // a abertura, o último morre nele com o encerramento, e os do meio usam o
  // fade normal do preset (que pode ser zero, no corte seco).
  if (segmento.fadeIn > 0) {
    etapas.push(`fade=t=in:st=0:d=${segmento.fadeIn.toFixed(3)}`);
  }
  if (segmento.fadeOut > 0) {
    const saidaEm = Math.max(0, dur - segmento.fadeOut).toFixed(3);
    etapas.push(`fade=t=out:st=${saidaEm}:d=${segmento.fadeOut.toFixed(3)}`);
  }

  // O texto entra DEPOIS do fade da imagem, e o motivo é concreto: desenhado
  // antes, um título que atravessa a troca de imagem escurece junto com ela e
  // pisca no meio da frase. Depois, ele atravessa a transição inteiro e some
  // no tempo dele.
  for (const t of textos || []) {
    etapas.push(filtroTexto({ ...t, estilo: preset.titulo, formato }));
  }

  etapas.push('format=yuv420p');

  return [
    '-y',
    '-loop', '1',
    '-framerate', String(fps),
    '-t', dur.toFixed(3),
    '-i', imagem,
    '-vf', etapas.join(','),
    '-frames:v', String(quadros),
    '-c:v', 'libx264',
    '-preset', qualidade.encoder,
    '-crf', String(qualidade.crf),
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-g', String(fps * 2),
    saida
  ];
}

/**
 * Passo 3 — emendar os segmentos e casar com o áudio.
 *
 * Todos os segmentos saíram com os mesmos parâmetros de codec, então o vídeo é
 * só copiado (rápido) e apenas o áudio é recodificado.
 */
function argsJuntar({ listaPath, audio, saida, duracao }) {
  // O áudio também precisa terminar, não ser cortado no meio. Uma entrada curta
  // evita o estalo do começo; a saída acompanha o escurecimento da imagem.
  const entradaAudio = 0.4;
  const saidaAudio = Math.min(3, Math.max(0.5, duracao * 0.05));
  const inicioSaida = Math.max(0, duracao - saidaAudio).toFixed(3);
  const filtroAudio =
    `afade=t=in:st=0:d=${entradaAudio}` +
    `,afade=t=out:st=${inicioSaida}:d=${saidaAudio.toFixed(3)}`;

  return [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listaPath,
    '-i', audio,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-af', filtroAudio,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    saida
  ];
}

/**
 * Preenche uma ponta (ou as duas) de um segmento já pronto com uma cópia
 * parada do primeiro ou do último quadro.
 *
 * É só a massa crua que a transição de página vai consumir ao se misturar
 * com o vizinho — o efeito em si só acontece na hora de juntar, em
 * argsJuntarTransicao. Aqui é apenas tempo extra de quadro parado.
 */
function argsPadSegmento({ entrada, saida, qualidade, fps, padEsquerda, padDireita }) {
  const partes = [];
  if (padEsquerda > 0) partes.push(`start_mode=clone:start_duration=${padEsquerda.toFixed(3)}`);
  if (padDireita > 0) partes.push(`stop_mode=clone:stop_duration=${padDireita.toFixed(3)}`);

  return [
    '-y',
    '-i', entrada,
    '-vf', `tpad=${partes.join(':')}`,
    '-c:v', 'libx264',
    '-preset', qualidade.encoder,
    '-crf', String(qualidade.crf),
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    saida
  ];
}

/**
 * Junta os segmentos com uma transição de verdade (as duas imagens
 * aparecem juntas por um instante) em vez do corte seco ou fade pelo preto
 * do argsJuntar comum.
 *
 * Os segmentos já chegam aqui encolhidos e com a massa extra de
 * argsPadSegmento (ver timeline.js, aplicarTransicaoCruzada) — a conta de
 * duração foi fechada lá pra bater exatamente com o áudio. Esta função só
 * encadeia o xfade nos pontos certos, sem mexer em duração de novo.
 *
 * O resultado é só o vídeo, mudo — quem casa com o áudio da narração é
 * argsCasarAudio, depois.
 */
function argsJuntarTransicao({ arquivos, transicao, duracaoTransicao, segmentos, qualidade, saida }) {
  if (arquivos.length === 1) {
    return ['-y', '-i', arquivos[0], '-c:v', 'copy', '-an', saida];
  }

  const entradas = [];
  arquivos.forEach((a) => entradas.push('-i', a));

  const partes = [];
  let rotulo = '0:v';
  let acumulado = segmentos[0].duracao;

  for (let i = 1; i < arquivos.length; i++) {
    const proximoRotulo = i === arquivos.length - 1 ? 'vout' : `v${i}`;
    partes.push(
      `[${rotulo}][${i}:v]xfade=transition=${transicao}:duration=${duracaoTransicao.toFixed(3)}:` +
      `offset=${acumulado.toFixed(3)}[${proximoRotulo}]`
    );
    rotulo = proximoRotulo;
    if (i < arquivos.length - 1) acumulado += duracaoTransicao + segmentos[i].duracao;
  }

  return [
    '-y',
    ...entradas,
    '-filter_complex', partes.join(';'),
    '-map', `[${rotulo}]`,
    '-c:v', 'libx264',
    '-preset', qualidade.encoder,
    '-crf', String(qualidade.crf),
    '-pix_fmt', 'yuv420p',
    saida
  ];
}

/**
 * Casa um vídeo já pronto (mudo) com o áudio da narração — o mesmo fade de
 * entrada e saída de áudio do argsJuntar comum, só que recebendo o vídeo já
 * inteiro em vez de uma lista pra emendar.
 */
function argsCasarAudio({ video, audio, saida, duracao }) {
  const entradaAudio = 0.4;
  const saidaAudio = Math.min(3, Math.max(0.5, duracao * 0.05));
  const inicioSaida = Math.max(0, duracao - saidaAudio).toFixed(3);
  const filtroAudio =
    `afade=t=in:st=0:d=${entradaAudio}` +
    `,afade=t=out:st=${inicioSaida}:d=${saidaAudio.toFixed(3)}`;

  return [
    '-y',
    '-i', video,
    '-i', audio,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-af', filtroAudio,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    saida
  ];
}

/** Linha do arquivo de lista do concat, com o escape que o FFmpeg espera. */
function linhaLista(caminho) {
  const normalizado = caminho.replace(/\\/g, '/').replace(/'/g, "'\\''");
  return `file '${normalizado}'`;
}

/** Tamanho da fonte, proporcional ao menor lado — igual nos dois formatos. */
function tamanhoFonte(formato, tipo, escala = 1) {
  const base = Math.min(formato.largura, formato.altura);
  return (tipo === 'fim' ? base * 0.052 : base * 0.062) * escala;
}

/**
 * Estilo fixo da legenda queimada, do jeito que a Joy pediu: creme quente,
 * sem caixa nem tarja atrás, só um contorno fino marrom-escuro e uma sombra
 * leve — o suficiente pra ler em cima de imagem clara sem escurecer a cena.
 *
 * Tamanho da letra e distância da borda são proporcionais à altura do vídeo
 * (4% e 2,5%), então o visual fica igual em qualquer resolução de trabalho,
 * vertical ou horizontal.
 */
function estiloLegenda(altura) {
  const fonte = Math.max(10, Math.round(altura * 0.04));
  const margem = Math.max(10, Math.round(altura * 0.025));
  const contorno = Math.max(1.4, Math.round(altura * 0.0022 * 10) / 10);
  const sombra = Math.max(0.6, Math.round(altura * 0.0012 * 10) / 10);

  return [
    'FontName=Arial',
    `FontSize=${fonte}`,
    // Cor primária (creme quente) e cor do contorno (marrom-escuro), as duas
    // no formato &HAABBGGRR que o ASS/libass espera: alfa, depois azul,
    // verde e vermelho, nessa ordem — invertido do RGB comum.
    'PrimaryColour=&H00C8F0FF&',
    'OutlineColour=&H00121C2D&',
    'BorderStyle=1', // contorno + sombra, sem caixa opaca atrás
    `Outline=${contorno}`,
    `Shadow=${sombra}`,
    'Bold=0',
    'Alignment=2', // centralizada, embaixo
    `MarginV=${margem}`,
    'WrapStyle=0' // quebra em até duas linhas equilibradas, sem forçar 1 só
  ].join(',');
}

/**
 * Filtro de legenda já com o estilo aplicado, pronto para entrar direto em
 * -vf ou dentro de um filter_complex.
 */
function filtroLegenda(legenda, altura) {
  return `subtitles='${caminhoFiltro(legenda)}':force_style='${estiloLegenda(altura)}'`;
}

/**
 * Queima um arquivo de legenda (.srt, .vtt ou .ass) direto no vídeo.
 *
 * Existe porque o YouTube, via API, não aceita upload de arquivo de legenda
 * nesta ferramenta — a saída é gravar o texto no próprio vídeo. Recodifica o
 * vídeo (a legenda exige isso, não tem como só copiar) e copia o áudio, que
 * não precisa de nenhum ajuste nessa passagem.
 */
function argsLegenda({ video, legenda, saida, altura, ass = false }) {
  return [
    '-y',
    '-i', video,
    // 1.9: ASS dos estilos da tela de legenda: o estilo vem no próprio arquivo.
    '-vf', ass ? `subtitles='${caminhoFiltro(legenda)}'` : filtroLegenda(legenda, altura),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    saida
  ];
}

module.exports = {
  argsTelaTitulo,
  caminhoFiltro,
  filtroTexto,
  argsNormalizar,
  argsSegmento,
  argsJuntar,
  argsPadSegmento,
  argsJuntarTransicao,
  argsCasarAudio,
  argsLegenda,
  filtroLegenda,
  linhaLista,
  tamanhoFonte
};
