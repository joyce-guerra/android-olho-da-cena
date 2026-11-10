'use strict';

const { spawn } = require('./spawn-seguro'); // 1.8.6: filtros longos vão por arquivo
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getPreset } = require('./presets');
const { localizar, esquecer } = require('./ffmpeg-path');
const { getFormato, getQualidade } = require('./formatos');
const {
  buildTimeline,
  resumirTimeline,
  formatarTempo,
  aplicarTransicaoCruzada,
  aplicarTrocasDePreset,
  renovarMovimento,
  finalizarSegmentos
} = require('./timeline');
const {
  argsTelaTitulo,
  argsNormalizar,
  argsSegmento,
  argsJuntar,
  argsPadSegmento,
  argsJuntarTransicao,
  argsCasarAudio,
  argsLegenda,
  linhaLista,
  tamanhoFonte
} = require('./ffmpeg-builder');
const { validarTitulos, resolverFonte, quebrarLinhas, limitesDe } = require('./titulos');
const {
  analisarLista,
  argsTrecho,
  medirVolume,
  calcularNivelamento,
  argsLoopTrilha,
  argsMixCamadas,
  argsMixCamadasAudio,
  argsPreviaMixagem
} = require('./juntar');
const trecho = require('./trecho');
const { analisarVideo } = require('./juntar');
const { planejarCortes, argsCortar, argsCortarAudio, calcularFadesDeJuncao, calcularSobreposicoes, alinharAosQuadros, remapSobreposto } = require('./cortar');

/** 1.5: quadros por segundo do vídeo (para o crossfade sobreposto). 30 se não souber. */
function fpsDoVideo(caminho) {
  return new Promise((resolve) => {
    const p = spawn(exigir('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'default=noprint_wrappers=1:nokey=1', caminho], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(30));
    p.on('close', () => { const [a, b] = String(out).trim().split('/').map(Number); const f = b ? a / b : a; resolve(f > 1 && f < 121 ? f : 30); });
  });
}
const dividir = require('./dividir');
const audios = require('./audios');
const logosMod = require('./logos');
const { revisarArquivoLegenda, parseSrt } = require('./srt');
const LEG = require('./legendas');
// 1.9: centro do título, em fração da altura da imagem, quando o vídeo tem legenda.
const POSICAO_TITULO_COM_LEGENDA = 0.3;
const AJ = require('./ajuste');

/**
 * Olho da Cena: com outra velocidade, os tempos de uma legenda .srt (marcados
 * no vídeo em velocidade normal) são divididos pela velocidade, para o texto
 * continuar junto da fala.
 */
function escalarSrt(texto, velocidade) {
  const v = Number(velocidade) || 1;
  if (Math.abs(v - 1) < 1e-3) return texto;
  return String(texto).replace(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/g, (_t, h, m, s, ms) => {
    const total = Math.round(((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(ms)) / v);
    const p = (n, k = 2) => String(n).padStart(k, '0');
    return `${p(Math.floor(total / 3600000))}:${p(Math.floor((total % 3600000) / 60000))}:${p(Math.floor((total % 60000) / 1000))},${p(total % 1000, 3)}`;
  });
}

let processoAtual = null;
let cancelado = false;

function rodar(comando, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(comando, args, { windowsHide: true });
    processoAtual = p;

    let stderr = '';
    p.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    p.on('error', (err) => {
      processoAtual = null;
      reject(new Error(`Não consegui executar "${comando}": ${err.message}`));
    });

    p.on('close', (code) => {
      processoAtual = null;
      if (cancelado) return reject(new Error('CANCELADO'));
      if (code === 0) return resolve(stderr);
      reject(new Error(`FFmpeg terminou com erro (código ${code}).\n${stderr.slice(-1200)}`));
    });
  });
}

/**
 * Confere se ffmpeg e ffprobe foram encontrados — no PATH ou nas pastas onde os
 * instaladores costumam deixar. Devolve também o caminho de cada um, pra poder
 * mostrar na tela de onde vieram.
 */
async function verificarFFmpeg() {
  esquecer();
  const achados = localizar();
  return {
    ffmpeg: !!achados.ffmpeg,
    ffprobe: !!achados.ffprobe,
    caminhoFfmpeg: achados.ffmpeg,
    caminhoFfprobe: achados.ffprobe
  };
}

/** Caminho do executável, com uma mensagem clara se ele não existe. */
function exigir(nome) {
  const achado = localizar()[nome];
  if (!achado) {
    throw new Error(
      `Não encontrei o ${nome} no computador. Instale o FFmpeg, ou aponte a ` +
      `pasta dele na variável de ambiente FFMPEG_DIR.`
    );
  }
  return achado;
}

/** Duração do áudio, em segundos. */
async function duracaoDoAudio(caminho) {
  const saida = await new Promise((resolve, reject) => {
    const p = spawn(exigir('ffprobe'), [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      caminho
    ], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('error', (e) => reject(e));
    p.on('close', (c) =>
      c === 0 ? resolve(out.trim()) : reject(new Error('Não consegui ler a duração do áudio.'))
    );
  });

  const d = parseFloat(saida);
  if (!isFinite(d) || d <= 0) throw new Error('Arquivo de áudio inválido ou sem duração.');
  return d;
}

/**
 * Altura (em pixels) do vídeo, usada só pra calcular o tamanho da letra e a
 * margem da legenda em proporção ao vídeo real — não ao formato de geração,
 * que aqui nem é conhecido (o vídeo já chega pronto, de fora, no caso de
 * cortarVideo).
 */
async function alturaDoVideo(caminho) {
  const saida = await new Promise((resolve, reject) => {
    const p = spawn(exigir('ffprobe'), [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=height',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      caminho
    ], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('error', (e) => reject(e));
    p.on('close', (c) =>
      c === 0 ? resolve(out.trim()) : reject(new Error('Não consegui ler a altura do vídeo.'))
    );
  });

  const h = parseInt(saida, 10);
  if (!isFinite(h) || h <= 0) {
    throw new Error('Não consegui descobrir a altura do vídeo para estilizar a legenda.');
  }
  return h;
}

/**
 * Procura trechos de silêncio num áudio ou vídeo, usando o filtro
 * silencedetect do próprio ffmpeg (não grava nada — só analisa e escreve o
 * que achou na saída de erro, por isso o -f null).
 *
 * `margem` encolhe cada trecho encontrado por dentro, dos dois lados, pra não
 * cortar colado na entrada ou saída da fala — cortar exatamente onde o som
 * sobe de novo arrisca comer o começo de uma palavra ou uma respiração.
 */
async function detectarSilencios(caminho, { limiarDb = -30, duracaoMinima = 0.6, margem = 0.15, ganhoDb = 0 } = {}) {
  // 1.7.2: ganhoDb (equilibrado e agressivo) sobe o volume antes de medir, para gravação baixa.
  // Com 0, o filtro é exatamente o da 1.0.0.
  const filtro = (ganhoDb > 0 ? `volume=${ganhoDb.toFixed(2)}dB,` : '') + `silencedetect=noise=${limiarDb}dB:d=${duracaoMinima}`;
  const saidaTexto = await new Promise((resolve, reject) => {
    const p = spawn(exigir('ffmpeg'), [
      '-i', caminho,
      '-af', filtro,
      '-f', 'null', '-'
    ], { windowsHide: true });
    let erro = '';
    p.stderr.on('data', (d) => { erro += d.toString(); });
    p.on('error', (e) => reject(e));
    // O ffmpeg sempre fala algo na saída de erro aqui, mesmo com sucesso
    // (-f null não grava arquivo) — o que importa é ter lido as linhas de
    // silence_start/silence_end, não o código de saída.
    p.on('close', () => resolve(erro));
  });

  const starts = [...saidaTexto.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => parseFloat(m[1]));
  const ends = [...saidaTexto.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => parseFloat(m[1]));

  const silencios = [];
  for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
    const inicio = starts[i] + margem;
    const fim = ends[i] - margem;
    if (fim - inicio > 0.05) silencios.push({ inicio, fim });
  }
  return silencios;
}

/**
 * Corta os trechos marcados (silêncios já revisados pela pessoa, tipicamente)
 * de um áudio puro, antes de qualquer imagem ou marca ser feita em cima dele
 * — usado em Gerar vídeo. Devolve também `mantidos`, a lista dos trechos que
 * sobraram, pra quem chamou poder traduzir (com remapTempo) qualquer marca
 * de tempo já feita contra o áudio antigo.
 */
async function cortarAudio({ entrada, descartes, saida, fade }) {
  const duracaoOriginal = await duracaoDoAudio(entrada);
  const plano = planejarCortes(descartes, duracaoOriginal);
  if (plano.erros.length) throw new Error(plano.erros.join(' '));

  // `fade` é opcional: sem ele, nada muda — mesma emenda seca de sempre. Com
  // ele, cada junção interna ganha um fade real (acrossfade), e isso encolhe
  // o áudio final um pouco além do que o corte sozinho encolheria — por isso
  // a duração devolvida não é mais só plano.duracaoFinal.
  const fades = fade ? calcularFadesDeJuncao(plano.mantidos) : [];
  const duracao = fades.length
    ? plano.duracaoFinal - fades.reduce((soma, f) => soma + f, 0)
    : plano.duracaoFinal;

  await rodar(exigir('ffmpeg'), argsCortarAudio({
    entrada,
    mantidos: plano.mantidos,
    duracao: duracaoOriginal,
    saida,
    fades
  }));

  return {
    ok: true,
    saida,
    duracaoOriginal,
    duracao,
    mantidos: plano.mantidos,
    fades,
    avisos: plano.avisos
  };
}

/** Largura e altura (em pixels) de uma imagem. */
async function dimensoesImagem(caminho) {
  const saida = await new Promise((resolve, reject) => {
    const p = spawn(exigir('ffprobe'), [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      caminho
    ], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('error', (e) => reject(e));
    p.on('close', (c) =>
      c === 0 ? resolve(out.trim()) : reject(new Error('Não consegui ler o tamanho desta imagem.'))
    );
  });

  const [largura, altura] = saida.split('x').map((n) => parseInt(n, 10));
  if (!isFinite(largura) || !isFinite(altura) || largura <= 0 || altura <= 0) {
    throw new Error('Imagem inválida ou sem informação de tamanho.');
  }
  return { largura, altura };
}

/**
 * Lê um arquivo de logo: tamanho, se já tem fundo transparente e a cor do
 * pixel do canto superior esquerdo (usada para tirar um fundo liso).
 */
async function infoLogo(caminho) {
  const { largura, altura } = await dimensoesImagem(caminho);

  const pixFmt = await new Promise((resolve) => {
    const p = spawn(exigir('ffprobe'), [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', caminho
    ], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('error', () => resolve(''));
    p.on('close', () => resolve(out.trim()));
  });
  const temAlfa = logosMod.temCanalAlfa(pixFmt);

  // Amostra 16 por 16 da imagem, com transparência. Daqui saem duas coisas:
  // se o fundo é liso (quase todas as bordas na mesma cor e coisa diferente no
  // miolo, então o fundo pode sair sozinho) e o quanto o desenho é claro ou
  // escuro, que decide a cor da faixa do logo.
  let corCanto = null;
  let fundoLiso = false;
  let luminancia = 0.5;
  const amostra = await new Promise((resolve) => {
    const p = spawn(exigir('ffmpeg'), [
      '-v', 'error', '-i', caminho,
      '-vf', 'scale=16:16:flags=neighbor,format=rgba',
      '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'
    ], { windowsHide: true });
    const partes = [];
    p.stdout.on('data', (d) => partes.push(d));
    p.on('error', () => resolve(null));
    p.on('close', () => resolve(Buffer.concat(partes)));
  });
  if (amostra && amostra.length >= 16 * 16 * 4) {
    const px = (x, y) => {
      const o = (y * 16 + x) * 4;
      return [amostra[o], amostra[o + 1], amostra[o + 2], amostra[o + 3]];
    };
    const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    const todos = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) todos.push(px(x, y));
    let tinta = todos;

    if (!temAlfa) {
      const borda = [];
      const miolo = [];
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          (x === 0 || y === 0 || x === 15 || y === 15 ? borda : miolo).push(px(x, y));
        }
      }
      const mediana = (i) => {
        const v = borda.map((c) => c[i]).sort((m, n) => m - n);
        return v[Math.floor(v.length / 2)];
      };
      const ref = [mediana(0), mediana(1), mediana(2)];
      const dist = (c) => Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) + Math.abs(c[2] - ref[2]);
      const iguais = borda.filter((c) => dist(c) <= 60).length / borda.length;
      const diferentes = miolo.filter((c) => dist(c) > 90);
      if (iguais >= 0.9 && diferentes.length >= 3) {
        fundoLiso = true;
        corCanto = `0x${logosMod.hex(ref[0])}${logosMod.hex(ref[1])}${logosMod.hex(ref[2])}`;
        tinta = diferentes;   // o desenho, sem o fundo
      }
    } else {
      const opacos = todos.filter((c) => c[3] > 128);
      if (opacos.length) tinta = opacos;
    }
    luminancia = tinta.reduce((a, c) => a + lum(c), 0) / tinta.length;
  }

  return { largura, altura, temAlfa, fundoLiso, corCanto, luminancia };
}

