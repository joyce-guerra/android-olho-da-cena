'use strict';
// 3.0.4: Editar fotos. A triagem de uma pasta de fotos: o programa só trabalha com o que é seguro. Na dúvida, diz não.
// Aqui fica só a decisão, em números, para poder ser testada sem tela. As medidas saem da tela (nitidez, luz, rostos, recorte da pessoa).
(function (raiz) {

const EXTENSOES = /\.(jpe?g|png|webp|bmp)$/i;
const LIMITES = {
  ladoMinimo: 600,       // pontos no lado menor
  nitidezMinima: 30,     // variância do laplaciano: abaixo disso, tremida ou fora de foco
  nitidezBoa: 90,
  luzMinima: 0.16, luzMaxima: 0.9, estouroMaximo: 0.25,
  rostosMaximo: 3,
  bordaDoRosto: 0.004,   // rosto encostado na borda da foto: cortado
  rostoMinimo: 0.035,    // largura do rosto sobre a largura da foto
  coberturaMinima: 0.06, coberturaMaxima: 0.85 // recorte da pessoa: quanto da foto ela ocupa
};

const orientacao = (l, a) => (Math.abs(l / a - 1) < 0.04 ? 'quadrada' : l > a ? 'horizontal' : 'vertical');

/** Onde está um rosto, em palavras. Medidas de 0 a 1 sobre a foto. */
function lugarDoRosto(r) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const h = cx < 0.36 ? 'à esquerda' : cx > 0.64 ? 'à direita' : 'no meio';
  const v = cy < 0.36 ? 'no alto' : cy > 0.64 ? 'embaixo' : 'na altura do meio';
  const t = r.w > 0.22 ? 'grande' : r.w > 0.1 ? 'de tamanho médio' : 'pequeno';
  return `${t}, ${h}, ${v}`;
}

/**
 * Avalia uma foto. m: { largura, altura, nitidez (variância do laplaciano), luz: { media, estourada } (0 a 1),
 * rostos: [{ x, y, w, h }] (0 a 1), cobertura (0 a 1, ou null se não houve recorte da pessoa), detalheFundo (0 a 1) }.
 * Devolve { aprovada, motivos, itens, acoes }.
 */
function avaliarFoto(m) {
  const motivos = [];
  const l = Math.min(m.largura || 0, m.altura || 0);
  const rostos = m.rostos || [];
  if (!l) motivos.push('Não consegui abrir esta imagem.');
  if (l && l < LIMITES.ladoMinimo) motivos.push(`Pequena demais: ${m.largura} por ${m.altura} pontos.`);
  if (m.nitidez != null && m.nitidez < LIMITES.nitidezMinima) motivos.push('Tremida ou fora de foco.');
  if (m.luz) {
    if (m.luz.media < LIMITES.luzMinima) motivos.push('Escura demais.');
    else if (m.luz.media > LIMITES.luzMaxima) motivos.push('Clara demais.');
    if (m.luz.estourada > LIMITES.estouroMaximo) motivos.push('Com parte da luz estourada, sem detalhe no branco.');
  }
  if (rostos.length > LIMITES.rostosMaximo) motivos.push(`Gente demais para separar do fundo: ${rostos.length} rostos.`);
  const cortado = rostos.some((r) => r.x < LIMITES.bordaDoRosto || r.y < LIMITES.bordaDoRosto || r.x + r.w > 1 - LIMITES.bordaDoRosto || r.y + r.h > 1 - LIMITES.bordaDoRosto);
  if (cortado) motivos.push('Rosto cortado na borda.');
  if (rostos.length === 1 && rostos[0].w < LIMITES.rostoMinimo) motivos.push('Rosto pequeno demais para trabalhar com segurança.');

  const aprovada = motivos.length === 0;
  const itens = [];
  itens.push({ r: 'Pessoas', t: rostos.length === 0 ? 'Nenhuma pessoa. Parece uma paisagem ou um objeto.' : rostos.length === 1 ? 'Uma pessoa.' : `${rostos.length} pessoas.` });
  if (rostos.length) itens.push({ r: 'Rosto', t: rostos.length === 1 ? `${lugarDoRosto(rostos[0])[0].toUpperCase()}${lugarDoRosto(rostos[0]).slice(1)}.` : `O maior: ${lugarDoRosto(rostos.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a)))}.` });
  itens.push({ r: 'Enquadramento', t: `${orientacao(m.largura, m.altura)[0].toUpperCase()}${orientacao(m.largura, m.altura).slice(1)}, ${m.largura} por ${m.altura} pontos.` });
  if (m.detalheFundo != null) itens.push({ r: 'Fundo', t: m.detalheFundo < 0.045 ? 'Liso ou quase liso.' : m.detalheFundo < 0.11 ? 'Com alguns detalhes.' : 'Movimentado, cheio de detalhes.' });
  if (m.luz) itens.push({ r: 'Luz', t: m.luz.media < 0.3 ? 'Mais escura, mas ainda dá para trabalhar.' : m.luz.media > 0.78 ? 'Muito clara, perto do limite.' : 'Boa.' });
  if (m.nitidez != null) itens.push({ r: 'Nitidez', t: m.nitidez >= LIMITES.nitidezBoa ? 'Boa.' : 'Média, um pouco macia.' });
  if (m.cobertura != null && rostos.length === 1) itens.push({ r: 'Recorte da pessoa', t: m.cobertura >= LIMITES.coberturaMinima && m.cobertura <= LIMITES.coberturaMaxima ? 'O programa separou a pessoa do fundo com segurança.' : 'O recorte da pessoa ficou duvidoso, então o fundo real é mantido.' });

  const recorteBom = rostos.length === 1 && m.cobertura != null && m.cobertura >= LIMITES.coberturaMinima && m.cobertura <= LIMITES.coberturaMaxima;
  // O que dá para fazer, com segurança, com esta foto.
  const acoes = { fundo: aprovada && recorteBom, moldura: aprovada, formato: aprovada, escrito: aprovada, gemma: aprovada };
  return { aprovada, motivos, itens, acoes };
}

/** "De 40 fotos, posso trabalhar com 23 com segurança." */
function resumoDaTriagem(total, aprovadas) {
  const fora = total - aprovadas;
  if (!total) return 'Não achei fotos nesta pasta.';
  if (!aprovadas) return `Olhei ${total === 1 ? 'a foto' : 'as ' + total + ' fotos'}, e nenhuma é segura para trabalhar. Veja o diagnóstico das descartadas.`;
  return `De ${total} ${total === 1 ? 'foto' : 'fotos'}, posso trabalhar com ${aprovadas} com segurança.${fora ? ` ${fora} ${fora === 1 ? 'ficou' : 'ficaram'} de fora, e o diagnóstico mostra o motivo de cada uma.` : ''}`;
}

/** O que dá para fazer com as fotos marcadas: quantas aceitam cada ação. */
function acoesDoConjunto(avaliadas) {
  const conta = (k) => avaliadas.filter((a) => a.acoes[k]).length;
  const n = avaliadas.length;
  return [
    { valor: 'fundo', nome: 'Fundo ou moldura', para: conta('fundo'), de: n, minimo: 'moldura' },
    { valor: 'formato', nome: 'Formato', para: conta('formato'), de: n },
    { valor: 'escrito', nome: 'Escrito e figurinha', para: conta('escrito'), de: n }
  ].filter((a) => (a.valor === 'fundo' ? conta('moldura') : a.para) > 0).map((a) => ({ ...a, para: a.valor === 'fundo' ? conta('moldura') : a.para }));
}

/** Quais das fotos marcadas aceitam uma escolha (um fundo que exige o recorte da pessoa, ou uma moldura que mantém o fundo real). */
function quemAceita(avaliadas, exigeRecorte) {
  const servem = [], ficam = [];
  for (const a of avaliadas) (exigeRecorte ? a.acoes.fundo : a.acoes.moldura) ? servem.push(a) : ficam.push(a);
  return { servem, ficam };
}

/** A fala depois de aplicar uma ação: em quantas foi aplicada e quais ficaram de fora. */
function falaDaAplicacao(nomeDaAcao, servem, ficam, motivoFora) {
  const total = servem + ficam.length;
  let t = servem === total ? `${nomeDaAcao}: feito em ${servem === 1 ? 'uma foto' : `todas as ${servem} fotos`}.` : `${nomeDaAcao}: feito em ${servem} de ${total}.`;
  if (ficam.length) t += ` ${ficam.length === 1 ? 'Ficou de fora' : 'Ficaram de fora'} ${ficam.slice(0, 5).join(', ')}${ficam.length > 5 ? ' e mais ' + (ficam.length - 5) : ''}${motivoFora ? ', ' + motivoFora : ''}.`;
  return t;
}

/** A proporção de foto mais próxima da foto original, para quando uma ação precisa de formato e ainda não há um. */
function formatoMaisProximo(proporcoes, largura, altura) {
  const r = largura / altura;
  return proporcoes.filter((p) => !p.fixo).reduce((a, b) => (Math.abs(Math.log(b.w / b.h / r)) < Math.abs(Math.log(a.w / a.h / r)) ? b : a));
}

const api = { EXTENSOES, LIMITES, orientacao, lugarDoRosto, avaliarFoto, resumoDaTriagem, acoesDoConjunto, quemAceita, falaDaAplicacao, formatoMaisProximo };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else raiz.FotosEditar = api;
})(typeof window !== 'undefined' ? window : globalThis);
