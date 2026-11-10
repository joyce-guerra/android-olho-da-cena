'use strict';

const fs = require('fs');

/**
 * Títulos sobrepostos ao vídeo.
 *
 * O texto é desenhado por cima das imagens, numa camada independente da linha
 * do tempo: um título no meio do áudio não interrompe nem desloca o ciclo das
 * imagens, só passa por cima e some. Por isso dá pra ter quantos quiser, em
 * qualquer tempo.
 *
 * Os limites de caractere não são gosto: foram medidos renderizando texto de
 * verdade e conferindo a largura da caixa em pixels, no pior caso (fonte com
 * serifa em negrito, formato vertical). São o que cabe sem encolher a fonte a
 * ponto de ficar ilegível, e sem encostar nas bordas.
 */

// Por formato: quanto cabe no total e quanto cabe numa linha.
const LIMITES = {
  horizontal: { titulo: 50, fim: 30, porLinha: 46 },
  vertical: { titulo: 40, fim: 24, porLinha: 26 },
  quadrado: { titulo: 44, fim: 26, porLinha: 32 }
};

function limitesDe(formatoId) {
  return LIMITES[formatoId] || LIMITES.horizontal;
}

// --- Tempo -------------------------------------------------------------------

/**
 * Aceita "00:03:20", "3:20" e "45". Devolve segundos, ou null se não entender.
 *
 * A forma curta segue o costume dos contadores: "3:20" é minuto e segundo, não
 * hora e minuto.
 */
function lerTempo(texto) {
  if (typeof texto !== 'string') return null;
  const limpo = texto.trim();
  if (!limpo) return null;
  if (!/^\d{1,2}(:\d{1,2}){0,2}$/.test(limpo)) return null;

  const partes = limpo.split(':').map((n) => parseInt(n, 10));
  if (partes.some((n) => !isFinite(n))) return null;

  let h = 0;
  let m = 0;
  let s = 0;
  if (partes.length === 3) [h, m, s] = partes;
  else if (partes.length === 2) [m, s] = partes;
  else [s] = partes;

  if (m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}

/** Sempre com hora, pra casar com os contadores que a pessoa já usa. */
function escreverTempo(segundos) {
  const t = Math.max(0, Math.round(segundos));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
}

// --- Quebra de linha ---------------------------------------------------------

/**
 * O FFmpeg não quebra linha sozinho, então a quebra é feita aqui, respeitando
 * palavras. Palavra maior que a linha inteira é cortada na força, porque a
 * alternativa seria estourar a largura da tela sem avisar.
 */
function quebrarLinhas(texto, porLinha) {
  const palavras = String(texto).trim().split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';

  for (const palavra of palavras) {
    if (palavra.length > porLinha) {
      if (atual) {
        linhas.push(atual);
        atual = '';
      }
      let resto = palavra;
      while (resto.length > porLinha) {
        linhas.push(resto.slice(0, porLinha));
        resto = resto.slice(porLinha);
      }
      atual = resto;
      continue;
    }

    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (tentativa.length <= porLinha) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = palavra;
    }
  }

  if (atual) linhas.push(atual);
  return linhas;
}

// --- Validação ---------------------------------------------------------------

/**
 * Confere um conjunto de títulos contra a duração do vídeo e os limites do
 * formato. Devolve a lista pronta pra renderizar mais os avisos em texto.
 *
 * O aviso mais importante é o do título marcado depois do fim do áudio: sem
 * ele, o vídeo sai com um título que simplesmente nunca aparece, e não tem como
 * a pessoa perceber isso sozinha.
 */
