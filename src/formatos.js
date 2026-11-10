'use strict';

/**
 * Formato de tela e nível de qualidade.
 *
 * Ficam separados dos presets de propósito: a atmosfera (dark, clipe, estático)
 * não tem nada a ver com o enquadramento nem com o tempo de render. Você
 * combina os três como quiser.
 */

const FORMATOS = {
  horizontal: {
    id: 'horizontal',
    nome: 'Horizontal — 1920x1080',
    indicacao: 'Bom para vídeo normal do YouTube, para ver no computador ou na TV.',
    contraindicacao: 'Menos indicado para shorts, Reels e stories.',
    descricao: 'Tela larga, 1920 por 1080.',
    largura: 1920,
    altura: 1080
  },
  vertical: {
    id: 'vertical',
    nome: 'Vertical — 1080x1920',
    indicacao: 'Bom para shorts, Reels e TikTok.',
    contraindicacao: 'Menos indicado para vídeo que vai ser visto no computador ou na TV.',
    descricao: 'Tela alta, 1080 por 1920.',
    largura: 1080,
    altura: 1920
  },
  // 1.9.6: o Montar também faz vídeo quadrado, bom para feed e carrossel.
  quadrado: {
    id: 'quadrado',
    nome: 'Quadrado — 1080x1080',
    indicacao: 'Bom para o feed do Instagram, o do Facebook e carrossel.',
    contraindicacao: 'Menos indicado para YouTube, shorts e stories.',
    descricao: 'Tela quadrada, 1080 por 1080. Imagens de outros formatos ganham fundo desfocado.',
    largura: 1080,
    altura: 1080
  }
};

/**
 * fator -> multiplicador da resolução de trabalho. A imagem é normalizada nesse
 *          tamanho maior pra sobrar pixel de verdade quando o zoom aproxima.
 *          Como o zoom máximo é 18%, um fator de 1.5 já cobre com folga; o 2
 *          existe só pra quem quer margem extra e não se importa de esperar.
 *
 * O fator é o que mais mexe no tempo de render — o zoompan trabalhando em cima
 * de imagem 4K é o que come CPU.
 */
const QUALIDADES = {
  rapida: {
    id: 'rapida',
    nome: 'Rápida',
    indicacao: 'Bom para a maioria dos vídeos e para testes.',
    contraindicacao: 'Menos indicado para quando a nitidez no zoom é o mais importante.',
    descricao: 'Bem mais rápida de gerar. Diferença de nitidez praticamente invisível.',
    fator: 1.5,
    crf: 21,
    encoder: 'veryfast'
  },
  normal: {
    id: 'normal',
    nome: 'Normal',
    indicacao: 'Bom para o vídeo final, quando há zoom e a nitidez importa.',
    contraindicacao: 'Menos indicado para testes e para quem tem pressa, porque demora.',
    descricao: 'Margem extra de nitidez no zoom. Demora perto do dobro.',
    fator: 2,
    crf: 20,
    encoder: 'veryfast'
  }
};

/** Dimensão de trabalho. Sempre par, senão o libx264 reclama. */
function resolucaoDeTrabalho(formato, qualidade) {
  const par = (n) => Math.round(n / 2) * 2;
  return {
    largura: par(formato.largura * qualidade.fator),
    altura: par(formato.altura * qualidade.fator)
  };
}

function getFormato(id) {
  const f = FORMATOS[id];
  if (!f) throw new Error('Formato desconhecido: ' + id);
  return f;
}

function getQualidade(id) {
  const q = QUALIDADES[id];
  if (!q) throw new Error('Qualidade desconhecida: ' + id);
  return q;
}

// 2.0: nome, indicação, contraindicação e descrição, nessa ordem.
const { descricaoPadrao } = require('./padrao');
const listar = (obj) =>
  Object.values(obj).map((x) => ({ id: x.id, nome: x.nome, descricao: descricaoPadrao(x) }));

module.exports = {
  FORMATOS,
  QUALIDADES,
  getFormato,
  getQualidade,
  resolucaoDeTrabalho,
  listarFormatos: () => listar(FORMATOS),
  listarQualidades: () => listar(QUALIDADES)
};