/**
 * Compara cada imagem com o formato de saída escolhido: orientação diferente
 * (deitada num vídeo em pé, ou o contrário) e resolução bem menor que a
 * resolução de trabalho (sinal de que o zoom vai deixar a imagem borrada).
 * Imagem quadrada não entra em conflito de orientação com nenhum dos dois
 * lados — só é avaliada pela resolução.
 *
 * Não corrige nada sozinha: só aponta, pra quem não pode checar visualmente
 * decidir manter, trocar ou remover, antes de gerar — não só depois, ouvindo
 * o resultado.
 */
async function analisarImagens(caminhos, formatoId) {
  const formato = getFormato(formatoId);
  const orientacaoVideo = formato.largura === formato.altura ? 'quadrada' : formato.largura > formato.altura ? 'horizontal' : 'vertical';

  const resultados = [];
  for (const caminho of caminhos) {
    try {
      const { largura, altura } = await dimensoesImagem(caminho);
      const orientacaoImagem =
        largura === altura ? 'quadrada' : (largura > altura ? 'horizontal' : 'vertical');

      let aviso = null;
      if (orientacaoImagem !== 'quadrada' && orientacaoImagem !== orientacaoVideo) {
        aviso = {
          motivo: 'orientacao',
          mensagem: orientacaoVideo === 'quadrada'
            ? `Esta imagem está na ${orientacaoImagem} e o vídeo é quadrado. O programa preenche os lados que sobram sozinho, com um fundo desfocado da própria imagem.`
            : orientacaoImagem === 'vertical'
            ? 'Esta imagem está na vertical e o vídeo é horizontal. O programa preenche as laterais sozinho, com um fundo desfocado da própria imagem.'
            : 'Esta imagem está na horizontal e o vídeo é vertical. O programa preenche em cima e embaixo sozinho, com um fundo desfocado da própria imagem.'
        };
      } else if (largura < formato.largura * 0.7 || altura < formato.altura * 0.7) {
        // Diz o tamanho da imagem e o mínimo recomendado pro formato atual —
        // sem esses dois números, quem não pode olhar a imagem não tem como
        // saber se está pertinho do limite ou bem abaixo dele.
        const minLargura = Math.round(formato.largura * 0.7);
        const minAltura = Math.round(formato.altura * 0.7);
        aviso = {
          motivo: 'resolucao',
          mensagem:
            `Esta imagem tem ${largura} por ${altura} pixels — menor que o recomendado para ` +
            `este vídeo. O ideal é pelo menos ${minLargura} por ${minAltura} (ou ${formato.largura} ` +
            `por ${formato.altura} pra ficar no tamanho cheio). O programa reduz o zoom sozinho nessa imagem para proteger a nitidez.`
        };
      }

      resultados.push({ caminho, largura, altura, aviso });
    } catch (e) {
      resultados.push({ caminho, erro: e.message, aviso: null });
    }
  }
  return resultados;
}

function cancelar() {
  cancelado = true;
  if (processoAtual) {
    try {
      processoAtual.kill('SIGKILL');
    } catch (_) {}
  }
}

