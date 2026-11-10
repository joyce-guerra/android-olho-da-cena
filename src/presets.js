'use strict';

/**
 * Presets de atmosfera.
 *
 * baseDuration -> quanto tempo cada imagem fica na tela no modo "looping".
 *                 No modo "distribuir" esse valor é ignorado: o tempo do áudio
 *                 é dividido igualmente entre as imagens.
 * zoomAmount   -> o quanto o zoom cresce (ou encolhe) ao longo do segmento.
 *                 0.18 = 18% de aproximação do começo ao fim.
 * panPattern   -> ciclo de deslocamento horizontal aplicado imagem a imagem.
 *                 -1 = anda pra esquerda, 1 = pra direita, 0 = parado.
 * fade         -> duração do fade de entrada e de saída de cada segmento,
 *                 em segundos. 0 = corte seco.
 * grade        -> filtros extras de cor aplicados no fim da cadeia.
 * fps          -> quadros por segundo do vídeo final.
 * descricaoTitulo -> como descrever o preset numa tela onde só o título usa
 *                 ele, sem imagem nem movimento envolvidos (o modo juntar).
 * titulo       -> como o texto sobreposto se comporta neste preset: fonte,
 *                 altura na tela, velocidade de entrada, tempo na tela e o
 *                 peso da caixa escura atrás. Opcionais: corTexto e corCaixa
 *                 (cores do texto e da caixa) e escala (tamanho do texto).
 * fundoImagem  -> como fica o fundo desfocado que preenche o que sobra quando a
 *                 imagem não tem a proporção do vídeo: desfoque, brilho, cor.
 * logo         -> estilo do logo neste preset: escala do tamanho, força da
 *                 sombra, duração do fade e margem da borda. A caixa em si nunca some — ela é
 *                 o piso de legibilidade, igual em todos os presets. O que
 *                 muda é a identidade em cima desse piso.
 *
 * O ponto importante: nada aqui é tempo absoluto de efeito. O zoom e o pan são
 * calculados em cima da duração real de cada segmento, então o movimento sempre
 * termina exatamente quando a imagem sai da tela — seja um segmento de 12
 * segundos ou de 3 minutos.
 */

