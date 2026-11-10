'use strict';
/**
 * 1.9.3: descritor de imagens, experimental. Pedido ao modelo em cada idioma e limpeza da resposta.
 * Puro: funciona no Node (processo principal e testes) e no navegador (window.Descritor).
 */
(function (raiz) {
  const IDIOMAS = [
    { valor: 'pt', nome: 'Português do Brasil' },
    { valor: 'es', nome: 'Español' },
    { valor: 'en', nome: 'English' }
  ];

  const PEDIDOS = {
    pt: 'Descreva esta imagem em português do Brasil, em até três frases curtas, para uma pessoa que não enxerga. ' +
      'Responda só com a descrição, sem introdução e sem despedida. Diga apenas o que você vê com certeza e não invente detalhes. ' +
      'Se houver texto escrito, leia o texto.',
    es: 'Describe esta imagen en español, en un máximo de tres frases cortas, para una persona que no ve. ' +
      'Responde solo con la descripción, sin introducción ni despedida. Di solo lo que ves con seguridad y no inventes detalles. ' +
      'Si hay texto escrito, léelo.',
    en: 'Describe this image in English, in at most three short sentences, for a person who cannot see it. ' +
      'Answer with the description only, with no introduction and no closing remark. Say only what you are sure you see and do not invent details. ' +
      'If there is written text, read it.'
  };
  // 2.0.2: Alt Q, a descrição completa de um quadro de vídeo ou da câmera.
  const PEDIDOS_QUADRO = {
    pt: 'Descreva esta imagem com detalhes, em português do Brasil, para uma pessoa que não enxerga, em até oito frases curtas. ' +
      'Se houver uma pessoa, comece por ela: onde está no quadro, o enquadramento, a expressão, o cabelo, a roupa e as cores. ' +
      'Depois descreva a luz: de onde vem, o contraste e as sombras, principalmente no rosto. Depois o fundo e o que mais aparece. ' +
      'Só fale de maquiagem se ela existir; se não existir, não diga nada sobre isso. Chame a pessoa sempre de "a pessoa". Nunca use as palavras homem, mulher, rapaz, moça, menino, menina, senhor ou senhora, e evite ele e ela. Não diga a idade. ' +
      'Diga apenas o que você vê com certeza e não invente detalhes. Responda só com a descrição, sem introdução e sem despedida. Se houver texto escrito, leia o texto.',
    es: 'Describe esta imagen con detalle, en español, para una persona que no ve, en un máximo de ocho frases cortas. ' +
      'Si hay una persona, empieza por ella: dónde está en el cuadro, el encuadre, la expresión, el cabello, la ropa y los colores. ' +
      'Luego describe la luz: de dónde viene, el contraste y las sombras, sobre todo en el rostro. Luego el fondo y lo demás que aparece. ' +
      'Habla de maquillaje solo si existe; si no existe, no digas nada sobre eso. Llama a la persona siempre "la persona". Nunca uses las palabras hombre, mujer, chico, chica, niño, niña, señor o señora, y evita él y ella. No digas la edad. ' +
      'Di solo lo que ves con seguridad y no inventes detalles. Responde solo con la descripción, sin introducción ni despedida. Si hay texto escrito, léelo.',
    en: 'Describe this image in detail, in English, for a person who cannot see it, in at most eight short sentences. ' +
      'If there is a person, start with them: where they are in the frame, the framing, the expression, the hair, the clothes and the colors. ' +
      'Then describe the light: where it comes from, the contrast and the shadows, especially on the face. Then the background and anything else that appears. ' +
      'Only mention makeup if there is some; if there is none, say nothing about it. Always call the person "the person". Never use the words man, woman, boy, girl, gentleman or lady, and avoid he and she. Do not state age. ' +
      'Say only what you are sure you see and do not invent details. Answer with the description only, with no introduction and no closing remark. If there is written text, read it.'
  };
  /** 3.0.1: a análise de uma foto ou de um post pronto, com o que o programa aplicou (moldura, fundo, escrito, figurinha). */
  function pedidoDeComposicao(contexto) {
    const ctx = String(contexto || '').replace(/\s+/g, ' ').trim();
    return 'Você analisa uma imagem pronta, que o programa montou, para uma pessoa que não enxerga, em português do Brasil, em até doze frases curtas. ' +
      (ctx ? `O que o programa aplicou nesta imagem: ${ctx} ` : '') +
      'Comece pela cena, em poucas frases: se há uma pessoa, onde ela está, a roupa e as cores; se não há pessoa, diga o que há. ' +
      'Depois fale da moldura, se houver uma: como ela é, a impressão e a sensação que ela passa, e diga com clareza se ela orna e combina com o resto ou se briga com alguma coisa, ' +
      'como a roupa se perdendo no fundo, um enfeite em cima do rosto ou das mãos, ou cores que não combinam. Se não houver moldura, não fale de moldura. ' +
      'Se houver escrito, diga se dá para ler, onde está e se cobre o rosto ou algo importante. Se houver figurinha, diga onde está, se está alinhada e se atrapalha. ' +
      'Termine com uma frase dizendo se o conjunto está bom para postar ou o que você mudaria. ' +
      'Chame a pessoa sempre de "a pessoa". Nunca use as palavras homem, mulher, rapaz, moça, menino, menina, senhor ou senhora, e não diga a idade. ' +
      'Diga apenas o que você vê com certeza e não invente detalhes. Responda só com a análise, sem introdução e sem despedida.';
  }
  const pedidoDe = (idioma, modo, contexto) => (modo === 'composicao' ? pedidoDeComposicao(contexto) : ((modo === 'quadro' ? PEDIDOS_QUADRO : PEDIDOS)[idioma]) || (modo === 'quadro' ? PEDIDOS_QUADRO : PEDIDOS).pt);

  // Aberturas e despedidas que o modelo costuma pôr mesmo quando se pede para não pôr.
  const ABERTURA = /^(com certeza|claro|certo|aqui est[aá]|segue|vou descrever|a seguir|claro que s[ií]|aqu[ií] tienes|aqu[ií] est[aá]|por supuesto|con gusto|sure|certainly|of course|here is|here's)\b/i;
  const DESPEDIDA = /^(espero que|se precisar|se quiser|posso ajudar|ojal[aá]|espero que|si necesitas|i hope|let me know|feel free)\b/i;

  /** 2.0.2: rede de segurança do Alt Q: o modelo às vezes ainda escreve "uma mulher". Troca o substantivo por "pessoa". */
  function semGenero(texto) {
    // O que está entre aspas é texto lido na imagem: fica como está.
    return String(texto || '').split(/(["“«][^"”»]*["”»])/).map((parte, i) => (i % 2 ? parte : trocar(parte))).join('');
  }
  function trocar(texto) {
    const manter = (novo) => (m) => (m[0] === m[0].toUpperCase() ? novo.charAt(0).toUpperCase() + novo.slice(1) : novo);
    return String(texto || '')
      .replace(/\b(um|uma)\s+(homem|mulher|rapaz|moça|garoto|garota|menino|menina|senhor|senhora|jovem)\b/gi, manter('uma pessoa'))
      .replace(/\b(o|a)\s+(homem|mulher|rapaz|moça|garoto|garota|menino|menina|senhor|senhora)\b/gi, manter('a pessoa'))
      .replace(/\b(un|una)\s+(hombre|mujer|chico|chica|niño|niña|señor|señora|joven)\b/gi, manter('una persona'))
      .replace(/\b(el|la)\s+(hombre|mujer|chico|chica|niño|niña|señor|señora)\b/gi, manter('la persona'))
      .replace(/\b(a|an|the)\s+(man|woman|boy|girl|gentleman|lady|young man|young woman)\b/gi, (m, art) => manter(art.toLowerCase() === 'the' ? 'the person' : 'a person')(m));
  }

  /** Texto limpo da resposta do modelo: uma frase corrida, sem marcação e sem abertura nem despedida. */
  function limparResposta(bruto) {
    let linhas = String(bruto || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
    linhas = linhas.filter((l) => !ABERTURA.test(l) || !/[:：]$/.test(l)); // "Com certeza! Aqui está a descrição:" some
    linhas = linhas.filter((l) => !DESPEDIDA.test(l)).map((l) => l.replace(/^["“”«»]+|["“”«»]+$/g, '').trim());
    let t = linhas.join(' ')
      .replace(/\*\*?|__|`+/g, '')
      .replace(/(^|\s)\d+\.\s+/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    t = t.replace(/^["“”«»]+|["“”«»]+$/g, '').trim();
    return t;
  }

  const api = { IDIOMAS, pedidoDe, pedidoDeComposicao, limparResposta, semGenero };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Descritor = api;
})(typeof window !== 'undefined' ? window : globalThis);