function limpar(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

/**
 * Renderiza o vídeo inteiro.
 *
 * onProgresso recebe { etapa, feito, total, texto } — o texto é escrito pra ser
 * lido em voz alta sem parecer ruído.
 */
/**
 * Espalha os textos pelos segmentos.
 *
 * Um texto vive num intervalo do vídeo inteiro, mas os segmentos são
 * renderizados em arquivos separados. Então cada texto é recortado contra cada
 * segmento: o que cai dentro vira um filtro naquele pedaço, com os tempos
 * convertidos pro relógio local. Texto que atravessa uma troca de imagem
 * aparece nos dois, com as pontas aparadas, e a animação não muda — as contas
 * continuam usando o tempo original.
 */
function distribuirTextos({ textos, segmentos, obterFonte, formato, temp, transicaoDuracao }) {
  const porSegmento = segmentos.map(() => []);
  const T = transicaoDuracao || 0;
  let relogio = 0;
  const limites = segmentos.map((seg, idx) => {
    const temEsquerda = T > 0 && idx > 0;
    const temDireita = T > 0 && idx < segmentos.length - 1;
    const inicioSolo = relogio;
    const faixa = {
      inicio: inicioSolo - (temEsquerda ? T : 0),
      fim: inicioSolo + seg.duracao + (temDireita ? T : 0),
      deslocamento: temEsquerda ? T : 0
    };
    relogio += seg.duracao + (temDireita ? T : 0);
    return faixa;
  });

  textos.forEach((texto, i) => {
    const arquivo = path.join(temp, `texto_${i}.txt`);
    fs.writeFileSync(arquivo, texto.linhas.join('\n'), 'utf8');

    const fimTexto = texto.inicio + texto.duracao;

    limites.forEach((faixa, idx) => {
      const de = Math.max(texto.inicio, faixa.inicio);
      const ate = Math.min(fimTexto, faixa.fim);
      if (ate - de < 0.05) return;

      const seg = segmentos[idx];
      const visivelDe = Math.max(0, de - faixa.inicio - faixa.deslocamento);
      const visivelAte = Math.min(seg.duracao, ate - faixa.inicio - faixa.deslocamento);
      if (visivelAte - visivelDe < 0.05) return; // só apareceria durante a massa da transição

      porSegmento[idx].push({
        arquivoTexto: arquivo,
        fonte: obterFonte(seg.preset),
        inicio: texto.inicio - faixa.inicio - faixa.deslocamento,
        duracao: texto.duracao,
        entrada: texto.entrada,
        tamanho: tamanhoFonte(formato, texto.tipo, seg.preset.titulo.escala || 1),
        visivelDe,
        visivelAte
      });
    });
  });

  return porSegmento;
}

/**
 * Confere e prepara a lista de camadas de trilha, antes de qualquer render
 * pesado começar.
 *
 * Uma camada em loop sai daqui já transformada num arquivo de ciclo fechado
 * (o cruzamento de argsLoopTrilha), pronta pra ser repetida na hora da
 * mistura. Uma camada estática só é conferida: se o tempo marcado for depois
 * do fim do vídeo, ela nunca seria ouvida, e isso é audível apenas por quem
 * enxerga a ausência — ou seja, ninguém. Por isso é erro que impede de
 * gerar, do mesmo jeito que um título marcado depois do fim do áudio. Se ela
 * começa a tempo mas seria cortada antes de acabar, isso já é perceptível ao
 * ouvir o resultado, então vira só um aviso falado.
 */
async function prepararCamadas({ camadas, duracaoVideo, temp, aviso, executar, independente }) {
  // `executar` permite rodar fora da fila principal (Salvar áudio em segundo
  // plano), sem mexer no processo que o botão Cancelar controla.
  const rodarAqui = executar || rodar;
  const preparadas = [];
  const erros = [];
  const total = (camadas || []).length;

  for (let i = 0; i < total; i++) {
    if (cancelado && !independente) throw new Error('CANCELADO');
    const c = camadas[i];
    const pos = i + 1;

    if (!c || !c.arquivo) {
      erros.push(`Trilha ${pos} não tem arquivo de áudio escolhido.`);
      continue;
    }

    const volume = typeof c.volume === 'number' ? c.volume : 0.1;
    const duracaoArquivo = await duracaoDoAudio(c.arquivo);

    if (c.tipo === 'estatico') {
      const tempoInicio = Math.max(0, Number(c.tempo) || 0);

      if (tempoInicio >= duracaoVideo) {
        erros.push(
          `Trilha ${pos} está marcada para começar em ${formatarTempo(tempoInicio)}, ` +
          `depois do fim do vídeo (${formatarTempo(duracaoVideo)}). Ela nunca seria ouvida.`
        );
        continue;
      }

      if (c.repetir) {
        // Repete até o fim: o arquivo original passa pelo mesmo cruzamento
        // da trilha em loop, só que a volta começa no tempo marcado, não no
        // começo do vídeo. Se uma trilha contínua mais nova assume antes
        // (encerraEm), a janela termina lá, não no fim do vídeo.
        const temEncerramento = typeof c.encerraEm === 'number' && c.encerraEm < duracaoVideo;
        const fimJanela = temEncerramento ? c.encerraEm : duracaoVideo;
        const restante = Math.max(0.1, fimJanela - tempoInicio);
        const loopPronto = path.join(temp, `trilha_loop_${i}.wav`);
        await rodarAqui(exigir('ffmpeg'), argsLoopTrilha({
          trilha: c.arquivo,
          duracao: duracaoArquivo,
          saida: loopPronto
        }));

        const voltas = restante / Math.max(0.1, duracaoArquivo - 2);
        const ate = temEncerramento
          ? `até a trilha seguinte assumir, em ${formatarTempo(fimJanela)}`
          : 'até o fim do vídeo';
        aviso('trilha', i, total,
          voltas > 1.05
            ? `Trilha ${pos}, começando em ${formatarTempo(tempoInicio)} e repetindo ` +
              `${voltas.toFixed(1)} vezes ${ate}.`
            : `Trilha ${pos}, começando em ${formatarTempo(tempoInicio)} e indo ${ate}, ` +
              `sem precisar repetir.`);

        preparadas.push({
          arquivo: loopPronto,
          tipo: 'estatico',
          tempo: tempoInicio,
          repetir: true,
          encerraEm: temEncerramento ? fimJanela : undefined,
          volume
        });
      } else {
        if (tempoInicio + duracaoArquivo > duracaoVideo + 0.05) {
          aviso('trilha', i, total,
            `Trilha ${pos} começa em ${formatarTempo(tempoInicio)} e vai ser cortada ` +
            `antes de acabar, porque o vídeo termina antes dela.`);
        } else {
          aviso('trilha', i, total,
            `Trilha ${pos}, estática, começando em ${formatarTempo(tempoInicio)}.`);
        }

        preparadas.push({
          arquivo: c.arquivo,
          tipo: 'estatico',
          tempo: tempoInicio,
          duracao: duracaoArquivo,
          fadeEntrada: c.fadeEntrada === true,
          fadeSaida: c.fadeSaida === true,
          volume
        });
      }
    } else {
      const loopPronto = path.join(temp, `trilha_loop_${i}.wav`);
      await rodarAqui(exigir('ffmpeg'), argsLoopTrilha({
        trilha: c.arquivo,
        duracao: duracaoArquivo,
        saida: loopPronto
      }));

      // Se uma trilha contínua mais nova assume antes (encerraEm), a janela
      // desta termina lá, não no fim do vídeo.
      const temEncerramento = typeof c.encerraEm === 'number' && c.encerraEm < duracaoVideo;
      const fimJanela = temEncerramento ? c.encerraEm : duracaoVideo;
      const voltas = fimJanela / Math.max(0.1, duracaoArquivo - 2);
      const ate = temEncerramento
        ? `até a trilha seguinte assumir, em ${formatarTempo(fimJanela)}`
        : 'para cobrir o vídeo';
      aviso('trilha', i, total,
        voltas > 1.05
          ? `Trilha ${pos}, em loop, de ${formatarTempo(duracaoArquivo)} dando ` +
            `${voltas.toFixed(1)} voltas ${ate}.`
          : temEncerramento
            ? `Trilha ${pos}, em loop ${ate}.`
            : `Trilha ${pos}, em loop, mais longa que o vídeo, vai ser cortada no fim.`);

      preparadas.push({
        arquivo: loopPronto,
        tipo: 'loop',
        encerraEm: temEncerramento ? fimJanela : undefined,
        volume
      });
    }
  }

  return { preparadas, erros };
}

const DURACAO_PREVIA = 6; // segundos: 3 pra trás, 3 pra frente do cursor.
let ultimaPrevia = null;

/**
 * Decide, pra cada camada, se ela soa dentro da janela da prévia e como
 * encaixar o pedaço certo do arquivo dela — sem preparar nada pesado (sem
 * gerar o loop fechado, sem conferir erro de tempo depois do fim do vídeo:
 * isso é coisa da hora de renderizar de verdade, com prepararCamadas). Aqui é
 * só uma amostra rápida, pensada pra ser pedida várias vezes seguidas.
 */
async function prepararPreviaCamadas({ camadas, janelaInicio, janelaFim, duracaoVideo }) {
  const prontas = [];

  for (const c of camadas || []) {
    if (!c || !c.arquivo) continue;
    const volume = typeof c.volume === 'number' ? c.volume : 0.1;
    const continua = c.tipo === 'loop' || (c.tipo === 'estatico' && c.repetir);

    if (continua) {
      const startRef = c.tipo === 'loop' ? 0 : Math.max(0, Number(c.tempo) || 0);
      const fimCamada = typeof c.encerraEm === 'number' ? c.encerraEm : duracaoVideo;
      if (startRef > janelaFim || fimCamada <= janelaInicio) continue; // nunca soaria nesta janela

      if (janelaInicio >= startRef) {
        const duracaoArquivo = await duracaoDoAudio(c.arquivo);
        const base = Math.max(0.1, duracaoArquivo);
        const seekEm = (janelaInicio - startRef) % base;
        prontas.push({ arquivo: c.arquivo, volume, loop: true, modo: 'seek', seekEm });
      } else {
        prontas.push({
          arquivo: c.arquivo, volume, loop: true, modo: 'delay',
          delayMs: (startRef - janelaInicio) * 1000
        });
      }
    } else {
      const duracaoArquivo = await duracaoDoAudio(c.arquivo);
      const inicioCamada = Math.max(0, Number(c.tempo) || 0);
      const fimCamada = inicioCamada + duracaoArquivo;
      if (fimCamada <= janelaInicio || inicioCamada >= janelaFim) continue; // fora da janela

      if (inicioCamada <= janelaInicio) {
        prontas.push({ arquivo: c.arquivo, volume, loop: false, modo: 'seek', seekEm: janelaInicio - inicioCamada });
      } else {
        prontas.push({
          arquivo: c.arquivo, volume, loop: false, modo: 'delay',
          delayMs: (inicioCamada - janelaInicio) * 1000
        });
      }
    }
  }

  return prontas;
}

/**
 * Gera uma amostra de poucos segundos (3 antes, 3 depois do cursor, menos se
 * o áudio for mais curto que isso) com o áudio principal e as trilhas que
 * soariam naquele trecho, já misturadas. É só uma prévia pra ouvir antes de
 * confirmar — não precisa do vídeo montado, e pode ser pedida de novo quantas
 * vezes forem precisas, em qualquer ponto.
 */
async function gerarPreviaMixagem({ audioPrincipal, duracaoAudio, cursor, camadas, ganhoVozDb }) {
  if (!audioPrincipal) throw new Error('Nenhum áudio principal escolhido ainda.');
  const duracaoTotal = Number(duracaoAudio) || 0;
  if (!(duracaoTotal > 0)) throw new Error('Não sei a duração do áudio principal ainda.');

  const meia = DURACAO_PREVIA / 2;
  let inicio = Math.max(0, (Number(cursor) || 0) - meia);
  if (duracaoTotal > DURACAO_PREVIA) inicio = Math.min(inicio, duracaoTotal - DURACAO_PREVIA);
  const duracaoJanela = Math.min(DURACAO_PREVIA, Math.max(0.1, duracaoTotal - inicio));
  const fim = inicio + duracaoJanela;

  const camadasProntas = await prepararPreviaCamadas({
    camadas, janelaInicio: inicio, janelaFim: fim, duracaoVideo: duracaoTotal
  });

  const destino = path.join(os.tmpdir(), `gv_previa_${Date.now()}.mp3`);
  if (ultimaPrevia) { try { fs.unlinkSync(ultimaPrevia); } catch (_) {} }
  ultimaPrevia = destino;

  // 1.8.6: a voz da prévia sai no mesmo volume do tocador da tela (nivelada + volume), para equilibrar a trilha
  // com a voz de verdade. Só a janela da prévia é lida.
  let principal = audioPrincipal, ini = inicio, vozTemp = null;
  const g = Number(ganhoVozDb);
  if (isFinite(g) && Math.abs(g) > 0.01) {
    vozTemp = path.join(os.tmpdir(), `gv_previa_voz_${Date.now()}.wav`);
    await rodar(exigir('ffmpeg'), ['-y', '-v', 'error', '-ss', inicio.toFixed(3), '-t', duracaoJanela.toFixed(3), '-i', audioPrincipal,
      '-vn', '-af', `volume=${g.toFixed(2)}dB`, vozTemp]);
    principal = vozTemp; ini = 0;
  }
  try {
    await rodar(exigir('ffmpeg'), argsPreviaMixagem({
      audioPrincipal: principal, janelaInicio: ini, duracaoJanela, camadas: camadasProntas, saida: destino
    }));
  } finally { if (vozTemp) { try { fs.unlinkSync(vozTemp); } catch (_) { /* */ } } }

  return { caminho: destino, inicio, duracaoJanela };
}

async function renderizar(
  { audio, imagens, modo, presetId, formatoId, qualidadeId, saida, titulos, fim, marcas, camadas, legenda, legendaEstilo, renovarMovimento: intervaloRenovar, semImagens, tituloFixo, logos },
  onProgresso
) {
  cancelado = false;

  // 1.9: com legenda, os títulos sobem para a parte de cima da imagem (título e logo ficam sempre
  // em cima; a legenda fica embaixo ou no meio, e os dois não se encontram).
  const comLegenda = !!(legenda && String(legenda).trim());
  const getPresetDaMontagem = (id) => {
    const p = getPreset(id);
    return comLegenda && p && p.titulo ? { ...p, titulo: { ...p.titulo, posicao: Math.min(p.titulo.posicao, POSICAO_TITULO_COM_LEGENDA) } } : p;
  };
  let preset = getPresetDaMontagem(presetId);
  const presetInicial = preset;
  const formato = getFormato(formatoId || 'horizontal');
  const qualidade = getQualidade(qualidadeId || 'rapida');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gerador-video-'));

  const aviso = (etapa, feito, total, texto) => {
    if (typeof onProgresso === 'function') onProgresso({ etapa, feito, total, texto });
  };

  try {
    if (Array.isArray(logos) && logos.length) {
      if (logos.length > logosMod.MAXIMO_LOGOS) {
        throw new Error(`No máximo ${logosMod.MAXIMO_LOGOS} logos por vídeo.`);
      }
      logos.forEach((l, i) => {
        const erros = logosMod.validarLogo(l, null);
        if (erros.length) throw new Error(`Logo ${i + 1}: ${erros[0]}`);
        if (!fs.existsSync(l.caminho)) throw new Error(`Logo ${i + 1}: não encontrei o arquivo ${path.basename(l.caminho)}.`);
      });
    }

    // Com algum logo na faixa, as imagens ficam num quadro mais baixo e a
    // faixa ocupa o topo. O quadro das imagens é calculado uma vez aqui.
    const temFaixa = Array.isArray(logos) && logos.some((l) => l.modo === 'faixa');
    const faixaPx = temFaixa ? logosMod.alturaFaixa(formato.altura) : 0;
    const formatoImg = temFaixa ? { ...formato, altura: formato.altura - faixaPx } : formato;
    let linhasTelaTitulo = 0;

    // --- Sem imagens: tela preta com o título --------------------------------
    // O título vira a única "imagem", parada o vídeo inteiro (sem zoom, sem
    // deslize, sem cor). Daqui pra frente o resto do caminho é o de sempre.
    if (semImagens) {
      const texto = String(tituloFixo || '').trim();
      const lim = limitesDe(formato.id);
      if (!texto) {
        throw new Error('Sem imagens, o título do vídeo é tudo o que aparece na tela. Escreva o título.');
      }
      if (texto.length > lim.titulo) {
        throw new Error(
          `O título tem ${texto.length} caracteres e neste formato cabem ${lim.titulo}. Encurte em ${texto.length - lim.titulo}.`
        );
      }
      const fonte = resolverFonte(preset.titulo.fontes);
      if (!fonte) throw new Error('Não encontrei nenhuma fonte utilizável para desenhar o título.');

      const linhas = quebrarLinhas(texto, lim.porLinha);
      const arquivosLinhas = linhas.map((linha, k) => {
        const arq = path.join(temp, `titulo_linha_${k}.txt`);
        fs.writeFileSync(arq, linha, 'utf8');
        return arq;
      });
      const telaTitulo = path.join(temp, 'tela_titulo.png');
      await rodar(exigir('ffmpeg'), argsTelaTitulo({ fonte, arquivosLinhas, formato: formatoImg, saida: telaTitulo }));

      linhasTelaTitulo = linhas.length;
      imagens = [telaTitulo];
      modo = 'distribuir';
      marcas = undefined;
      preset = { ...preset, zoomAmount: 0, panPattern: [0], grade: '' };
      aviso('preparando', 1, 1, 'Sem imagens: o vídeo será uma tela preta com o título.');
    }

    // --- Linha do tempo -----------------------------------------------------
    aviso('preparando', 0, 1, 'Lendo o áudio...');
    const audioDuration = await duracaoDoAudio(audio);
    let segmentos = buildTimeline({
      audioDuration,
      imageCount: imagens.length,
      modo,
      preset,
      marcas
    });

    aviso(
      'preparando',
      1,
      1,
      `Áudio de ${formatarTempo(audioDuration)}, ${formato.largura} por ${formato.altura}. ` +
      resumirTimeline(segmentos, imagens.length)
    );

    // --- Textos -------------------------------------------------------------
    const checagem = validarTitulos({
      titulos,
      fim,
      duracaoAudio: audioDuration,
      formatoId: formato.id,
      preset
    });

    if (checagem.erros.length) {
      throw new Error(checagem.erros.join(' '));
    }
    // Avisos não impedem de gerar, mas a pessoa precisa ouvi-los: são o
    // retorno que a visão daria, como o texto ter quebrado em duas linhas.
    for (const texto of checagem.avisos) aviso('preparando', 1, 1, texto);

    // --- Troca de preset por título ------------------------------------------
    // Um título pode marcar "a partir daqui, outra atmosfera". O resumo falado
    // acima já usou a duração "de verdade" de cada imagem; a partir daqui os
    // segmentos podem vir divididos — a mesma imagem, com presets diferentes
    // em pedaços diferentes dela.
    const pontosTroca = [];
    for (const t of checagem.prontos) {
      if (!t.trocarPreset) continue;
      let presetTrocado;
      try {
        presetTrocado = getPresetDaMontagem(t.trocarPreset);
      } catch (e) {
        throw new Error(`Título em ${formatarTempo(t.inicio)}: ${e.message}`);
      }
      pontosTroca.push({ tempo: t.inicio, presetId: t.trocarPreset, preset: presetTrocado });
    }

    if (pontosTroca.length) {
      const presetsEnvolvidos = [preset, ...pontosTroca.map((p) => p.preset)];
      const comTransicao = presetsEnvolvidos.find((p) => p.transicao);
      if (comTransicao) {
        throw new Error(
          `O preset "${comTransicao.nome}" usa passagem de página entre as ` +
          `imagens, e isso ainda não funciona junto com troca de preset por ` +
          `título. Tire a troca de preset, ou escolha outro preset pra essas ` +
          `imagens.`
        );
      }
      segmentos = aplicarTrocasDePreset(segmentos, {
        presetPrincipal: preset,
        resolvePreset: (id) => {
          // fps precisa ser o mesmo em todo o vídeo, senão a emenda quebra —
          // então todo preset trocado herda o fps do preset principal.
          const p = getPresetDaMontagem(id);
          return p.fps === preset.fps ? p : { ...p, fps: preset.fps };
        },
        pontos: pontosTroca.map((p) => ({ tempo: p.tempo, presetId: p.presetId }))
      });
      finalizarSegmentos(segmentos);
    } else if (preset.transicao) {
      aplicarTransicaoCruzada(segmentos, preset);
    }

    // --- Movimento renovado nas imagens longas ------------------------------
    // A renovação do movimento é automática: o intervalo vem do ritmo do
    // preset (cerca de cinco vezes o tempo normal de uma imagem, entre 30 e
    // 90 segundos). Só age em imagem que fica muito tempo na tela, e não vale
    // nos presets que juntam as imagens com passagem entre elas. Quem chama
    // pode passar um número para forçar, ou 0 para desligar (usado em testes).
    {
      const automatico = !(intervaloRenovar >= 0);
      const intervalo = automatico
        ? Math.min(90, Math.max(30, (preset.baseDuration || 10) * 5))
        : intervaloRenovar;
      if (intervalo > 0 && !preset.transicao) {
        const antes = segmentos.length;
        segmentos = renovarMovimento(segmentos, intervalo);
        if (segmentos.length > antes) {
          aviso('preparando', 1, 1,
            `As imagens que ficam muito tempo na tela renovam o movimento sozinhas, ` +
            `a cada cerca de ${Math.round(intervalo)} segundos, sempre na mesma imagem.`);
        }
      } else if (intervalo > 0 && !automatico) {
        aviso('preparando', 1, 1,
          `O preset ${preset.nome} junta as imagens com passagem entre elas, e nele ` +
          `a renovação do movimento não vale. As imagens longas ficam como estão.`);
      }
    }

    const listaTextos = [...checagem.prontos];
    if (checagem.fim) listaTextos.push(checagem.fim);
    listaTextos.forEach((t) => {
      t.entrada = t.tipo === 'fim' ? preset.titulo.entrada * 1.4 : preset.titulo.entrada;
    });

    // --- Logos: conferência e momentos dos títulos ---------------------------
    const listaLogos = Array.isArray(logos) ? logos : [];
    const logosDeTitulo = listaLogos.filter((l) => l.modo === 'titulo');
    const conflito = logosMod.conflitoNaFaixa(listaLogos, audioDuration);
    if (conflito) throw new Error(conflito);
    for (const [i, l] of listaLogos.entries()) {
      if (l.modo === 'faixa' && (l.inicio || 0) >= audioDuration) {
        throw new Error(`Logo ${i + 1}: começaria depois do fim do vídeo.`);
      }
    }

    // O logo do título fica logo acima do texto. A altura do texto é estimada
    // pelo tamanho da letra e pelo número de linhas, com folga, para o logo
    // nunca encostar na caixa do título.
    const ocorrenciasTitulo = [];
    if (logosDeTitulo.length) {
      const presetEm = (t) => {
        let acumulado = 0;
        for (const seg of segmentos) {
          acumulado += seg.duracao;
          if (t < acumulado) return seg.preset;
        }
        return preset;
      };
      const folga = Math.round(formato.altura * 0.02);
      if (semImagens) {
        // Tela só com o título: ele fica parado no meio, o vídeo todo.
        const tam = Math.round(Math.min(formatoImg.largura, formatoImg.altura) * 0.062);
        const passo = Math.round(tam * 1.45);
        const topo = (formatoImg.altura - (linhasTelaTitulo - 1) * passo) / 2;
        ocorrenciasTitulo.push({
          inicio: 0,
          fim: audioDuration,
          entrada: 1.2,
          baixoY: faixaPx + topo - tam * 0.62 - tam * 0.4
        });
      } else {
        for (const t of listaTextos) {
          const pt = presetEm(t.inicio);
          const fs = tamanhoFonte(formato, t.tipo, pt.titulo.escala || 1);
          const n = t.linhas.length;
          const alturaTexto = n * fs * 1.3 + (n - 1) * pt.titulo.espacoLinha;
          const centro = faixaPx + formatoImg.altura * pt.titulo.posicao;
          let baixoY = centro - alturaTexto / 2 - pt.titulo.margemCaixa - fs * 0.35;
          baixoY = Math.max(baixoY, faixaPx + folga + formato.altura * 0.12);
          ocorrenciasTitulo.push({
            inicio: t.inicio,
            fim: t.inicio + t.duracao,
            entrada: t.entrada,
            baixoY
          });
        }
      }
      if (!ocorrenciasTitulo.length) {
        throw new Error(
          'Há um logo marcado para aparecer junto do título, mas o vídeo não tem nenhum título. ' +
          'Escreva um título na etapa Imagens ou Extras, ou mude o logo para a faixa.'
        );
      }
    }

    // Uma fonte por preset realmente usado, resolvida uma vez só e reusada —
    // com troca de preset por título, segmentos diferentes podem pedir fontes
    // diferentes.
    const fontesPorPreset = new Map();
    const obterFonte = (presetDoSegmento) => {
      if (!fontesPorPreset.has(presetDoSegmento.id)) {
        fontesPorPreset.set(presetDoSegmento.id, resolverFonte(presetDoSegmento.titulo.fontes));
      }
      return fontesPorPreset.get(presetDoSegmento.id);
    };

    let textosPorSegmento = segmentos.map(() => []);
    if (listaTextos.length) {
      for (const presetUsado of new Set(segmentos.map((s) => s.preset))) {
        if (!obterFonte(presetUsado)) {
          throw new Error(
            'Não encontrei nenhuma fonte utilizável para desenhar o texto. ' +
            'Gere sem título, ou avise para eu acrescentar outra alternativa.'
          );
        }
      }
      textosPorSegmento = distribuirTextos({
        textos: listaTextos,
        segmentos,
        obterFonte,
        formato,
        temp,
        transicaoDuracao: preset.transicao ? preset.fade : 0
      });
    }

    // --- Camadas de trilha ---------------------------------------------------
    // Conferidas e preparadas aqui, antes de qualquer render pesado, porque um
    // erro de tempo (uma trilha estática marcada depois do fim do vídeo) é
    // sempre melhor descoberto agora do que depois de esperar o vídeo inteiro
    // ficar pronto.
    const temCamadas = Array.isArray(camadas) && camadas.length > 0;
    let camadasPreparadas = [];
    if (temCamadas) {
      const resultado = await prepararCamadas({
        camadas,
        duracaoVideo: audioDuration,
        temp,
        aviso
      });
      if (resultado.erros.length) throw new Error(resultado.erros.join(' '));
      camadasPreparadas = resultado.preparadas;
    }

    // --- Normalização -------------------------------------------------------
    // Cada imagem é normalizada uma vez só, mesmo que apareça várias vezes no
    // modo looping. É o que faz o modo looping render rápido.
    const normalizadas = [];
    const fatoresZoom = [];
    for (let i = 0; i < imagens.length; i++) {
      if (cancelado) throw new Error('CANCELADO');
      const destino = path.join(temp, `norm_${String(i).padStart(3, '0')}.png`);
      // Quanto a imagem precisa ser ampliada para caber no quadro. Acima de 1,
      // ela já nasce menos nítida, e o zoom do preset encolhe na mesma medida.
      let fator = 1;
      try {
        const dim = await dimensoesImagem(imagens[i]);
        const ampliacao = Math.min(formatoImg.largura / dim.largura, formatoImg.altura / dim.altura);
        if (ampliacao > 1) fator = Math.max(0.3, 1 / ampliacao);
      } catch (_) { /* sem a medida, segue com o zoom inteiro */ }
      fatoresZoom.push(fator);
      await rodar(exigir('ffmpeg'), argsNormalizar({
        entrada: imagens[i],
        saida: destino,
        formato: formatoImg,
        qualidade,
        fundo: presetInicial.fundoImagem
      }));
      normalizadas.push(destino);
      aviso('normalizando', i + 1, imagens.length,
        `Ajustando imagens: ${i + 1} de ${imagens.length}.`);
    }

    // --- Segmentos ----------------------------------------------------------
    const arquivosSegmento = [];
    for (let i = 0; i < segmentos.length; i++) {
      if (cancelado) throw new Error('CANCELADO');
      const seg = segmentos[i];
      const destino = path.join(temp, `seg_${String(i).padStart(5, '0')}.mp4`);
      await rodar(exigir('ffmpeg'), argsSegmento({
        imagem: normalizadas[seg.imagem],
        segmento: { ...seg, zoomFator: fatoresZoom[seg.imagem] },
        preset: seg.preset,
        formato: formatoImg,
        qualidade,
        saida: destino,
        textos: textosPorSegmento[i]
      }));

      if (preset.transicao && (seg.transicaoEsquerda || seg.transicaoDireita)) {
        const destinoPad = path.join(temp, `seg_${String(i).padStart(5, '0')}_pad.mp4`);
        await rodar(exigir('ffmpeg'), argsPadSegmento({
          entrada: destino,
          saida: destinoPad,
          qualidade,
          fps: preset.fps,
          padEsquerda: seg.transicaoEsquerda ? preset.fade : 0,
          padDireita: seg.transicaoDireita ? preset.fade : 0
        }));
        arquivosSegmento.push(destinoPad);
      } else {
        arquivosSegmento.push(destino);
      }

      if (i % 5 === 0 || i === segmentos.length - 1) {
        aviso('segmentos', i + 1, segmentos.length,
          `Montando o movimento: ${i + 1} de ${segmentos.length}.`);
      }
    }

    // --- Junção -------------------------------------------------------------
    if (cancelado) throw new Error('CANCELADO');

    // Com camadas de trilha e/ou legenda, cada etapa extra escreve num
    // arquivo intermediário: as camadas entram por cima do vídeo já casado
    // com a narração original, e a legenda é a última coisa a ser gravada,
    // por cima de tudo o que vier antes dela.
    const temLegenda = !!(legenda && String(legenda).trim());
    const destinoAntesDaLegenda = temLegenda ? path.join(temp, 'sem_legenda.mp4') : saida;
    const temLogos = listaLogos.length > 0;
    const destinoAntesDosLogos = temLogos ? path.join(temp, 'sem_logo.mp4') : destinoAntesDaLegenda;
    const destinoEmenda = temCamadas ? path.join(temp, 'sem_trilha.mp4') : destinoAntesDosLogos;

    aviso('juntando', 0, 1, 'Juntando tudo e casando com o áudio...');

    if (preset.transicao) {
      // A passagem de página pede um caminho próprio: primeiro o vídeo mudo
      // com as transições encadeadas, depois ele casa com a narração.
      const videoMudo = path.join(temp, 'video_transicao.mp4');
      await rodar(exigir('ffmpeg'), argsJuntarTransicao({
        arquivos: arquivosSegmento,
        transicao: preset.transicao,
        duracaoTransicao: preset.fade,
        segmentos,
        qualidade,
        saida: videoMudo
      }));
      await rodar(exigir('ffmpeg'), argsCasarAudio({
        video: videoMudo,
        audio,
        saida: destinoEmenda,
        duracao: audioDuration
      }));
    } else {
      const listaPath = path.join(temp, 'lista.txt');
      fs.writeFileSync(listaPath, arquivosSegmento.map(linhaLista).join('\n'), 'utf8');
      await rodar(exigir('ffmpeg'), argsJuntar({ listaPath, audio, saida: destinoEmenda, duracao: audioDuration }));
    }

    if (temCamadas) {
      if (cancelado) throw new Error('CANCELADO');
      aviso('trilha', camadasPreparadas.length, camadasPreparadas.length + 1, 'Aplicando as trilhas...');
      await rodar(exigir('ffmpeg'), argsMixCamadas({
        video: destinoEmenda,
        camadas: camadasPreparadas,
        duracaoVideo: audioDuration,
        saida: destinoAntesDosLogos
      }));
      aviso('trilha', camadasPreparadas.length + 1, camadasPreparadas.length + 1,
        camadasPreparadas.length > 1 ? 'Trilhas aplicadas.' : 'Trilha aplicada.');
    }

    if (temLogos) {
      if (cancelado) throw new Error('CANCELADO');
      aviso('logo', 0, 1, listaLogos.length > 1 ? 'Colocando os logos...' : 'Colocando o logo...');
      await rodar(exigir('ffmpeg'), logosMod.argsAplicarLogos({
        video: destinoAntesDosLogos,
        logos: listaLogos,
        formato,
        duracao: audioDuration,
        estilo: presetInicial.logo,
        ocorrencias: ocorrenciasTitulo,
        faixaPx,
        fps: preset.fps,
        fadeFaixa: {
          entrada: (segmentos[0] && segmentos[0].fadeIn) || 0,
          saida: (segmentos[segmentos.length - 1] && segmentos[segmentos.length - 1].fadeOut) || 0
        },
        saida: destinoAntesDaLegenda
      }));
      aviso('logo', 1, 1, listaLogos.length > 1 ? 'Logos aplicados.' : 'Logo aplicado.');
    }

    if (temLegenda) {
      if (cancelado) throw new Error('CANCELADO');

      // Antes de queimar, uma segunda conferida no .srt: conserta o que é
      // seguro consertar sem tocar no áudio (quebra de linha, palavra
      // cortada, duração ruim) e avisa o resultado — sem entrar em detalhe,
      // porque quem gera não vai poder olhar o vídeo depois para checar.
      let legendaParaQueimar;
      if (legendaEstilo && LEG.estilo(legendaEstilo)) {
        // 1.9: legenda da tela de legenda: já vem dividida e revisada no estilo escolhido;
        // vira um ASS no tamanho do vídeo, com a posição e a letra do estilo.
        legendaParaQueimar = path.join(temp, 'legenda.ass');
        const cues = parseSrt(fs.readFileSync(legenda, 'utf8')).map((c) => ({ inicio: c.inicio, fim: c.fim, texto: c.linhas.join(' ') }));
        fs.writeFileSync(legendaParaQueimar, LEG.assDasLegendas(cues, legendaEstilo, formato.largura, formato.altura), 'utf8');
      } else {
        aviso('legenda', 0, 3, 'Revisando a legenda antes de gravar...');
        const legendaRevisada = path.join(temp, 'legenda_revisada.srt');
        const revisao = revisarArquivoLegenda(legenda, legendaRevisada, fs);
        legendaParaQueimar = revisao.caminho;
        aviso('legenda', 1, 3, revisao.resumo);
      }

      aviso('legenda', 0, 100, 'Gravando a legenda no vídeo. Essa parte é sempre a mais lenta...');
      let ultimoAnunciadoLegenda = -1;
      await rodarComProgresso(
        exigir('ffmpeg'),
        argsLegenda({
          video: destinoAntesDaLegenda,
          legenda: legendaParaQueimar,
          saida,
          altura: formato.altura,
          ass: !!legendaEstilo
        }),
        audioDuration,
        (fracao) => {
          const pct = Math.floor(fracao * 100);
          const degrau = Math.floor(pct / 10);
          if (degrau > ultimoAnunciadoLegenda) {
            ultimoAnunciadoLegenda = degrau;
            aviso('legenda', pct, 100, `Gravando a legenda: ${pct} por cento.`);
          } else {
            aviso('legenda', pct, 100, '');
          }
        }
      );
      aviso('legenda', 100, 100, 'Legenda aplicada.');
    }

    aviso('pronto', 1, 1, `Vídeo pronto: ${path.basename(saida)}.`);
    return {
      ok: true,
      saida,
      duracao: audioDuration,
      segmentos: segmentos.length,
      formato: formato.id
    };
  } finally {
    limpar(temp);
  }
}

/**
 * Junta vídeos prontos. Não reedita nada do conteúdo: padroniza o formato,
 * escurece as junções, põe os títulos pedidos e emenda.
 */
async function juntarVideos(
  { videos, fim, presetId, formatoId, qualidadeId, saida, nivelar, camadas },
  onProgresso
) {
  cancelado = false;

  const preset = getPreset(presetId);
  const formato = getFormato(formatoId || 'horizontal');
  const qualidade = getQualidade(qualidadeId || 'rapida');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'juntar-video-'));

  const aviso = (etapa, feito, total, texto) => {
    if (typeof onProgresso === 'function') onProgresso({ etapa, feito, total, texto });
  };

  try {
    aviso('preparando', 0, 1, 'Analisando os vídeos...');
    const analise = await analisarLista(
      videos.map((v) => v.caminho),
      formato.id,
      exigir
    );
    if (analise.erros.length) throw new Error(analise.erros.join(' '));
    for (const linha of analise.relatorio) aviso('preparando', 1, 1, linha);

    const lim = limitesDe(formato.id);
    const fps = preset.fps;
    const fonte = resolverFonte(preset.titulo.fontes);

    // Textos: um por trecho, mais o encerramento no último.
    const textosPorTrecho = analise.itens.map(() => []);
    let indiceArquivo = 0;

    const criarTexto = (texto, tipo, item, posicao) => {
      const limite = tipo === 'fim' ? lim.fim : lim.titulo;
      if (texto.length > limite) {
        throw new Error(
          `O texto "${texto}" tem ${texto.length} caracteres e o limite neste ` +
          `formato é ${limite}.`
        );
      }
      if (!fonte) throw new Error('Não encontrei nenhuma fonte para desenhar o texto.');

      const linhas = quebrarLinhas(texto, lim.porLinha);
      if (linhas.length > 1) {
        aviso('preparando', 1, 1,
          `Texto do vídeo ${posicao} em ${linhas.length} linhas: ${linhas.join(' / ')}.`);
      }

      const arquivo = path.join(temp, `jtexto_${indiceArquivo++}.txt`);
      fs.writeFileSync(arquivo, linhas.join('\n'), 'utf8');

      const bruta = tipo === 'fim' ? preset.titulo.duracaoFim : preset.titulo.duracao;
      const duracao = Math.min(bruta, Math.max(1, item.duracao - 0.6));
      const inicio = tipo === 'fim'
        ? Math.max(0, item.duracao - duracao)
        : Math.min(0.4, Math.max(0, item.duracao - duracao));

      return {
        arquivoTexto: arquivo,
        inicio,
        duracao,
        entrada: tipo === 'fim' ? preset.titulo.entrada * 1.4 : preset.titulo.entrada,
        tamanho: tamanhoFonte(formato, tipo, preset.titulo.escala || 1),
        visivelDe: Math.max(0, inicio - 0.05),
        visivelAte: Math.min(item.duracao, inicio + duracao + 0.05)
      };
    };

    analise.itens.forEach((item, i) => {
      const texto = String((videos[i] && videos[i].titulo) || '').trim();
      if (texto) textosPorTrecho[i].push(criarTexto(texto, 'titulo', item, i + 1));
    });

    const textoFim = String(fim || '').trim();
    if (textoFim && analise.itens.length) {
      const ultimo = analise.itens.length - 1;
      textosPorTrecho[ultimo].push(
        criarTexto(textoFim, 'fim', analise.itens[ultimo], ultimo + 1)
      );
    }

    // --- Camadas de trilha ---------------------------------------------------
    // Conferidas e preparadas com a duração estimada da emenda (a soma dos
    // trechos, que é o que a emenda vai dar) — assim um erro de tempo aparece
    // antes de gastar a passada de nivelamento e a de cada trecho, não depois.
    const temCamadas = Array.isArray(camadas) && camadas.length > 0;
    let camadasPreparadas = [];
    if (temCamadas) {
      const resultado = await prepararCamadas({
        camadas,
        duracaoVideo: analise.duracaoTotal,
        temp,
        aviso
      });
      if (resultado.erros.length) throw new Error(resultado.erros.join(' '));
      camadasPreparadas = resultado.preparadas;
    }

    // --- Nivelar volume -----------------------------------------------------
    // Só os trechos que destoam do conjunto são mexidos, e o alvo é a mediana
    // deles próprios: a ideia é fazer os trechos combinarem entre si, não impor
    // um volume de fora.
    let ganhos = analise.itens.map(() => 0);
    if (nivelar !== false && analise.itens.length > 1) {
      const medidas = [];
      for (let i = 0; i < analise.itens.length; i++) {
        if (cancelado) throw new Error('CANCELADO');
        const item = analise.itens[i];
        aviso('medindo', i + 1, analise.itens.length,
          `Medindo o volume: ${i + 1} de ${analise.itens.length}.`);
        medidas.push(item.temAudio
          ? { medida: await medirVolume(item.caminho, exigir) }
          : null);
      }

      const nivel = calcularNivelamento(medidas);
      ganhos = nivel.ganhos;
      if (nivel.avisos.length) {
        for (const linha of nivel.avisos) aviso('medindo', 1, 1, linha);
      } else {
        aviso('medindo', 1, 1, 'Os volumes já combinavam entre si, nada a ajustar.');
      }
    }

    // --- Padronizar cada trecho --------------------------------------------
    const partes = [];
    for (let i = 0; i < analise.itens.length; i++) {
      if (cancelado) throw new Error('CANCELADO');
      const destino = path.join(temp, `parte_${String(i).padStart(4, '0')}.mp4`);
      await rodar(exigir('ffmpeg'), argsTrecho({
        item: analise.itens[i],
        formato,
        qualidade,
        preset,
        fps,
        saida: destino,
        textos: textosPorTrecho[i],
        primeiro: i === 0,
        ultimo: i === analise.itens.length - 1,
        fonte,
        ganho: ganhos[i]
      }));
      partes.push(destino);
      aviso('trechos', i + 1, analise.itens.length,
        `Preparando trecho ${i + 1} de ${analise.itens.length}.`);
    }

    // --- Emendar ------------------------------------------------------------
    if (cancelado) throw new Error('CANCELADO');
    const listaPath = path.join(temp, 'lista.txt');
    fs.writeFileSync(listaPath, partes.map(linhaLista).join('\n'), 'utf8');

    // Com trilha, a emenda vai para um arquivo intermediário: as camadas
    // entram depois, por cima do vídeo inteiro, quando a duração final já é
    // conhecida.
    const destinoEmenda = temCamadas ? path.join(temp, 'emendado.mp4') : saida;

    aviso('juntando', 0, 1, 'Emendando os trechos...');
    await rodar(exigir('ffmpeg'), [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listaPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      destinoEmenda
    ]);

    // --- Trilha de fundo ----------------------------------------------------
    if (temCamadas) {
      if (cancelado) throw new Error('CANCELADO');

      const duracaoVideo = await duracaoDoAudio(destinoEmenda);

      aviso('trilha', camadasPreparadas.length, camadasPreparadas.length + 1, 'Aplicando as trilhas...');
      await rodar(exigir('ffmpeg'), argsMixCamadas({
        video: destinoEmenda,
        camadas: camadasPreparadas,
        duracaoVideo,
        saida
      }));
      aviso('trilha', camadasPreparadas.length + 1, camadasPreparadas.length + 1,
        camadasPreparadas.length > 1 ? 'Trilhas aplicadas.' : 'Trilha aplicada.');
    }

    aviso('pronto', 1, 1, `Vídeo pronto: ${path.basename(saida)}.`);
    return {
      ok: true,
      saida,
      trechos: partes.length,
      duracao: analise.duracaoTotal
    };
  } finally {
    limpar(temp);
  }
}

