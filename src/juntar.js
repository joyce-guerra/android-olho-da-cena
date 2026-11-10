'use strict';

const { spawn } = require('./spawn-seguro'); // 1.8.6: filtros longos vão por arquivo
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getPreset } = require('./presets');
const { getFormato, getQualidade } = require('./formatos');
const { validarTitulos, resolverFonte, quebrarLinhas, limitesDe } = require('./titulos');
const { tamanhoFonte, filtroTexto } = require('./ffmpeg-builder');

/**
 * Junta vídeos prontos num só, sem reeditar o conteúdo deles.
 *
 * O que o programa faz aqui é emendar, opcionalmente pôr um título no começo de
 * cada trecho, e escurecer as junções. Nada de mexer no que já está gravado.
 *
 * A parte mais importante deste arquivo não é a emenda — é a análise. Vídeo de
 * fontes diferentes traz defeitos que o autor não tem como perceber sozinho:
 * um trecho na vertical vira faixa preta no meio, um clipe sem faixa de áudio
 * vira silêncio, um arquivo com marcação de rotação sai deitado. Por isso todo
 * arquivo é analisado e relatado antes de qualquer coisa acontecer.
 */

// Escurecimento nas junções. O primeiro nasce do preto, o último morre nele,
// e entre um trecho e outro há uma passagem curta.
const ABERTURA = 1.2;
const JUNCAO = 0.6;
const ENCERRAMENTO = 2.5;
const FADE_AUDIO = 0.25;

// Nivelamento de volume.
// TETO_PICO: teto de pico real, em dBTP. Fica abaixo de zero de propósito —
//   é a margem que garante que aumentar um trecho baixo não estoure.
// DESTOA: diferença a partir da qual um trecho é considerado fora do conjunto.
//   Abaixo disso, mexer seria fuçar sem motivo.
// GANHO_ALTO: acima disso o aumento é grande o bastante pra subir o chiado
//   junto com a voz, e a pessoa precisa saber disso.
const TETO_PICO = -1.5;
const DESTOA = 2.0;
const GANHO_ALTO = 8.0;

// Trilha de fundo.
// CRUZAMENTO: quanto o fim da trilha entra por baixo do próprio começo a cada
//   volta. Curto o bastante pra não borrar, longo o bastante pra não estalar.
// ENTRADA / SAIDA: fade da trilha no começo e no fim do vídeo inteiro.
const CRUZAMENTO = 2.0;
const TRILHA_ENTRADA = 1.5;
const TRILHA_SAIDA = 3.0;

function ffprobeJson(caminho, exigir) {
  return new Promise((resolve, reject) => {
    const p = spawn(exigir('ffprobe'), [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      caminho
    ], { windowsHide: true });

    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (c) => {
      if (c !== 0) return reject(new Error(err.trim() || 'ffprobe falhou.'));
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error('Não consegui ler as informações do arquivo.'));
      }
    });
  });
}

/** Lê um vídeo e devolve o que interessa pra decidir como tratá-lo. */
async function analisarVideo(caminho, exigir) {
  const dados = await ffprobeJson(caminho, exigir);
  const video = (dados.streams || []).find((s) => s.codec_type === 'video');
  const audio = (dados.streams || []).find((s) => s.codec_type === 'audio');

  if (!video) {
    return { caminho, nome: path.basename(caminho), valido: false, motivo: 'não tem faixa de vídeo' };
  }

  // Taxa de quadros vem como fração ("30000/1001").
  let fps = 30;
  const r = video.avg_frame_rate || video.r_frame_rate;
  if (r && r.includes('/')) {
    const [a, b] = r.split('/').map(Number);
    if (b) fps = a / b;
  }

  // Marcação de rotação: alguns celulares gravam deitado e marcam no arquivo.
  let rotacao = 0;
  for (const sd of video.side_data_list || []) {
    if (typeof sd.rotation === 'number') rotacao = ((sd.rotation % 360) + 360) % 360;
  }

  const largura = Number(video.width) || 0;
  const altura = Number(video.height) || 0;
  const giradoNoEixo = rotacao === 90 || rotacao === 270;

  return {
    caminho,
    nome: path.basename(caminho),
    valido: true,
    largura: giradoNoEixo ? altura : largura,
    altura: giradoNoEixo ? largura : altura,
    rotacao,
    fps: Math.round(fps * 1000) / 1000,
    temAudio: !!audio,
    codec: video.codec_name,
    duracao: Number((dados.format || {}).duration) || 0
  };
}