const PRESETS = {
  'canal-dark': {
    id: 'canal-dark',
    nome: 'Canal dark',
    descricao:
      'Imagem parada por mais tempo, aproximação lenta, fade longo pelo preto, cor dessaturada e vinheta nas bordas.',
    baseDuration: 12,
    zoomAmount: 0.1,
    panPattern: [0, -1, 0, 1],
    fade: 1.2,
    grade: 'eq=contrast=1.05:saturation=0.68:brightness=-0.03,vignette=PI/4.5',
    descricaoTitulo:
      'Fonte com serifa, entrada lenta, caixa mais fechada e texto demorado.',
    titulo: {
      fontes: ['C:/Windows/Fonts/georgiab.ttf', 'C:/Windows/Fonts/georgia.ttf',
               'C:/Windows/Fonts/timesbd.ttf'],
      posicao: 0.76,
      entrada: 1.2,
      duracao: 6,
      duracaoFim: 5,
      opacidadeCaixa: 0.65,
      margemCaixa: 26,
      espacoLinha: 14
    },
    fundoImagem: { desfoque: 60, brilho: -0.18, saturacao: 0.7 },
    logo: { escala: 0.9, sombra: 0.7, fade: 1.2, margem: 0.04 },
    fps: 30
  },

  'clipe-musical': {
    id: 'clipe-musical',
    nome: 'Clipe musical',
    descricao:
      'Trocas rápidas, corte seco, zoom marcado e movimento alternando de lado. Combina com música com batida.',
    baseDuration: 5,
    zoomAmount: 0.18,
    panPattern: [-1, 1, 0, 1, -1],
    fade: 0,
    grade: 'eq=contrast=1.08:saturation=1.12',
    descricaoTitulo:
      'Fonte pesada, texto entrando rápido e pouco tempo na tela.',
    titulo: {
      fontes: ['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf'],
      posicao: 0.72,       // altura na tela, de cima pra baixo
      entrada: 0.5,        // fade de entrada e saída do texto
      duracao: 4,          // tempo na tela
      duracaoFim: 3.5,
      opacidadeCaixa: 0.5,
      margemCaixa: 18,
      espacoLinha: 8
    },
    fundoImagem: { desfoque: 50, brilho: -0.08, saturacao: 1.1 },
    logo: { escala: 1, sombra: 0.5, fade: 0.2, margem: 0.035 },
    fps: 30
  },

  'balada': {
    id: 'balada',
    nome: 'Balada',
    descricao:
      'Mais lento que o clipe musical, mas ainda com vida: câmera em deriva contínua em vez de alternar de lado, zoom suave, dissolução entre imagens e cor quente. Combina com música mais calma, voz e violão, balada.',
    baseDuration: 8,
    zoomAmount: 0.12,
    panPattern: [1, 1, -1, -1],
    fade: 0.6,
    grade: 'eq=contrast=1.05:saturation=1.1:gamma_r=1.03:gamma_b=0.97',
    descricaoTitulo:
      'Fonte igual à do clipe musical, entrada em ritmo médio e caixa um pouco mais aberta.',
    titulo: {
      fontes: ['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf'],
      posicao: 0.72,
      entrada: 0.7,
      duracao: 5,
      duracaoFim: 4,
      opacidadeCaixa: 0.5,
      margemCaixa: 20,
      espacoLinha: 10
    },
    fundoImagem: { desfoque: 60, brilho: -0.08, saturacao: 0.95 },
    logo: { escala: 1, sombra: 0.55, fade: 0.6, margem: 0.035 },
    fps: 30
  },

  'tensao': {
    id: 'tensao',
    nome: 'Tensão',
    descricao:
      'Mais rápido e mais fechado que o canal dark: zoom quase claustrofóbico, cor fria e dessaturada, vinheta mais forte e corte mais seco. Pensado para o momento de virada de um conto, quando a tensão aperta em vez de embalar.',
    baseDuration: 6,
    zoomAmount: 0.16,
    panPattern: [0, 0, -1, 0],
    fade: 0.4,
    grade: 'eq=contrast=1.15:saturation=0.45:brightness=-0.05,vignette=PI/3.2',
    descricaoTitulo:
      'Fonte com serifa igual à do canal dark, entrada rápida e texto mais curto na tela.',
    titulo: {
      fontes: ['C:/Windows/Fonts/georgiab.ttf', 'C:/Windows/Fonts/georgia.ttf',
               'C:/Windows/Fonts/timesbd.ttf'],
      posicao: 0.76,
      entrada: 0.6,
      duracao: 5,
      duracaoFim: 4,
      opacidadeCaixa: 0.7,
      margemCaixa: 24,
      espacoLinha: 12
    },
    fundoImagem: { desfoque: 60, brilho: -0.2, saturacao: 0.55 },
    logo: { escala: 0.9, sombra: 0.7, fade: 0.4, margem: 0.04 },
    fps: 30
  },

  'animacao': {
    id: 'animacao',
    nome: 'Animação',
    descricao:
      'Cor viva e saturada, zoom e câmera alternando com energia alegre, corte rápido. Pra vídeo de brincadeira, conteúdo infantil ou engraçadinho.',
    baseDuration: 5,
    zoomAmount: 0.15,
    panPattern: [1, -1, 1, -1, 0],
    fade: 0.3,
    grade: 'eq=contrast=1.1:saturation=1.35:brightness=0.02:gamma=1.05',
    descricaoTitulo:
      'Fonte arredondada e animada, caixa mais leve, texto rápido na tela.',
    titulo: {
      fontes: ['C:/Windows/Fonts/comicbd.ttf', 'C:/Windows/Fonts/comic.ttf',
               'C:/Windows/Fonts/arialbd.ttf'],
      posicao: 0.72,
      entrada: 0.4,
      duracao: 4,
      duracaoFim: 3.5,
      opacidadeCaixa: 0.45,
      margemCaixa: 16,
      espacoLinha: 8
    },
    fundoImagem: { desfoque: 40, brilho: 0.03, saturacao: 1.25 },
    logo: { escala: 1.1, sombra: 0.45, fade: 0.3, margem: 0.035 },
    fps: 30
  },

  'literario': {
    id: 'literario',
    nome: 'Literário',
    descricao:
      'Em vez de corte ou fade pelo preto, uma imagem passa por cima da ' +
      'outra como se fosse uma página virando: por um instante as duas ' +
      'aparecem juntas. Câmera quase parada, cor quente e um pouco ' +
      'desbotada, como papel encorpado. Funciona melhor com imagens que já ' +
      'parecem ilustração de livro ou gravura, em vez de foto realista: ' +
      'traço desenhado, fundo mais liso, tom amarelado ou acastanhado, pouca ' +
      'coisa disputando o centro da composição. Pensado para conto.',
    baseDuration: 10,
    zoomAmount: 0.06,
    panPattern: [0],
    fade: 0.8,
    transicao: 'wipeleft',
    grade: 'eq=contrast=1.02:saturation=0.82:gamma_r=1.06:gamma_b=0.88:brightness=0.02',
    descricaoTitulo:
      'Fonte serifada e discreta, entrada calma, caixa leve — o texto como ' +
      'legenda de página, não como destaque.',
    titulo: {
      fontes: ['C:/Windows/Fonts/georgia.ttf', 'C:/Windows/Fonts/georgiab.ttf',
               'C:/Windows/Fonts/timesbd.ttf'],
      posicao: 0.8,
      entrada: 0.9,
      duracao: 6,
      duracaoFim: 5,
      opacidadeCaixa: 0.45,
      margemCaixa: 22,
      espacoLinha: 12
    },
    fundoImagem: { desfoque: 60, brilho: -0.04, saturacao: 0.75 },
    logo: { escala: 0.9, sombra: 0.4, fade: 0.8, margem: 0.04 },
    fps: 30
  },

  'estatico-suave': {
    id: 'estatico-suave',
    nome: 'Estático suave',
    descricao:
      'Movimento quase imperceptível e transições bem longas. Feito pra narração, podcast e áudio comprido.',
    baseDuration: 20,
    zoomAmount: 0.04,
    panPattern: [0],
    fade: 2.0,
    grade: '',
    descricaoTitulo:
      'Fonte limpa, entrada tranquila e o texto mais demorado de todos os presets.',
    titulo: {
      fontes: ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/segoeui.ttf',
               'C:/Windows/Fonts/calibrib.ttf'],
      posicao: 0.74,
      entrada: 0.9,
      duracao: 7,
      duracaoFim: 5,
      opacidadeCaixa: 0.55,
      margemCaixa: 22,
      espacoLinha: 12
    },
    fundoImagem: { desfoque: 60, brilho: -0.12, saturacao: 0.85 },
    logo: { escala: 0.9, sombra: 0.5, fade: 2.0, margem: 0.04 },
    fps: 25
  },

  'familia': {
    id: 'familia',
    nome: 'Família',
    descricao:
      'Pra viagem, aniversário e festa. Cada imagem fica bastante tempo, com movimento suave alternando de lado, dissolução de um segundo entre elas e cor quente e clara, sem vinheta.',
    baseDuration: 7,
    zoomAmount: 0.1,
    panPattern: [1, -1, 1, -1],
    fade: 1,
    grade: 'eq=contrast=1.03:saturation=1.12:brightness=0.03:gamma_r=1.03:gamma_b=0.96',
    descricaoTitulo:
      'Fonte limpa e arredondada, entrada suave e caixa clara, de clima afetuoso.',
    titulo: {
      fontes: ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/segoeui.ttf',
               'C:/Windows/Fonts/arialbd.ttf'],
      posicao: 0.74,
      entrada: 0.8,
      duracao: 6,
      duracaoFim: 5,
      opacidadeCaixa: 0.4,
      margemCaixa: 20,
      espacoLinha: 10
    },
    fundoImagem: { desfoque: 50, brilho: 0.02, saturacao: 1.05 },
    logo: { escala: 1, sombra: 0.45, fade: 1, margem: 0.035 },
    fps: 30
  },

  'educativo': {
    id: 'educativo',
    nome: 'Educativo',
    descricao:
      'Pra estudo, aula e tutorial, no estilo de slide: mais texto que imagem. Imagem quase parada por bastante tempo, cor neutra e transição curta. O título vem em amarelo sobre azul escuro, cores que chamam a atenção e ajudam no foco, em fonte bem legível.',
    baseDuration: 15,
    zoomAmount: 0.03,
    panPattern: [0],
    fade: 0.5,
    grade: 'eq=contrast=1.02:saturation=0.95',
    descricaoTitulo:
      'Título em amarelo sobre azul escuro, fonte bem legível, entrada rápida e texto demorado na tela.',
    titulo: {
      fontes: ['C:/Windows/Fonts/calibrib.ttf', 'C:/Windows/Fonts/verdanab.ttf',
               'C:/Windows/Fonts/arialbd.ttf'],
      posicao: 0.74,
      entrada: 0.4,
      duracao: 7,
      duracaoFim: 5,
      opacidadeCaixa: 0.88,
      margemCaixa: 24,
      espacoLinha: 12,
      corTexto: '0xFFD60A',
      corCaixa: '0x0B1F4B',
      escala: 1.08
    },
    fundoImagem: { desfoque: 40, brilho: -0.02, saturacao: 0.9 },
    logo: { escala: 1, sombra: 0.6, fade: 0.5, margem: 0.035 },
    fps: 25
  },

  'novelinhas': {
    id: 'novelinhas',
    nome: 'Novelinhas',
    descricao:
      'Pra novelinha, historinha inventada e personagem de RPG. O mais animado: zoom forte, câmera deslizando de um lado pro outro, imagem que desliza pra dar lugar à próxima e cor quente com contraste alto. Título grande e pesado.',
    baseDuration: 6,
    zoomAmount: 0.22,
    panPattern: [1, -1, 1, -1, -1, 1],
    fade: 0.5,
    transicao: 'slideleft',
    grade: 'eq=contrast=1.12:saturation=1.3:brightness=0.02:gamma_r=1.04:gamma_b=0.95',
    descricaoTitulo:
      'Fonte pesada e grande, entrada rápida e texto curto na tela.',
    titulo: {
      fontes: ['C:/Windows/Fonts/impact.ttf', 'C:/Windows/Fonts/arialbd.ttf'],
      posicao: 0.72,
      entrada: 0.4,
      duracao: 4,
      duracaoFim: 3.5,
      opacidadeCaixa: 0.55,
      margemCaixa: 18,
      espacoLinha: 8,
      escala: 1.15
    },
    fundoImagem: { desfoque: 45, brilho: -0.04, saturacao: 1.2 },
    logo: { escala: 1.1, sombra: 0.55, fade: 0.3, margem: 0.035 },
    fps: 30
  }

};