/**
 * Roda o FFmpeg lendo o progresso dele.
 *
 * Um corte num vídeo de vinte minutos é uma passada longa só, sem etapas no
 * meio pra anunciar. Sem isso a barra ficaria parada e a pessoa não saberia se
 * travou.
 */
function rodarComProgresso(comando, args, duracaoTotal, aoAvancar) {
  return new Promise((resolve, reject) => {
    const p = spawn(comando, ['-progress', 'pipe:1', '-nostats', ...args], { windowsHide: true });
    processoAtual = p;

    let stderr = '';
    let resto = '';
    p.stdout.on('data', (d) => {
      resto += d.toString();
      const linhas = resto.split(/\r?\n/);
      resto = linhas.pop();
      for (const l of linhas) {
        const m = /^out_time_us=(\d+)/.exec(l) || /^out_time_ms=(\d+)/.exec(l);
        if (m && duracaoTotal > 0) {
          const seg = Number(m[1]) / 1e6;
          aoAvancar(Math.min(1, seg / duracaoTotal));
        }
      }
    });
    p.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    p.on('error', (err) => {
      processoAtual = null;
      reject(new Error(`Não consegui executar "${comando}": ${err.message}`));
    });
    p.on('close', (code) => {
      processoAtual = null;
      if (cancelado) return reject(new Error('CANCELADO'));
      if (code === 0) return resolve();
      reject(new Error(`FFmpeg terminou com erro (código ${code}).\n${stderr.slice(-1200)}`));
    });
  });
}