/**
 * Analisa a lista inteira e monta o relatório em português.
 *
 * O relatório é o ponto do recurso. Ele não impede de gerar (menos quando o
 * arquivo nem é vídeo) — diz o que vai acontecer, pra decisão ser da pessoa.
 */
async function analisarLista(caminhos, formatoId, exigir) {
  const formato = getFormato(formatoId || 'horizontal');
  const itens = [];
  const relatorio = [];
  const erros = [];

  for (const c of caminhos) {
    try {
      itens.push(await analisarVideo(c, exigir));
    } catch (e) {
      itens.push({ caminho: c, nome: path.basename(c), valido: false, motivo: e.message });
    }
  }

  itens.forEach((it, i) => {
    const pos = i + 1;
    if (!it.valido) {
      erros.push(`Vídeo ${pos}, ${it.nome}: ${it.motivo}. Remova-o da lista.`);
      return;
    }

    const proporcaoAlvo = formato.largura / formato.altura;
    const proporcao = it.largura / it.altura;
    const diferente = Math.abs(proporcao - proporcaoAlvo) > 0.05;

    if (diferente) {
      const deitado = proporcao > proporcaoAlvo;
      relatorio.push(
        `Vídeo ${pos}, ${it.nome}: está ${it.largura} por ${it.altura}, ` +
        `proporção diferente da escolhida. Vai entrar com faixas pretas ` +
        `${deitado ? 'em cima e embaixo' : 'nas laterais'}.`
      );
    }

    if (!it.temAudio) {
      relatorio.push(
        `Vídeo ${pos}, ${it.nome}: não tem faixa de áudio. O trecho vai ficar ` +
        `em silêncio, mas não vai desencaixar o resto.`
      );
    }

    if (it.rotacao) {
      relatorio.push(
        `Vídeo ${pos}, ${it.nome}: foi gravado girado ${it.rotacao} graus. ` +
        `Vou endireitar.`
      );
    }
  });

  const total = itens.filter((i) => i.valido).reduce((a, i) => a + i.duracao, 0);

  return { itens, relatorio, erros, duracaoTotal: total, formato };
}

/**
 * Mede o volume percebido de um arquivo.
 *
 * Usa a medição do padrão de transmissão (a mesma que YouTube e Spotify usam),
 * que mede volume percebido ao longo do tempo, não pico instantâneo. Devolve
 * também o pico real, que é o que permite garantir que um aumento não estoura.
 *
 * Custa uma passada de decodificação por arquivo, então não é de graça.
 */
function medirVolume(caminho, exigir) {
  return new Promise((resolve) => {
    const p = spawn(exigir('ffmpeg'), [
      '-hide_banner',
      '-i', caminho,
      '-vn',
      '-af', 'loudnorm=print_format=json',
      '-f', 'null',
      '-'
    ], { windowsHide: true });

    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', () => resolve(null));
    p.on('close', () => {
      // O JSON sai no fim da saída de diagnóstico.
      const abre = err.lastIndexOf('{');
      const fecha = err.lastIndexOf('}');
      if (abre === -1 || fecha <= abre) return resolve(null);
      try {
        const j = JSON.parse(err.slice(abre, fecha + 1));
        const volume = parseFloat(j.input_i);
        const pico = parseFloat(j.input_tp);
        if (!isFinite(volume) || volume < -70) return resolve(null); // silêncio
        resolve({ volume, pico: isFinite(pico) ? pico : 0 });
      } catch (_) {
        resolve(null);
      }
    });
  });
}

/** O valor do meio da lista — resiste a um trecho muito fora sem puxar o alvo. */
function mediana(valores) {
  const l = [...valores].sort((a, b) => a - b);
  const m = Math.floor(l.length / 2);
  return l.length % 2 ? l[m] : (l[m - 1] + l[m]) / 2;
}

/**
 * Decide o ajuste de cada trecho.
 *
 * O alvo é a mediana do conjunto, não uma referência externa: a ideia é fazer
 * os trechos combinarem entre si, não impor um volume de fora. Quem já está
 * perto do alvo não é tocado.
 *
 * Estourar não acontece por sorte: o ganho é limitado pelo pico real medido, de
 * forma que nenhum trecho passe do teto. Quando o limite impede o ajuste
 * completo, isso é dito em vez de acontecer calado.
 */