function validarTitulos({ titulos, fim, duracaoAudio, formatoId, preset }) {
  const lim = limitesDe(formatoId);
  const erros = [];   // impedem de gerar
  const avisos = [];  // informam, mas não impedem
  const prontos = [];

  (titulos || []).forEach((t, i) => {
    const posicao = i + 1;
    const texto = String(t.texto || '').trim();
    if (!texto) return;

    if (texto.length > lim.titulo) {
      erros.push(
        `Título ${posicao} tem ${texto.length} caracteres e o limite neste ` +
        `formato é ${lim.titulo}. Encurte em ${texto.length - lim.titulo}.`
      );
      return;
    }

    const segundos = typeof t.tempo === 'number' ? t.tempo : lerTempo(t.tempo);
    if (segundos === null) {
      erros.push(`Título ${posicao} está com o tempo em formato inválido.`);
      return;
    }

    if (segundos >= duracaoAudio) {
      erros.push(
        `Título ${posicao} está marcado em ${escreverTempo(segundos)}, depois do ` +
        `fim do áudio (${escreverTempo(duracaoAudio)}). Ele não apareceria no vídeo.`
      );
      return;
    }

    const duracao = Math.min(preset.titulo.duracao, duracaoAudio - segundos);
    const linhas = quebrarLinhas(texto, lim.porLinha);

    if (segundos + preset.titulo.duracao > duracaoAudio) {
      avisos.push(
        `Título ${posicao} vai aparecer cortado: o áudio acaba antes dos ` +
        `${preset.titulo.duracao} segundos que ele ficaria na tela.`
      );
    }

    if (linhas.length > 1) {
      avisos.push(
        `Título ${posicao} vai aparecer em ${linhas.length} linhas: ` +
        linhas.join(' / ') + '.'
      );
    }

    prontos.push({
      linhas,
      inicio: segundos,
      duracao,
      tipo: 'titulo',
      trocarPreset: t.trocarPreset || null
    });
  });

  let fimPronto = null;
  const textoFim = String(fim || '').trim();
  if (textoFim) {
    if (textoFim.length > lim.fim) {
      erros.push(
        `O texto de encerramento tem ${textoFim.length} caracteres e o limite ` +
        `neste formato é ${lim.fim}. Encurte em ${textoFim.length - lim.fim}.`
      );
    } else {
      const duracao = Math.min(preset.titulo.duracaoFim, duracaoAudio);
      fimPronto = {
        linhas: quebrarLinhas(textoFim, lim.porLinha),
        inicio: Math.max(0, duracaoAudio - duracao),
        duracao,
        tipo: 'fim'
      };
    }
  }

  // Dois textos no ar ao mesmo tempo ocupam o mesmo lugar da tela e viram um
  // borrão ilegível — e é justamente o tipo de defeito que não dá pra perceber
  // sem enxergar. Então o de trás é encurtado para sair antes do próximo
  // entrar. Se não sobrar tempo de tela que preste, vira erro.
  const GAP = 0.4;
  const MINIMO = 1.5;
  const todos = [...prontos, ...(fimPronto ? [fimPronto] : [])]
    .sort((a, b) => a.inicio - b.inicio);

  for (let i = 0; i < todos.length - 1; i++) {
    const atual = todos[i];
    const proximo = todos[i + 1];
    const sobra = proximo.inicio - GAP - atual.inicio;
    if (atual.inicio + atual.duracao <= proximo.inicio - GAP) continue;

    if (sobra < MINIMO) {
      erros.push(
        `Dois textos ficariam na tela ao mesmo tempo, um por cima do outro, ` +
        `em ${escreverTempo(proximo.inicio)}. Afaste-os em pelo menos ` +
        `${Math.ceil(atual.duracao + GAP)} segundos.`
      );
    } else {
      avisos.push(
        `Um texto foi encurtado de ${atual.duracao.toFixed(0)} para ` +
        `${sobra.toFixed(0)} segundos para não se sobrepor ao seguinte.`
      );
      atual.duracao = sobra;
    }
  }

  if (fimPronto && fimPronto.linhas.length > 1) {
    avisos.push(
      `O encerramento vai aparecer em ${fimPronto.linhas.length} linhas: ` +
      fimPronto.linhas.join(' / ') + '.'
    );
  }

  return { prontos, fim: fimPronto, erros, avisos };
}

// --- Fontes ------------------------------------------------------------------

/**
 * Procura a primeira fonte da lista que existe na máquina.
 *
 * As fontes do preset são todas padrão do Windows, mas o programa pode rodar em
 * máquina sem elas — e drawtext sem fonte válida simplesmente falha. Por isso a
 * lista tem alternativas e, no fim, um recurso genérico.
 */
const RESERVA = [
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/arial.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Helvetica.ttc'
];

function resolverFonte(preferidas) {
  for (const caminho of [...(preferidas || []), ...RESERVA]) {
    try {
      if (fs.existsSync(caminho)) return caminho;
    } catch (_) {}
  }
  return null;
}

module.exports = {
  LIMITES,
  limitesDe,
  lerTempo,
  escreverTempo,
  quebrarLinhas,
  validarTitulos,
  resolverFonte
};