function getPreset(id) {
  const p = PRESETS[id];
  if (!p) throw new Error('Preset desconhecido: ' + id);
  return p;
}

// 1.7: presets no mesmo padrão dos fundos: nome, depois aplicação, depois descrição.
// 1.9.2: como nos fundos, a aplicação diz para que é bom e para que é menos indicado;
// a descrição (o que acontece na imagem) vem depois. A cena sai do texto antigo de cada preset.
const ANTIGAS = {
  'canal-dark': 'Bom para canais dark: narração de histórias de mistério, suspense e terror.',
  'clipe-musical': 'Combina com música com batida.',
  'balada': 'Combina com música mais calma, voz e violão, balada.',
  'tensao': 'Pensado para o momento de virada de um conto, quando a tensão aperta em vez de embalar.',
  'animacao': 'Pra vídeo de brincadeira, conteúdo infantil ou engraçadinho.',
  'literario': 'Pensado para conto.',
  'estatico-suave': 'Feito pra narração, podcast e áudio comprido.',
  'familia': 'Pra viagem, aniversário e festa.',
  'educativo': 'Pra estudo, aula e tutorial, no estilo de slide: mais texto que imagem.',
  'novelinhas': 'Pra novelinha, historinha inventada e personagem de RPG.'
};
const UTILIZACAO = {
  'canal-dark': 'Bom para canais dark: narração de histórias de mistério, suspense e terror.',
  'clipe-musical': 'Bom para música com batida, clipes e vídeos animados.',
  'balada': 'Bom para música mais calma, voz e violão, balada e homenagens.',
  'tensao': 'Bom para o momento de virada de um conto, quando a tensão aperta em vez de embalar.',
  'animacao': 'Bom para vídeo de brincadeira, conteúdo infantil ou engraçado.',
  'literario': 'Bom para conto narrado, poesia e leitura de livro.',
  'estatico-suave': 'Bom para narração, podcast, meditação e áudio comprido.',
  'familia': 'Bom para viagem, aniversário, festa e lembranças de família.',
  'educativo': 'Bom para estudo, aula e tutorial, no estilo de slide: mais texto que imagem.',
  'novelinhas': 'Bom para novelinha, historinha inventada e personagem de RPG.'
};
const CONTRAINDICACAO = {
  'canal-dark': 'Menos indicado para vídeos alegres, infantis ou de festa.',
  'clipe-musical': 'Menos indicado para narração longa, conto ou aula, porque as trocas rápidas cansam.',
  'balada': 'Menos indicado para música agitada ou para assunto de tensão.',
  'tensao': 'Menos indicado para o vídeo inteiro de uma história longa e para assuntos leves, porque pesa e cansa.',
  'animacao': 'Menos indicado para assuntos sérios, luto ou reflexão.',
  'literario': 'Menos indicado para fotos realistas e para música com batida, porque a virada de página é lenta.',
  'estatico-suave': 'Menos indicado para música agitada ou para vídeo curto que precisa prender a atenção.',
  'familia': 'Menos indicado para assuntos sérios, suspense ou conteúdo técnico.',
  'educativo': 'Menos indicado para música, conto ou vídeo emotivo, porque o visual é sóbrio, de sala de aula.',
  'novelinhas': 'Menos indicado para narração calma, aula ou assunto sério, porque é o mais agitado.'
};
for (const id of Object.keys(UTILIZACAO)) {
  const p = PRESETS[id];
  p.cena = p.descricao.replace(ANTIGAS[id], '').replace(/\s+/g, ' ').trim();
  p.utilizacao = UTILIZACAO[id];
  p.contraindicacao = CONTRAINDICACAO[id];
  p.aplicacao = `${UTILIZACAO[id]} ${CONTRAINDICACAO[id]}`;
}

const { descricaoPadrao } = require('./padrao');

function listPresets(contexto) {
  const soTitulo = contexto === 'titulo';
  return Object.values(PRESETS).map((p) => ({
    id: p.id,
    nome: p.nome,
    aplicacao: p.aplicacao,
    utilizacao: p.utilizacao,
    contraindicacao: p.contraindicacao,
    cena: soTitulo ? p.descricaoTitulo : p.cena,
    descricao: descricaoPadrao({ indicacao: p.utilizacao, contraindicacao: p.contraindicacao, descricao: soTitulo ? p.descricaoTitulo : p.cena }),
    baseDuration: p.baseDuration,
    transicao: !!p.transicao
  }));
}

module.exports = { PRESETS, getPreset, listPresets };