function calcularNivelamento(medidas) {
  const validas = medidas.filter((m) => m && m.medida).map((m) => m.medida.volume);
  const avisos = [];

  if (validas.length < 2) {
    return { ganhos: medidas.map(() => 0), avisos, alvo: null };
  }

  const alvo = mediana(validas);
  const ganhos = medidas.map((m, i) => {
    if (!m || !m.medida) return 0;

    const bruto = alvo - m.medida.volume;
    if (Math.abs(bruto) < DESTOA) return 0;

    // Teto: o pico depois do ajuste não pode passar do limite.
    const permitido = TETO_PICO - m.medida.pico;
    const ganho = bruto > 0 ? Math.min(bruto, permitido) : bruto;

    if (ganho <= 0.05 && bruto > 0) {
      avisos.push(
        `Vídeo ${i + 1} está mais baixo que os outros, mas já tem picos altos ` +
        `demais para ser levantado sem estourar. Deixei como estava.`
      );
      return 0;
    }

    if (bruto - ganho > 0.5) {
      avisos.push(
        `Vídeo ${i + 1} foi levantado ${ganho.toFixed(1)} decibéis em vez dos ` +
        `${bruto.toFixed(1)} necessários, para não estourar o pico.`
      );
    } else {
      avisos.push(
        `Vídeo ${i + 1}: volume ajustado em ${ganho > 0 ? '+' : ''}${ganho.toFixed(1)} decibéis.`
      );
    }

    if (ganho > GANHO_ALTO) {
      avisos.push(
        `O aumento no vídeo ${i + 1} foi grande. Se houver chiado de fundo, ` +
        `ele subiu junto e o trecho pode soar chapado.`
      );
    }

    return ganho;
  });

  return { ganhos, avisos, alvo };
}

/** Monta o comando que padroniza um trecho e desenha o texto dele. */
function argsTrecho({ item, formato, qualidade, preset, fps, saida, textos, primeiro, ultimo, fonte, ganho }) {
  const dur = item.duracao;
  const entrada = primeiro ? ABERTURA : JUNCAO;
  const saidaFade = ultimo ? ENCERRAMENTO : JUNCAO;

  const etapas = [
    // Cabe inteiro e centraliza; o que sobra vira faixa preta. Em vídeo a
    // faixa preta é o padrão da casa — desfocar o fundo de um clipe em
    // movimento custaria caro e ficaria inquieto.
    `scale=${formato.largura}:${formato.altura}:force_original_aspect_ratio=decrease`,
    `pad=${formato.largura}:${formato.altura}:(ow-iw)/2:(oh-ih)/2:black`,
    `setsar=1`,
    `fps=${fps}`,
    `fade=t=in:st=0:d=${entrada.toFixed(2)}`,
    `fade=t=out:st=${Math.max(0, dur - saidaFade).toFixed(3)}:d=${saidaFade.toFixed(2)}`
  ];

  // O texto vem depois dos fades, pelo mesmo motivo do outro modo: assim ele
  // não escurece junto com a passagem de um trecho pro outro.
  for (const t of textos || []) {
    etapas.push(filtroTexto({ ...t, fonte, estilo: preset.titulo, formato }));
  }
  etapas.push('format=yuv420p');

  const args = ['-y', '-i', item.caminho];

  // Trecho sem áudio ganha silêncio, senão a emenda desencaixa tudo que vem
  // depois.
  if (!item.temAudio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  }

  const fadeAudioSaida = Math.max(0, dur - FADE_AUDIO).toFixed(3);

  // O ajuste de volume vem antes dos fades, e o limitador vem depois de tudo,
  // como rede de segurança: mesmo que a conta do ganho erre, o pico não passa.
  const audio = [];
  if (ganho && Math.abs(ganho) > 0.05) audio.push(`volume=${ganho.toFixed(2)}dB`);
  audio.push(`afade=t=in:st=0:d=${FADE_AUDIO}`);
  audio.push(`afade=t=out:st=${fadeAudioSaida}:d=${FADE_AUDIO}`);
  if (ganho && ganho > 0.05) audio.push(`alimiter=limit=${(10 ** (TETO_PICO / 20)).toFixed(4)}`);

  args.push(
    '-vf', etapas.join(','),
    '-af', audio.join(','),
    '-map', '0:v:0',
    '-map', item.temAudio ? '0:a:0' : '1:a:0',
    '-c:v', 'libx264',
    '-preset', qualidade.encoder,
    '-crf', String(qualidade.crf),
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-g', String(fps * 2),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-t', dur.toFixed(3),
    saida
  );

  return args;
}