/** Confere os descartes sem gerar nada — o que sobra e quanto dura. */
async function conferirCortes({ entrada, descartes }) {
  const info = await analisarVideo(entrada, exigir);
  if (!info.valido) return { erros: [`O arquivo ${info.motivo}.`], avisos: [] };
  const plano = planejarCortes(descartes, info.duracao);
  return {
    erros: plano.erros,
    avisos: plano.avisos,
    duracaoOriginal: info.duracao,
    duracaoFinal: plano.duracaoFinal,
    trechos: plano.mantidos.length
  };
}

/**
 * Corta o vídeo e/ou grava uma legenda nele, numa passada só.
 *
 * descartes é opcional agora: se não vier nenhum (ou vier vazio), mas houver
 * legenda, o vídeo inteiro é mantido como um único trecho — não se trata de
 * cortar nada, só de queimar a legenda por cima do que já está pronto. Pedir
 * os dois ao mesmo tempo também funciona: corta e grava a legenda na mesma
 * passagem.
 */
/**
 * Traduz um instante marcado no vídeo ORIGINAL para o instante correspondente
 * no vídeo já cortado. Necessário porque, na tela de Cortar, toda marca de
 * trilha é feita ouvindo o vídeo de antes do corte — e um corte antes dessa
 * marca empurra tudo que vem depois pra mais perto do começo.
 *
 * Se o instante cai dentro de um trecho mantido, anda proporcional dentro
 * dele. Se cai dentro de um trecho descartado, vai para o ponto em que o
 * trecho mantido seguinte começa no vídeo final — o lugar mais perto que
 * esse instante ainda existe depois do corte.
 */
