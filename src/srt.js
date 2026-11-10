'use strict';

/**
 * Leitura, revisão e escrita de arquivos de legenda SRT.
 *
 * Existe para dar uma segunda conferida na legenda antes de queimar no vídeo,
 * já que quem gera não consegue olhar o resultado depois. Arruma só o que é
 * seguro arrumar sem tocar no áudio: quebra de linha, palavra cortada no meio
 * por um hífen de quebra, fala sobrepondo a próxima, e duração curta ou longa
 * demais — sempre reorganizando o que já estava escrito, nunca inventando
 * texto novo.
 */

const CARACTERES_POR_LINHA = 45;
const DURACAO_MINIMA = 2;
const DURACAO_MAXIMA = 6;

function tempoParaSegundos(t) {
  const m = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(String(t).trim());
  if (!m) return 0;
  const [, h, min, s, ms] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(s) + Number(ms) / 1000;
}

function segundosParaTempo(s) {
  const total = Math.max(0, s);
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const seg = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const p2 = (n) => String(n).padStart(2, '0');
  const p3 = (n) => String(n).padStart(3, '0');
  return `${p2(h)}:${p2(min)}:${p2(seg)},${p3(ms)}`;
}

/** Lê o .srt e devolve as falas como objetos simples ({ inicio, fim, linhas }). */
function parseSrt(conteudo) {
  const blocos = String(conteudo)
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const cues = [];
  for (const bloco of blocos) {
    const linhas = bloco.split('\n');
    // A primeira linha costuma ser o número da fala; pode faltar em arquivo
    // mal formado, então só pula se realmente for um número isolado.
    let i = 0;
    if (/^\d+$/.test(linhas[0])) i = 1;
    const tempos = /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/.exec(linhas[i] || '');
    if (!tempos) continue;
    const texto = linhas.slice(i + 1);
    cues.push({
      inicio: tempoParaSegundos(tempos[1]),
      fim: tempoParaSegundos(tempos[2]),
      linhas: texto.length ? texto : ['']
    });
  }
  return cues;
}

/** Reescreve as falas revisadas no formato .srt. */
function serializeSrt(cues) {
  return cues
    .map((c, i) =>
      `${i + 1}\n${segundosParaTempo(c.inicio)} --> ${segundosParaTempo(c.fim)}\n${c.linhas.join('\n')}\n`
    )
    .join('\n');
}