/**
 * Prepara a trilha para dar voltas sem emenda audível.
 *
 * Duas coisas acontecem aqui. A primeira é converter para áudio sem compressão:
 * MP3 e AAC carregam um pedaço de silêncio no começo e no fim, criado pelo
 * próprio compressor, que repetido vira um tique a cada volta. A segunda é
 * costurar o fim por baixo do começo, de forma que o arquivo resultante já seja
 * um ciclo fechado — daí em diante basta repetir.
 *
 * O trecho final da trilha diminui enquanto o começo cresce, e os dois somam.
 * O resultado dura o original menos o cruzamento.
 */
function argsLoopTrilha({ trilha, duracao, saida }) {
  const cruz = Math.min(CRUZAMENTO, Math.max(0.2, duracao / 4));
  const util = duracao - cruz;

  const filtro = [
    // O mesmo áudio precisa alimentar dois recortes diferentes (corpo e
    // rabo). A forma certa é ler o arquivo duas vezes (dois "-i" abaixo),
    // não duplicar o link com asplit: testado com áudio real, asplit some
    // com quase todo o áudio dentro do amix (fica um arquivo de around
    // 0,02 segundo) sem erro nenhum na tela — exatamente o tipo de falha
    // invisível a evitar aqui. E usar "[0:a]" duas vezes direto, sem
    // asplit nem duplicar o "-i", dá um arquivo igualmente vazio.
    `[0:a]atrim=0:${util.toFixed(3)},asetpts=PTS-STARTPTS,` +
    `afade=t=in:st=0:d=${cruz.toFixed(3)}[corpo]`,
    // Rabo: o pedaço final, diminuindo, que vai por baixo do começo.
    `[1:a]atrim=${util.toFixed(3)}:${duracao.toFixed(3)},asetpts=PTS-STARTPTS,` +
    `afade=t=out:st=0:d=${cruz.toFixed(3)}[rabo]`,
    `[corpo][rabo]amix=inputs=2:duration=first:normalize=0[saida]`
  ].join(';');

  return [
    '-y',
    '-i', trilha,
    '-i', trilha,
    '-filter_complex', filtro,
    '-map', '[saida]',
    '-c:a', 'pcm_s16le',
    '-ar', '48000',
    '-ac', '2',
    saida
  ];
}

/**
 * Põe a trilha por baixo do vídeo já montado.
 *
 * A trilha se repete quantas voltas forem necessárias e é cortada na duração
 * exata do vídeo — quem manda no tamanho é o vídeo. O som que já existia nos
 * trechos continua intacto por cima; a trilha só soma, num volume bem abaixo.
 *
 * O vídeo é copiado sem recodificar: só o áudio é refeito.
 */
function argsMixTrilha({ video, loop, volume, duracao, saida }) {
  const saidaEm = Math.max(0, duracao - TRILHA_SAIDA);

  const filtro = [
    `[1:a]volume=${volume.toFixed(3)},` +
    `atrim=0:${duracao.toFixed(3)},asetpts=PTS-STARTPTS,` +
    `afade=t=in:st=0:d=${TRILHA_ENTRADA},` +
    `afade=t=out:st=${saidaEm.toFixed(3)}:d=${TRILHA_SAIDA}[trilha]`,
    // normalize=0 é essencial: sem isso a mistura divide tudo pelo número de
    // entradas e o som dos trechos cairia pela metade sozinho.
    `[0:a][trilha]amix=inputs=2:duration=first:normalize=0[saida]`
  ].join(';');

  return [
    '-y',
    '-i', video,
    '-stream_loop', '-1',
    '-i', loop,
    '-filter_complex', filtro,
    '-map', '0:v:0',
    '-map', '[saida]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    saida
  ];
}

/**
 * Mistura quantas camadas de trilha forem passadas, por baixo do vídeo já
 * montado.
 *
 * Cada camada chega aqui já pronta: a de loop (e a estática que repete) já
 * passou pelo cruzamento em argsLoopTrilha (então "-stream_loop -1" só repete
 * um ciclo fechado, sem clique na volta); a estática que toca uma vez só é o
 * arquivo original, com um microfade embutido nas próprias pontas pra não
 * estalar quando ela entra e sai.
 *
 * A duração final é sempre a do vídeo ("duration=first"): nenhuma camada
 * alonga o resultado, e uma que comece perto do fim simplesmente é cortada
 * quando o vídeo acaba — o que pode ficar audível é avisado antes, em
 * render.js, não aqui.
 */