function remapTempo(t, mantidos) {
  let acumulado = 0;
  for (const m of mantidos) {
    if (t < m.de) return acumulado;
    if (t <= m.ate) return acumulado + (t - m.de);
    acumulado += (m.ate - m.de);
  }
  return acumulado;
}

async function cortarVideo({ entrada, descartes, legenda, camadas, saida, ajuste, fade, sobrepor, leve }, onProgresso) {
  cancelado = false;
  const aviso = (etapa, feito, total, texto) => {
    if (typeof onProgresso === 'function') onProgresso({ etapa, feito, total, texto });
  };

  const temCortes = !!(descartes && descartes.length);
  const temLegenda = !!(legenda && String(legenda).trim());
  const temCamadas = !!(camadas && camadas.length);
  const aj = ajuste ? AJ.normalizarAjuste(ajuste) : null;
  const temAjuste = !!aj && !AJ.ajusteNeutro(aj);
  const velocidade = aj ? aj.velocidade : 1;
  if (!temCortes && !temLegenda && !temCamadas && !temAjuste) {
    throw new Error('Marque pelo menos um corte, escolha uma legenda, adicione uma trilha, ou ajuste o áudio, antes de salvar.');
  }

  const temp = (temLegenda || temCamadas) ? fs.mkdtempSync(path.join(os.tmpdir(), 'cortar-video-')) : null;

  try {
    aviso('preparando', 0, 1, 'Lendo o vídeo...');
    const info = await analisarVideo(entrada, exigir);
    if (!info.valido) throw new Error(`O arquivo ${info.motivo}.`);

    // Só precisa saber a altura real do vídeo quando vai desenhar legenda —
    // é o que decide o tamanho da letra e a margem até a borda.
    const alturaLegenda = temLegenda ? await alturaDoVideo(entrada) : null;

    // Antes de queimar, uma segunda conferida no .srt (mesma revisão feita
    // em Gerar vídeo): conserta o que é seguro consertar sem tocar no áudio,
    // e avisa o resultado sem entrar em detalhe.
    let legendaParaQueimar = null;
    if (temLegenda) {
      aviso('preparando', 1, 1, 'Revisando a legenda antes de gravar...');
      const legendaRevisada = path.join(temp, 'legenda_revisada.srt');
      const revisao = revisarArquivoLegenda(legenda, legendaRevisada, fs);
      legendaParaQueimar = revisao.caminho;
      if (Math.abs(velocidade - 1) > 1e-3) {
        const escalada = path.join(temp, 'legenda_velocidade.srt');
        fs.writeFileSync(escalada, escalarSrt(fs.readFileSync(legendaParaQueimar, 'utf8'), velocidade), 'utf8');
        legendaParaQueimar = escalada;
      }
      aviso('preparando', 1, 1, revisao.resumo);
    }

    const plano = temCortes
      ? planejarCortes(descartes, info.duracao)
      : { erros: [], avisos: [], mantidos: [{ de: 0, ate: info.duracao }], duracaoFinal: info.duracao };
    if (plano.erros.length) throw new Error(plano.erros.join(' '));
    for (const a of plano.avisos) aviso('preparando', 1, 1, a);
    // 1.5: crossfade sobreposto (só no caminho da gravação): trechos alinhados aos quadros e uma
    // sobreposição por emenda; o vídeo encurta o total das sobreposições.
    let sobreposicoes = null;
    let fps = 30;
    if (sobrepor && plano.mantidos.length > 1) {
      fps = await fpsDoVideo(entrada);
      plano.mantidos = alinharAosQuadros(plano.mantidos, fps);
      if (plano.mantidos.length > 1) {
        sobreposicoes = calcularSobreposicoes(plano.mantidos, fps);
        plano.duracaoFinal = plano.mantidos.reduce((a, m) => a + m.ate - m.de, 0) - sobreposicoes.reduce((a, d) => a + d, 0);
      }
    }
    const fadesJuncao = !sobreposicoes && fade && plano.mantidos.length > 1 ? calcularFadesDeJuncao(plano.mantidos) : null;
    // Duração do vídeo salvo: a velocidade encurta ou alonga o que sobrou.
    const duracaoSaida = plano.duracaoFinal / velocidade;

    aviso('preparando', 1, 1,
      (temCortes
        ? `Mantendo ${plano.mantidos.length} trecho(s). O vídeo vai de ` +
          `${formatarTempo(info.duracao)} para ${formatarTempo(plano.duracaoFinal)}.`
        : `Vídeo inteiro, ${formatarTempo(info.duracao)}, sem cortes.`) +
      (temLegenda ? ' Gravando a legenda.' : '') +
      (temCamadas ? ' Aplicando trilha.' : '') +
      (temAjuste ? ' Aplicando o ajuste do áudio.' : ''));

    // Se há trilha, a legenda só entra depois dela (mesma ordem usada em
    // Gerar vídeo: conteúdo, depois a trilha por cima, só então a legenda
    // queimada no topo de tudo) — por isso, com trilha, o corte não grava a
    // legenda na mesma passada; sem trilha, nada muda, continua numa só.
    const destinoCorte = temCamadas ? path.join(temp, 'cortado.mp4') : saida;
    const legendaNoCorte = temCamadas ? null : legendaParaQueimar;

    // Fala no máximo a cada 10% para não metralhar o leitor de tela.
    let ultimoAnunciado = -1;
    await rodarComProgresso(
      exigir('ffmpeg'),
      argsCortar({
        entrada,
        mantidos: plano.mantidos,
        temAudio: info.temAudio,
        duracao: info.duracao,
        legenda: legendaNoCorte,
        altura: alturaLegenda,
        saida: destinoCorte,
        ajuste: temAjuste ? aj : null,
        fadesJuncao,
        sobreposicoes,
        fps,
        leve: !!leve
      }),
      duracaoSaida,
      (fracao) => {
        const pct = Math.floor(fracao * 100);
        const degrau = Math.floor(pct / 10);
        if (degrau > ultimoAnunciado) {
          ultimoAnunciado = degrau;
          aviso('cortando', pct, 100, `Salvando o vídeo: ${pct} por cento.`);
        } else {
          aviso('cortando', pct, 100, '');
        }
      }
    );

    let destinoComTrilha = destinoCorte;
    if (temCamadas) {
      if (cancelado) throw new Error('CANCELADO');

      // As trilhas, nesta tela, são marcadas ouvindo o vídeo ORIGINAL — o
      // mesmo tocador usado pra marcar os descartes. Se há corte, traduz
      // esses tempos pro vídeo já cortado antes de preparar as camadas.
      // Com outra velocidade, o tempo de cada trilha também é dividido por ela.
      const rt = (t) => (sobreposicoes ? remapSobreposto(t, plano.mantidos, sobreposicoes) : remapTempo(t, plano.mantidos));
      const camadasTraduzidas = (!temCortes && Math.abs(velocidade - 1) < 1e-3) ? camadas : camadas.map((c) => {
        const traduzida = { ...c };
        if (typeof c.tempo === 'number') traduzida.tempo = rt(c.tempo) / velocidade;
        if (typeof c.encerraEm === 'number') traduzida.encerraEm = rt(c.encerraEm) / velocidade;
        return traduzida;
      });

      const { preparadas: camadasPreparadas, erros: errosCamadas } = await prepararCamadas({
        camadas: camadasTraduzidas,
        duracaoVideo: duracaoSaida,
        temp,
        aviso
      });
      if (errosCamadas.length) throw new Error(errosCamadas.join(' '));

      aviso('trilha', camadasPreparadas.length, camadasPreparadas.length + 1, 'Aplicando as trilhas...');
      destinoComTrilha = temLegenda ? path.join(temp, 'com_trilha.mp4') : saida;
      await rodar(exigir('ffmpeg'), argsMixCamadas({
        video: destinoCorte,
        camadas: camadasPreparadas,
        duracaoVideo: duracaoSaida,
        saida: destinoComTrilha
      }));
      aviso('trilha', camadasPreparadas.length + 1, camadasPreparadas.length + 1,
        camadasPreparadas.length > 1 ? 'Trilhas aplicadas.' : 'Trilha aplicada.');
    }

    if (temLegenda && temCamadas) {
      if (cancelado) throw new Error('CANCELADO');
      aviso('legenda', 0, 100, 'Gravando a legenda no vídeo. Essa parte é sempre a mais lenta...');
      let ultimoAnunciadoLegenda = -1;
      await rodarComProgresso(
        exigir('ffmpeg'),
        argsLegenda({
          video: destinoComTrilha,
          legenda: legendaParaQueimar,
          saida,
          altura: alturaLegenda
        }),
        duracaoSaida,
        (fracao) => {
          const pct = Math.floor(fracao * 100);
          const degrau = Math.floor(pct / 10);
          if (degrau > ultimoAnunciadoLegenda) {
            ultimoAnunciadoLegenda = degrau;
            aviso('legenda', pct, 100, `Gravando a legenda: ${pct} por cento.`);
          } else {
            aviso('legenda', pct, 100, '');
          }
        }
      );
      aviso('legenda', 100, 100, 'Legenda aplicada.');
    }

    aviso('pronto', 1, 1,
      temCortes ? `Vídeo cortado: ${path.basename(saida)}.` : `Vídeo atualizado: ${path.basename(saida)}.`);
    return {
      ok: true,
      saida,
      duracaoOriginal: info.duracao,
      duracao: duracaoSaida,
      ajusteAplicado: temAjuste,
      cortesAplicados: temCortes,
      legendaAplicada: temLegenda,
      trilhaAplicada: temCamadas,
      // 1.8.6: o que foi feito com a imagem, para repetir uma vez só no vídeo de verdade (Finalizar).
      plano: { mantidos: plano.mantidos, sobreposicoes, fps, cortes: temCortes, velocidade: AJ.filtroVelocidadeVideo(temAjuste ? aj : null) || null }
    };
  } finally {
    if (temp) limpar(temp);
  }
}

