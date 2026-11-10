'use strict';
/** Nomes e descrições das escolhas (lidos pelo leitor de tela junto com cada opção). */

const PROPORCOES = [
  { valor: 'horizontal', nome: 'Horizontal, 16 por 9 (YouTube)',
    descricao: 'Para o YouTube e para ver no computador ou na TV. Usa a imagem inteira da câmera.' },
  { valor: 'vertical', nome: 'Vertical, 9 por 16 (shorts, Reels e stories)',
    descricao: 'Para shorts do YouTube, Reels e stories do Instagram, TikTok e status do WhatsApp. Usa só a faixa do meio da câmera: fique bem no centro.' },
  { valor: 'quadrado', nome: 'Quadrado, 1 por 1 (feed do Instagram)',
    descricao: 'Para o feed do Instagram e do Facebook. Usa o quadrado do meio da câmera.' }
];

const QUALIDADES = [
  { valor: 'alta', nome: 'Alta',
    descricao: '1080p, 30 quadros por segundo, quase sem compressão. A melhor imagem, mas arquivos grandes: cerca de 3 a 5 GB por hora, conforme o movimento.' },
  { valor: 'padrao', nome: 'Padrão',
    descricao: '1080p, 30 quadros por segundo, compressão moderada. Boa imagem para YouTube e redes sociais: cerca de 1,5 a 2 GB por hora.' },
  { valor: 'leve', nome: 'Leve',
    descricao: '720p, 30 quadros por segundo. Imagem um pouco menos nítida; bom para vídeos longos ou para mandar pelo WhatsApp: cerca de 0,8 a 1 GB por hora.' }
];

const USOS_DO_TEXTO = [
  { valor: 'leitor', nome: 'Só no leitor de tela',
    descricao: 'A frase atual é falada pelo leitor de tela e aparece só nesta janela. Não entra no vídeo.' },
  { valor: 'legenda', nome: 'Mostrar na tela do vídeo, como legenda',
    descricao: 'A frase atual também fica escrita na parte de baixo do vídeo, em letras brancas sobre uma faixa escura, e muda quando você troca de frase.' }
];

const EFEITOS = [
  { valor: 'borrar', nome: 'Borrar o fundo', sufixo: 'fundo borrado',
    descricao: 'Desfoca o que está atrás de você, como uma câmera profissional. É o mais natural e o que menos erra: bom para quase todo vídeo, inclusive com movimento de mãos. Não esconde totalmente o ambiente: ainda dá para perceber cores e formas.' },
  { valor: 'substituir', nome: 'Substituir o fundo', sufixo: null,
    descricao: 'Troca o que está atrás de você por uma imagem pronta. Bom quando o ambiente está bagunçado ou você não quer mostrar onde está. Não é bom com muito movimento de mãos, cabelo solto ou volumoso, ou roupa da cor da parede: as bordas podem tremer ou piscar. Funciona melhor com você mais parada, boa luz e parede lisa atrás.' }
,
  { valor: 'nenhum', nome: 'Não mudar a imagem (só o áudio)', sufixo: null,
    descricao: 'A imagem fica como foi gravada. Use quando quiser só melhorar o áudio: volume, equalização ou velocidade, logo abaixo.' }];

const FUNDOS = [
  { valor: 'consultorio', nome: 'Consultório (neutro)', sufixo: 'fundo consultório',
    descricao: 'Parede clara em tom bege, estante de madeira clara com livros e uma plantinha, luminária de chão acesa e janela com cortina branca, tudo levemente desfocado. Bom para vídeos profissionais: orientações de psicologia, explicações e divulgação do seu trabalho.' },
  { valor: 'praia', nome: 'Praia ao pôr do sol', sufixo: 'fundo praia',
    descricao: 'Mar calmo com reflexos dourados, céu laranja e rosa, sol baixo no horizonte, areia clara e um coqueiro desfocado num canto. Bom para vídeos leves e inspiradores: reflexões, mensagens de bem-estar e contos. Menos indicado para assuntos sérios ou técnicos.' },
  { valor: 'sala', nome: 'Sala de estar simples e aconchegante', sufixo: 'fundo sala de estar',
    descricao: 'Casa brasileira comum, sem luxo: sofá de tecido cor de terracota com manta de crochê e almofadas, mesinha de madeira com uma caneca, planta costela-de-adão, quadro abstrato e janela com cortina clara e luz de fim de tarde, tudo desfocado. Bom para conversas intimistas, desabafos, contos e vídeos de tom pessoal.' }
];

const acharPor = (lista, valor) => lista.find((x) => x.valor === valor) || null;

const ESPELHO = {
  nome: 'Minha câmera espelha a imagem',
  descricao: 'Marque se a sua câmera mostra a imagem como um espelho. Assim o Alt E acerta os lados quando diz para ir para a sua direita ou para a sua esquerda. Na versão 0.2 os lados saíam trocados na sua câmera; por isso vem marcado. Se não souber, use o botão Testar o espelho.'
};

module.exports = { ESPELHO, PROPORCOES, QUALIDADES, USOS_DO_TEXTO, EFEITOS, FUNDOS, acharPor };