/**
 * Entradas e filtro da mistura de trilhas, sem decidir o que sai: o vídeo
 * com o áudio misturado (argsMixCamadas) ou só o áudio (argsMixCamadasAudio).
 * A entrada 0 é a principal (vídeo com áudio, ou um áudio puro).
 */
function montarMixCamadas({ principal, camadas, duracaoVideo }) {
  const args = ['-y', '-i', principal];

  camadas.forEach((c) => {
    if (c.tipo === 'loop' || (c.tipo === 'estatico' && c.repetir)) args.push('-stream_loop', '-1');
    args.push('-i', c.arquivo);
  });

  const partes = [];
  camadas.forEach((c, idx) => {
    const i = idx + 1; // 0 é o vídeo
    const base = `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo`;

    if (c.tipo === 'loop') {
      // encerraEm: quando uma trilha contínua mais nova assume o lugar desta,
      // em vez de ir até o fim do vídeo, ela desce um pouco antes, num fade
      // do tamanho do cruzamento — o mesmo "passar o bastão" de uma trilha
      // contínua pra outra, não o fade final do vídeo.
      const temEncerramento = typeof c.encerraEm === 'number' && c.encerraEm < duracaoVideo;
      const fim = temEncerramento ? c.encerraEm : duracaoVideo;
      const duracaoSaida = temEncerramento ? CRUZAMENTO : TRILHA_SAIDA;
      const saidaFade = Math.max(0, fim - Math.min(duracaoSaida, fim / 2)).toFixed(3);
      const saidaDur = Math.min(duracaoSaida, fim / 2).toFixed(3);
      partes.push(
        `${base},volume=${c.volume.toFixed(3)},atrim=0:${fim.toFixed(3)},` +
        `asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${TRILHA_ENTRADA},` +
        `afade=t=out:st=${saidaFade}:d=${saidaDur}[c${i}]`
      );
    } else if (c.repetir) {
      // Estática que repete: o relógio do fade é o tempo que falta até o fim
      // do vídeo a partir daqui (não a duração do arquivo), porque é esse o
      // trecho que ela precisa cobrir — a não ser que uma trilha contínua
      // mais nova assuma antes (encerraEm), caso em que o relógio vai só até
      // lá. O adelay desloca tudo pro instante marcado, por último.
      const tempoInicio = Math.max(0, c.tempo);
      const temEncerramento = typeof c.encerraEm === 'number' && c.encerraEm < duracaoVideo;
      const fimJanela = temEncerramento ? c.encerraEm : duracaoVideo;
      const restante = Math.max(0.1, fimJanela - tempoInicio);
      const duracaoSaida = temEncerramento ? CRUZAMENTO : TRILHA_SAIDA;
      const entradaFade = Math.min(TRILHA_ENTRADA, restante / 2);
      const saidaFade = Math.min(duracaoSaida, restante / 2);
      const saidaEm = Math.max(0, restante - saidaFade);
      const atrasoMs = Math.round(tempoInicio * 1000);
      partes.push(
        `${base},volume=${c.volume.toFixed(3)},atrim=0:${restante.toFixed(3)},` +
        `asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${entradaFade.toFixed(3)},` +
        `afade=t=out:st=${saidaEm.toFixed(3)}:d=${saidaFade.toFixed(3)},` +
        `adelay=${atrasoMs}:all=1[c${i}]`
      );
    } else {
      // Toca uma vez só: o fade é calculado no relógio próprio do arquivo (0
      // até a duração dele) e só depois deslocado pelo adelay — por isso a
      // ordem dos filtros importa: fade antes, adelay depois.
      const atrasoMs = Math.round(Math.max(0, c.tempo) * 1000);
      const dur = Math.max(0.05, c.duracao || 0.05);
      const micro = Math.min(0.05, dur / 4);
      // Fade de entrada e de saída são opcionais (caixas de marcar na tela).
      // Desmarcado, fica só o microfade de 50 ms, que evita o estalo mas
      // deixa a trilha entrar seca, como um efeito sonoro pontual.
      const entrada = c.fadeEntrada === true ? Math.min(TRILHA_ENTRADA, dur / 2) : micro;
      const saida = c.fadeSaida === true ? Math.min(TRILHA_SAIDA, dur / 2) : micro;
      partes.push(
        `${base},volume=${c.volume.toFixed(3)},` +
        `afade=t=in:st=0:d=${entrada.toFixed(3)},` +
        `afade=t=out:st=${Math.max(0, dur - saida).toFixed(3)}:d=${saida.toFixed(3)},` +
        `adelay=${atrasoMs}:all=1[c${i}]`
      );
    }
  });

  const entradasMix = '[0:a]' + camadas.map((_, i) => `[c${i + 1}]`).join('');
  partes.push(`${entradasMix}amix=inputs=${camadas.length + 1}:duration=first:normalize=0[saida]`);
  return { args, filtro: partes.join(';') };
}