/** Conta as partes sem gerar nada. */
async function conferirDivisao({ entrada, tamanho }) {
  const info = await analisarVideo(entrada, exigir);
  if (!info.valido) return { erros: [`O arquivo ${info.motivo}.`], avisos: [], partes: [] };
  const plano = dividir.planejarPartes(info.duracao, tamanho);
  return { ...plano, duracao: info.duracao, resumo: plano.erros.length ? '' : dividir.resumirPlano(info.duracao, plano.partes, tamanho) };
}

/** Pasta nova ao lado do vídeo, sem nunca reaproveitar uma que já exista. */
function pastaDasPartes(entrada, pastaBase) {
  // Olho da Cena: as partes vão para a pasta do programa (Documentos, Olho da Cena), quando informada.
  const dir = pastaBase || path.dirname(entrada);
  const base = path.basename(entrada, path.extname(entrada));
  let pasta = path.join(dir, `${base} (partes)`);
  for (let n = 2; fs.existsSync(pasta); n++) pasta = path.join(dir, `${base} (partes ${n})`);
  return pasta;
}

/**
 * Divide o vídeo em partes, uma por vez. Vertical (padrão): 1080 por 1920 com
 * fundo desfocado. Horizontal: o quadro original, só dividido no tempo.
 */
async function dividirVideo({ entrada, tamanho, orientacao, pastaBase }, onProgresso) {
  cancelado = false;
  const aviso = (etapa, feito, total, texto) => {
    if (typeof onProgresso === 'function') onProgresso({ etapa, feito, total, texto });
  };

  aviso('preparando', 0, 1, 'Lendo o vídeo...');
  const info = await analisarVideo(entrada, exigir);
  if (!info.valido) throw new Error(`O arquivo ${info.motivo}.`);

  const plano = dividir.planejarPartes(info.duracao, tamanho);
  if (plano.erros.length) throw new Error(plano.erros.join(' '));

  const pasta = pastaDasPartes(entrada, pastaBase);
  fs.mkdirSync(pasta, { recursive: true });
  const base = path.basename(entrada, path.extname(entrada));
  const total = plano.partes.length;
  const gerados = [];

  aviso('preparando', 1, 1, `Gerando ${total} parte${total === 1 ? '' : 's'} na pasta ${path.basename(pasta)}.`);

  for (let i = 0; i < total; i++) {
    const parte = plano.partes[i];
    const saida = path.join(pasta, dividir.nomeDaParte(base, i + 1, total));
    aviso('dividindo', Math.round((i / total) * 100), 100, `Começando a parte ${i + 1} de ${total}.`);

    let ultimo = -1;
    try {
      await rodarComProgresso(
        exigir('ffmpeg'),
        dividir.argsDividirParte({ entrada, inicio: parte.inicio, duracao: parte.duracao, temAudio: info.temAudio, saida, orientacao }),
        parte.duracao,
        (fracao) => {
          const geral = Math.floor(((i + fracao) / total) * 100);
          const degrau = Math.floor(fracao * 4);
          if (degrau > ultimo && degrau < 4 && degrau > 0) {
            ultimo = degrau;
            aviso('dividindo', geral, 100, `Parte ${i + 1} de ${total}: ${degrau * 25} por cento.`);
          } else {
            aviso('dividindo', geral, 100, '');
          }
        }
      );
    } catch (e) {
      try { fs.unlinkSync(saida); } catch (_) {}
      try { fs.rmdirSync(pasta); } catch (_) {} // só some se estiver vazia
      if (e.message === 'CANCELADO' && gerados.length) e.partesProntas = gerados.length;
      throw e;
    }
    gerados.push(saida);
  }

  aviso('pronto', 1, 1, `Pronto. ${total} parte${total === 1 ? '' : 's'} na pasta ${path.basename(pasta)}.`);
  return { ok: true, pasta, arquivos: gerados, primeiro: gerados[0], partes: total };
}

/**
 * Roda o FFmpeg por fora da fila principal: não ocupa o processo que o botão
 * Cancelar controla, nem é derrubado por ele. É o que deixa o Salvar áudio
 * trabalhar em segundo plano enquanto a pessoa continua editando ou até
 * enquanto um corte está rodando.
 */
function rodarIndependente(comando, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(comando, args, { windowsHide: true });
    let stderr = '';
    p.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    p.on('error', (err) => reject(new Error(`Não consegui executar "${comando}": ${err.message}`)));
    p.on('close', (code) => {
      if (code === 0) return resolve(stderr);
      reject(new Error(`FFmpeg terminou com erro (código ${code}).\n${stderr.slice(-1200)}`));
    });
  });
}

/**
 * Salva só o trecho marcado num arquivo novo (Alt S em Editar vídeo). O
 * original não é tocado. formato: 'horizontal', 'vertical' ou 'audio'.
 */
async function salvarTrecho({ entrada, inicio, fim, formato, saida }, onProgresso) {
  cancelado = false;
  const aviso = (etapa, feito, total, texto) => {
    if (typeof onProgresso === 'function') onProgresso({ etapa, feito, total, texto });
  };
  const info = await analisarVideo(entrada, exigir);
  if (!info.valido) throw new Error(`O arquivo ${info.motivo}.`);
  const ate = Math.min(Number(fim), info.duracao);
  const args = trecho.argsSalvarTrecho({ entrada, inicio, fim: ate, formato, temAudio: info.temAudio, saida });

  let ultimo = -1;
  await rodarComProgresso(exigir('ffmpeg'), args, ate - inicio, (fracao) => {
    const pct = Math.floor(fracao * 100);
    const degrau = Math.floor(pct / 25);
    if (degrau > ultimo && degrau > 0 && degrau < 4) {
      ultimo = degrau;
      aviso('cortando', pct, 100, `Salvando o trecho: ${degrau * 25} por cento.`);
    } else {
      aviso('cortando', pct, 100, '');
    }
  });
  aviso('cortando', 100, 100, '');
  return { ok: true, saida, duracao: ate - inicio, formato };
}

/**
 * Exporta só o áudio, já com os descartes aplicados e as trilhas misturadas,
 * para um MP3 ou WAV. Serve às duas telas:
 *   - Editar vídeo: entrada é o vídeo, com a lista de descartes; as trilhas
 *     foram marcadas no tempo do vídeo original e são traduzidas aqui.
 *   - Montar vídeo: entrada é o áudio já montado, sem descartes.
 * Roda por fora da fila principal (rodarIndependente), sem travar a tela.
 */