/** Quebra um texto corrido em linhas de até `limite` caracteres, sem cortar palavra. */
function quebrarEmLinhas(texto, limite) {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const candidata = atual ? `${atual} ${p}` : p;
    if (candidata.length > limite && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = candidata;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/**
 * Quebra um texto corrido em exatamente duas linhas, no ponto (entre
 * palavras) que deixa as duas o mais parecidas possível em tamanho.
 *
 * Existe porque o limite real da Joy é "no máximo duas linhas" — mais
 * importante que o alvo de 40 a 45 caracteres. Encher a primeira linha até o
 * limite e empurrar o resto inteiro pra segunda, como `quebrarEmLinhas`
 * faria, podia deixar a segunda linha comprida demais e o próprio player
 * quebrando ela de novo sozinho, virando três linhas na tela sem a gente
 * perceber.
 */
function quebrarEmDuasLinhas(texto) {
  const palavras = texto.split(/\s+/).filter(Boolean);
  if (palavras.length <= 1) return [texto];

  let melhorIndice = 1;
  let melhorDiferenca = Infinity;
  for (let i = 1; i < palavras.length; i++) {
    const linha1 = palavras.slice(0, i).join(' ');
    const linha2 = palavras.slice(i).join(' ');
    const diferenca = Math.abs(linha1.length - linha2.length);
    if (diferenca < melhorDiferenca) {
      melhorDiferenca = diferenca;
      melhorIndice = i;
    }
  }
  return [palavras.slice(0, melhorIndice).join(' '), palavras.slice(melhorIndice).join(' ')];
}

/**
 * Revisa as falas, corrigindo o que é seguro corrigir:
 *
 * - Palavra cortada por um hífen de quebra (uma linha termina com "-" colado
 *   numa letra, e a linha seguinte começa em minúscula): junta as duas e
 *   requebra certo.
 * - Mais de duas linhas, ou linha comprida demais: requebra em até duas
 *   linhas equilibradas, dentro do limite de caracteres.
 * - Fala cujo fim invade o início da próxima: encurta o fim dela.
 * - Fala curta demais (menos de 2s) ou longa demais (mais de 6s): ajusta o
 *   fim, só quando isso não invade a fala vizinha.
 *
 * Nunca muda o INÍCIO de uma fala — é o que mantém a legenda junto da voz —
 * e nunca inventa palavra nova, só reorganiza o que já estava escrito.
 * Devolve as falas revisadas e a lista dos pontos corrigidos (para contagem,
 * não para detalhe).
 */
function revisarCues(cuesOriginais) {
  const cues = cuesOriginais.map((c) => ({ ...c, linhas: [...c.linhas] }));
  const pontos = [];

  // Palavra cortada por hífen de quebra: dentro da mesma fala, entre linhas.
  for (let i = 0; i < cues.length; i++) {
    const linhas = cues[i].linhas;
    for (let j = 0; j < linhas.length - 1; j++) {
      if (/\w-$/.test(linhas[j]) && /^[a-zàáâãéêíóôõúç]/.test(linhas[j + 1] || '')) {
        linhas[j] = linhas[j].replace(/-$/, '') + linhas[j + 1];
        linhas.splice(j + 1, 1);
        pontos.push('palavra cortada por hífen de quebra, dentro da mesma fala');
        j--;
      }
    }
  }

  // Palavra cortada entre o fim de uma fala e o começo da próxima.
  for (let i = 0; i < cues.length - 1; i++) {
    const atual = cues[i].linhas;
    const prox = cues[i + 1].linhas;
    const ultima = atual[atual.length - 1] || '';
    const primeira = prox[0] || '';
    if (/\w-$/.test(ultima) && /^[a-zàáâãéêíóôõúç]/.test(primeira)) {
      atual[atual.length - 1] = ultima.replace(/-$/, '') + primeira;
      prox.shift();
      if (!prox.length) prox.push('');
      pontos.push('palavra cortada entre duas falas consecutivas');
    }
  }

  // Requebrar linhas longas ou em excesso.
  for (const c of cues) {
    const textoCorrido = c.linhas.join(' ').replace(/\s+/g, ' ').trim();
    if (!textoCorrido) continue;
    const cabeNumaLinha = c.linhas.length === 1 && textoCorrido.length <= CARACTERES_POR_LINHA;
    const precisaRequebrar =
      !cabeNumaLinha &&
      (c.linhas.length > 2 ||
        c.linhas.some((l) => l.length > CARACTERES_POR_LINHA) ||
        c.linhas.length !== 2);
    if (precisaRequebrar) {
      // Sempre no máximo duas linhas — é o limite rígido. Dentro disso, tenta
      // deixar as duas o mais parecidas possível em tamanho, o que também
      // tende a ficar perto da faixa de 40 a 45 caracteres por linha para
      // falas de tamanho normal.
      c.linhas = quebrarEmDuasLinhas(textoCorrido);
      pontos.push('linha requebrada para caber em até duas linhas');
    }
  }

  // Sobreposição com a fala seguinte.
  for (let i = 0; i < cues.length - 1; i++) {
    const prox = cues[i + 1];
    if (cues[i].fim > prox.inicio) {
      cues[i].fim = Math.max(cues[i].inicio + 0.3, prox.inicio - 0.02);
      pontos.push('fala sobrepondo a próxima, fim ajustado');
    }
  }

  // Duração fora de 2 a 6 segundos, só quando dá para ajustar sem invadir a
  // fala vizinha.
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const duracao = c.fim - c.inicio;
    const prox = cues[i + 1];
    const limiteSeguro = prox ? prox.inicio - 0.02 : c.inicio + DURACAO_MAXIMA;

    if (duracao < DURACAO_MINIMA) {
      const novoFim = Math.min(c.inicio + DURACAO_MINIMA, limiteSeguro);
      if (novoFim > c.fim + 0.01) {
        c.fim = novoFim;
        pontos.push('fala curta demais (menos de 2s), duração estendida');
      }
    } else if (duracao > DURACAO_MAXIMA) {
      c.fim = c.inicio + DURACAO_MAXIMA;
      pontos.push('fala longa demais (mais de 6s), duração reduzida');
    }
  }

  return { cues, pontos };
}

/**
 * Lê um .srt, revisa, e grava a versão revisada num arquivo novo — o arquivo
 * original nunca é alterado. Devolve o caminho a usar na queima e uma frase
 * curta de resultado, pronta para ser falada ou mostrada, sem entrar em
 * detalhe: o que importa para quem não vai olhar o vídeo depois é saber que
 * foi conferido, não a lista inteira do que mudou.
 */
function revisarArquivoLegenda(caminhoOriginal, caminhoRevisado, fs) {
  const conteudo = fs.readFileSync(caminhoOriginal, 'utf8');
  const cuesOriginais = parseSrt(conteudo);

  if (!cuesOriginais.length) {
    fs.writeFileSync(caminhoRevisado, conteudo, 'utf8');
    return {
      caminho: caminhoRevisado,
      resumo: 'Não foi possível revisar a legenda: o arquivo parece vazio ou num formato que não reconheço.'
    };
  }

  const { cues, pontos } = revisarCues(cuesOriginais);
  fs.writeFileSync(caminhoRevisado, serializeSrt(cues), 'utf8');

  const resumo = pontos.length
    ? `Legenda revisada: foram ajustados ${pontos.length} ponto${pontos.length > 1 ? 's' : ''} (quebra de linha, palavra cortada ou duração).`
    : 'Legenda revisada: não foi necessário nenhum ajuste.';

  return { caminho: caminhoRevisado, resumo };
}

module.exports = {
  parseSrt,
  serializeSrt,
  revisarCues,
  revisarArquivoLegenda,
  tempoParaSegundos,
  segundosParaTempo,
  quebrarEmLinhas
};