function argsMixCamadas({ video, camadas, duracaoVideo, saida }) {
  const { args, filtro } = montarMixCamadas({ principal: video, camadas, duracaoVideo });
  args.push(
    '-filter_complex', filtro,
    '-map', '0:v:0',
    '-map', '[saida]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    saida
  );
  return args;
}

/** Codec de áudio pela extensão do arquivo de saída: WAV sem perda, senão MP3. */
function codecAudioPorExtensao(saida) {
  return /\.wav$/i.test(String(saida))
    ? ['-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2']
    : ['-c:a', 'libmp3lame', '-q:a', '2', '-ar', '48000', '-ac', '2'];
}

/** Mesma mistura, mas o que sai é só o áudio, em MP3 ou WAV. */
function argsMixCamadasAudio({ audio, camadas, duracaoVideo, saida }) {
  const { args, filtro } = montarMixCamadas({ principal: audio, camadas, duracaoVideo });
  args.push('-filter_complex', filtro, '-map', '[saida]', '-vn', ...codecAudioPorExtensao(saida), saida);
  return args;
}

/**
 * Prévia rápida de mistura: só uma amostra de poucos segundos, pedida a
 * qualquer momento enquanto a pessoa está configurando as trilhas — não o
 * vídeo final. Por isso não recodifica nada pesado, não precisa do vídeo
 * ainda montado, e usa seek aproximado (rápido) em vez de preciso.
 *
 * `camadas` aqui já vem anotada por quem chama (prepararPreviaCamadas, em
 * render.js): cada uma diz se entra por `seek` (já estava tocando antes da
 * janela, então pula direto pro ponto certo dentro do próprio arquivo) ou por
 * `delay` (começa só depois do início da janela, então toca do começo dela
 * mesma, adiada). `loop` marca se o arquivo deve se repetir (trilha em loop
 * ou estática que repete) — nesses casos o seek é sempre módulo a duração do
 * próprio arquivo, calculado por quem chama.
 */
function argsPreviaMixagem({ audioPrincipal, janelaInicio, duracaoJanela, camadas, saida }) {
  const args = ['-y', '-ss', janelaInicio.toFixed(3), '-t', duracaoJanela.toFixed(3), '-i', audioPrincipal];

  camadas.forEach((c) => {
    if (c.loop) args.push('-stream_loop', '-1');
    if (c.modo === 'seek' && c.seekEm > 0) args.push('-ss', c.seekEm.toFixed(3));
    args.push('-i', c.arquivo);
  });

  const partes = [`[0:a]aformat=sample_rates=48000:channel_layouts=stereo[c0]`];
  const entradas = ['[c0]'];

  camadas.forEach((c, idx) => {
    const i = idx + 1;
    const rotulo = `c${i}`;
    let cadeia =
      `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,` +
      `volume=${c.volume.toFixed(3)},atrim=0:${duracaoJanela.toFixed(3)},asetpts=PTS-STARTPTS`;
    if (c.modo === 'delay' && c.delayMs > 0) cadeia += `,adelay=${Math.round(c.delayMs)}:all=1`;
    partes.push(`${cadeia}[${rotulo}]`);
    entradas.push(`[${rotulo}]`);
  });

  partes.push(`${entradas.join('')}amix=inputs=${camadas.length + 1}:duration=first:normalize=0[saida]`);

  args.push(
    '-filter_complex', partes.join(';'),
    '-map', '[saida]',
    '-c:a', 'libmp3lame',
    '-b:a', '160k',
    saida
  );

  return args;
}

module.exports = {
  montarMixCamadas,
  argsMixCamadasAudio,
  codecAudioPorExtensao,
  analisarVideo,
  analisarLista,
  argsTrecho,
  medirVolume,
  calcularNivelamento,
  argsLoopTrilha,
  argsMixTrilha,
  argsMixCamadas,
  argsPreviaMixagem,
  ABERTURA,
  JUNCAO,
  ENCERRAMENTO
};