async function exportarAudio({ entrada, descartes, camadas, saida, ajuste, fade }) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'exportar-audio-'));
  try {
    const duracaoOriginal = await duracaoDoAudio(entrada);
    const temCortes = !!(descartes && descartes.length);
    const temCamadas = !!(camadas && camadas.length);
    const aj = ajuste ? AJ.normalizarAjuste(ajuste) : null;
    const temAjuste = !!aj && !AJ.ajusteNeutro(aj);
    const velocidade = aj ? aj.velocidade : 1;

    let base = path.join(temp, 'base.wav');
    let duracao = duracaoOriginal;
    let mantidos = null;

    if (temCortes || temAjuste) {
      // Sem descartes, o áudio inteiro é um trecho só (para o ajuste passar pelo mesmo caminho).
      const plano = temCortes
        ? planejarCortes(descartes, duracaoOriginal)
        : { erros: [], mantidos: [{ de: 0, ate: duracaoOriginal }], duracaoFinal: duracaoOriginal };
      if (plano.erros.length) throw new Error(plano.erros.join(' '));
      mantidos = plano.mantidos;
      duracao = plano.duracaoFinal / velocidade;
      // Mesmo fade do Salvar vídeo (sem sobrepor), para o áudio salvo ser igual ao som do vídeo salvo.
      const fadesSeparados = fade && mantidos.length > 1 ? calcularFadesDeJuncao(mantidos) : null;
      await rodarIndependente(exigir('ffmpeg'), argsCortarAudio({
        entrada, mantidos, duracao: duracaoOriginal, saida: base, fadesSeparados, ajuste: temAjuste ? aj : null
      }));
    } else {
      await rodarIndependente(exigir('ffmpeg'), trecho.argsExtrairAudio({ entrada, saida: base }));
    }

    if (temCamadas) {
      const traduzidas = !mantidos ? camadas : camadas.map((c) => {
        const t = { ...c };
        if (typeof c.tempo === 'number') t.tempo = remapTempo(c.tempo, mantidos) / velocidade;
        if (typeof c.encerraEm === 'number') t.encerraEm = remapTempo(c.encerraEm, mantidos) / velocidade;
        return t;
      });
      const { preparadas, erros } = await prepararCamadas({
        camadas: traduzidas,
        duracaoVideo: duracao,
        temp,
        aviso: () => {},
        executar: rodarIndependente,
        independente: true
      });
      if (erros.length) throw new Error(erros.join(' '));
      await rodarIndependente(exigir('ffmpeg'), argsMixCamadasAudio({
        audio: base, camadas: preparadas, duracaoVideo: duracao, saida
      }));
    } else {
      await rodarIndependente(exigir('ffmpeg'), trecho.argsConverterAudio({ entrada: base, saida }));
    }

    return { ok: true, saida, duracao };
  } finally {
    limpar(temp);
  }
}

/**
 * Olho da Cena, Editar vídeo: "Ouvir o ajuste". Seis segundos do vídeo a
 * partir do ponto atual, só o som, já com equalização, velocidade e volume.
 * Devolve o caminho de um WAV temporário.
 */
async function ouvirAjuste({ entrada, inicio, ajuste, saida }) {
  const dur = await duracaoDoAudio(entrada);
  const de = Math.max(0, Math.min(Number(inicio) || 0, Math.max(0, dur - 1)));
  const v = AJ.normalizarAjuste(ajuste).velocidade;
  // Seis segundos de som já na velocidade nova: lê 6 x velocidade do original.
  const ler = Math.min(dur - de, DURACAO_PREVIA * v);
  await rodarIndependente(exigir('ffmpeg'), ['-y', '-v', 'error', '-ss', de.toFixed(3), '-t', ler.toFixed(3), '-i', entrada,
    '-vn', '-af', AJ.filtroAudio(ajuste), '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', saida]);
  return { saida, inicio: de, duracao: ler / v };
}

/** Junta a lista de áudios (com velocidades) num arquivo só. */
async function montarAudio({ itens, saida, mono }) {
  await rodar(exigir('ffmpeg'), audios.argsMontarAudio({ itens, saida, mono }));
  const duracao = await duracaoDoAudio(saida);
  return { ok: true, saida, duracao };
}

/** Seis segundinhos de um áudio já na velocidade escolhida. */
async function previaVelocidade({ entrada, velocidade, saida }) {
  const duracao = await duracaoDoAudio(entrada);
  await rodar(exigir('ffmpeg'), audios.argsPreviaVelocidade({ entrada, velocidade, duracao, saida }));
  return { ok: true, saida };
}


// --- 1.3: áudio depois da gravação (tela Cortes) -------------------------------------------

/** Sonoridade integrada (LUFS) e pico real (dBTP) do arquivo todo, guardados por arquivo. */
const medidaCache = new Map();
async function medirSonoridade(entrada) {
  let st = null;
  try { st = fs.statSync(entrada); } catch (_) { /* */ }
  const chave = JSON.stringify({ entrada, t: st && st.mtimeMs, n: st && st.size });
  if (medidaCache.has(chave)) return medidaCache.get(chave);
  const texto = await new Promise((resolve, reject) => {
    const p = spawn(exigir('ffmpeg'), ['-hide_banner', '-nostats', '-i', entrada, '-vn', '-af', 'ebur128=framelog=quiet:peak=true', '-f', 'null', '-'], { windowsHide: true });
    let erro = '';
    p.stderr.on('data', (d) => { erro += d.toString(); });
    p.on('error', reject);
    p.on('close', () => resolve(erro));
  });
  const i = [...texto.matchAll(/I:\s*(-?[\d.]+|-inf)\s*LUFS/g)].pop();
  const pk = [...texto.matchAll(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/g)].pop();
  const r = { lufs: i ? parseFloat(i[1]) : NaN, pico: pk ? parseFloat(pk[1]) : NaN };
  medidaCache.set(chave, r);
  return r;
}

/** Ganho do nivelamento automático para este arquivo (0 se não deu para medir). */
async function ganhoNivelamento(entrada) {
  const m = await medirSonoridade(entrada);
  const g = AJ.ganhoParaNivelar(m.lufs, m.pico);
  return { ganho: g === null ? 0 : g, lufs: isFinite(m.lufs) ? m.lufs : null, pico: isFinite(m.pico) ? m.pico : null };
}

/** Prévia (Alt G): junta os pedaços do original (segmentos, em segundos) e aplica o ajuste. WAV. */
async function previaCortes({ entrada, segmentos, ajuste, saida }) {
  const segs = (segmentos || []).filter((s) => s && s.ate - s.de > 0.01);
  if (!segs.length) throw new Error('Nada para ouvir neste ponto.');
  const partes = segs.map((s, i) => `[0:a]atrim=start=${s.de.toFixed(3)}:end=${s.ate.toFixed(3)},asetpts=PTS-STARTPTS[p${i}]`);
  const juntar = segs.length > 1 ? `${segs.map((_, i) => `[p${i}]`).join('')}concat=n=${segs.length}:v=0:a=1[j]` : '[p0]anull[j]';
  const grafo = [...partes, juntar, `[j]${AJ.filtroAudio(ajuste)}[s]`].join(';');
  await rodarIndependente(exigir('ffmpeg'), ['-y', '-v', 'error', '-i', entrada, '-filter_complex', grafo, '-map', '[s]',
    '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', saida]);
  return { saida };
}

/** Um trecho salvo em vídeo (MP4) e em áudio (MP3), com o mesmo volume da tela (ganho em dB). */
async function salvarTrechoAV({ entrada, inicio, fim, ganhoDb, saidaVideo, saidaAudio, modo = 'ambos' }) {
  const info = await analisarVideo(entrada, exigir);
  if (!info.valido) throw new Error(`O arquivo ${info.motivo}.`);
  const ate = Math.min(Number(fim), info.duracao);
  const ganho = Number(ganhoDb) || 0;
  const comGanho = (args) => {
    if (Math.abs(ganho) < 0.05) return args;
    const i = args.indexOf('-af');
    if (i >= 0) args[i + 1] = `volume=${ganho.toFixed(1)}dB,${args[i + 1]}`;
    return args;
  };
  // 1.8: modo das Configurações (O Alt S salva em): 'ambos', 'video' ou 'audio'.
  const comVideo = modo !== 'audio' || !info.temAudio, comAudio = modo !== 'video' && info.temAudio;
  if (comVideo) await rodarIndependente(exigir('ffmpeg'), comGanho(trecho.argsSalvarTrecho({ entrada, inicio, fim: ate, formato: 'horizontal', temAudio: info.temAudio, saida: saidaVideo })));
  if (comAudio) await rodarIndependente(exigir('ffmpeg'), comGanho(trecho.argsSalvarTrecho({ entrada, inicio, fim: ate, formato: 'audio', temAudio: true, saida: saidaAudio })));
  return { ok: true, saidaVideo: comVideo ? saidaVideo : null, saidaAudio: comAudio ? saidaAudio : null, duracao: ate - inicio };
}

// --- 1.4: Silêncios e crossfade (depois dos Cortes) ----------------------------------------

/**
 * Prévia da verificação de silêncios: o áudio inteiro como vai ficar, com os mesmos trechos
 * (planejarCortes da 1.0.0) e, com crossfade, os mesmos fades de cada emenda que o vídeo salvo
 * recebe (calcularFadesDeJuncao / fadesDoTrecho da 1.0.0). WAV.
 */
async function previaSilencios({ entrada, descartes, fade, ajuste, saida, centro = null, janela = 30 }) {
  const info = await analisarVideo(entrada, exigir);
  if (!info.valido) throw new Error(`O arquivo ${info.motivo}.`);
  if (!info.temAudio) throw new Error('O vídeo não tem som.');
  // 1.8.6: só o trecho em volta do ponto do tocador (30 s), para ser rápido em vídeo longo. Os descartes
  // são recortados e trazidos para o começo do trecho; a conta é a mesma do vídeo inteiro.
  let ini = 0;
  if (centro != null && info.duracao > janela) {
    ini = Math.max(0, Math.min(info.duracao - janela, Number(centro) - janela / 2));
    const fimJ = ini + janela;
    descartes = (descartes || []).filter((d) => d.fim > ini && d.inicio < fimJ)
      .map((d) => ({ inicio: Math.max(0, d.inicio - ini), fim: Math.min(janela, d.fim - ini) }));
    info.duracao = janela;
  }
  const plano = (descartes && descartes.length)
    ? planejarCortes(descartes, info.duracao)
    : { erros: [], mantidos: [{ de: 0, ate: info.duracao }], duracaoFinal: info.duracao };
  if (plano.erros.length) throw new Error(plano.erros.join(' '));
  // 1.5: com crossfade, a prévia usa as mesmas sobreposições do salvar (acrossfade em cada emenda).
  let sobreposicoes = null;
  if (fade && plano.mantidos.length > 1) {
    const fps = await fpsDoVideo(entrada);
    plano.mantidos = alinharAosQuadros(plano.mantidos, fps);
    if (plano.mantidos.length > 1) {
      sobreposicoes = calcularSobreposicoes(plano.mantidos, fps);
      plano.duracaoFinal = plano.mantidos.reduce((a, m) => a + m.ate - m.de, 0) - sobreposicoes.reduce((a, d) => a + d, 0);
    }
  }
  const aj = ajuste ? AJ.normalizarAjuste(ajuste) : null;
  const args = argsCortarAudio({ entrada, mantidos: plano.mantidos, duracao: info.duracao, saida, fades: sobreposicoes, fadesSeparados: null, ajuste: aj });
  if (ini > 0 || info.duracao === janela) { const k = args.indexOf('-i'); args.splice(k, 0, '-ss', ini.toFixed(3), '-t', String(info.duracao)); }
  await rodarIndependente(exigir('ffmpeg'), args);
  return { saida, duracao: plano.duracaoFinal / (aj ? aj.velocidade : 1), sobreposicoes, inicio: ini };
}

module.exports = {
  previaSilencios,
  medirSonoridade,
  ganhoNivelamento,
  previaCortes,
  salvarTrechoAV,
  salvarTrecho,
  exportarAudio,
  infoLogo,
  montarAudio,
  previaVelocidade,
  dividirVideo,
  conferirDivisao,
  cortarVideo,
  conferirCortes,
  renderizar,
  juntarVideos,
  analisarLista,
  cancelar,
  verificarFFmpeg,
  duracaoDoAudio,
  gerarPreviaMixagem,
  detectarSilencios,
  cortarAudio,
  remapTempo,
  analisarImagens,
  escalarSrt,
  ouvirAjuste,
  exigir
};
