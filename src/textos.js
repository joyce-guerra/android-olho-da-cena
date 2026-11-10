'use strict';
/** Nomes e descrições das escolhas (lidos pelo leitor de tela junto com cada opção). */
const { descricaoPadrao } = require('./padrao');
// 2.0: toda opção é dita assim: nome, indicação, contraindicação e descrição.
const padrao = (itens) => itens.map((x) => ({ ...x, descricao: descricaoPadrao(x) }));

const PROPORCOES = padrao([
  { valor: 'horizontal', nome: 'Horizontal, 16 por 9 (YouTube)',
    indicacao: 'Bom para o YouTube e para ver no computador ou na TV.',
    contraindicacao: 'Menos indicado para shorts, Reels e stories, que são verticais.',
    descricao: 'Usa a imagem inteira da câmera. Fique a mais ou menos um braço esticado, com o rosto perto do meio.' },
  { valor: 'vertical', nome: 'Vertical, 9 por 16 (shorts, Reels e stories)',
    indicacao: 'Bom para shorts do YouTube, Reels e stories do Instagram, TikTok e status do WhatsApp.',
    contraindicacao: 'Menos indicado para vídeo que vai ser visto no computador ou na TV.',
    descricao: 'Usa só a faixa do meio da câmera, cerca de um terço da largura. Fique a pelo menos dois braços da câmera, bem no centro, e use o Alt E para conferir.' },
  { valor: 'quadrado', nome: 'Quadrado, 1 por 1 (feed do Instagram)',
    indicacao: 'Bom para o feed do Instagram e do Facebook.',
    contraindicacao: 'Menos indicado para YouTube, shorts e stories.',
    descricao: 'Usa o quadrado do meio da câmera, pouco mais da metade da largura. Fique a um braço e meio, com o rosto no meio.' }
]);

const QUALIDADES = padrao([
  { valor: 'alta', nome: 'Alta',
    indicacao: 'Bom para quando a melhor imagem importa mais que o tamanho do arquivo.',
    contraindicacao: 'Menos indicado para vídeos longos, para mandar pelo WhatsApp ou para computador com pouco espaço.',
    descricao: '1080p, 30 quadros por segundo, quase sem compressão. Arquivos grandes: cerca de 3 a 5 GB por hora, conforme o movimento.' },
  { valor: 'padrao', nome: 'Padrão',
    indicacao: 'Bom para YouTube e redes sociais, na maioria dos vídeos.',
    contraindicacao: 'Menos indicado para quem precisa da imagem mais nítida possível ou de um arquivo bem pequeno.',
    descricao: '1080p, 30 quadros por segundo, compressão moderada. Cerca de 1,5 a 2 GB por hora.' },
  { valor: 'leve', nome: 'Leve',
    indicacao: 'Bom para vídeos longos ou para mandar pelo WhatsApp.',
    contraindicacao: 'Menos indicado para quando a nitidez importa.',
    descricao: '720p, 30 quadros por segundo. Imagem um pouco menos nítida. Cerca de 0,8 a 1 GB por hora.' }
]);

// 2.0.1: de onde vem o som da gravação.
const FONTES_AUDIO = padrao([
  { valor: 'mic', nome: 'Só o microfone',
    indicacao: 'Bom para a sua voz: narração, aula, conto e depoimento.',
    contraindicacao: 'Menos indicado para gravar o que toca no computador, como um vídeo, uma música ou uma chamada.',
    descricao: 'Grava o microfone escolhido acima. É o jeito de sempre.' },
  { valor: 'pc', nome: 'Só o som do computador',
    indicacao: 'Bom para gravar um vídeo, uma aula, uma música ou uma chamada que toca no computador, sem a sua voz.',
    contraindicacao: 'Menos indicado quando você vai falar, porque o microfone não é gravado. O leitor de tela e os avisos do Windows que falarem durante a gravação entram no vídeo, e os bipes do programa ficam desligados enquanto grava.',
    descricao: 'Grava tudo o que sai nas caixas ou no fone do computador. Só funciona no Windows.' },
  { valor: 'ambos', nome: 'Microfone e som do computador',
    indicacao: 'Bom para comentar um vídeo ou uma música, e para gravar uma chamada ou uma aula com a sua voz.',
    contraindicacao: 'Menos indicado com caixas de som ligadas, porque o microfone capta o som delas e faz eco: use fone. O leitor de tela e os avisos do Windows que falarem durante a gravação entram no vídeo, e os bipes do programa ficam desligados enquanto grava.',
    descricao: 'Mistura o microfone e o que sai no computador numa gravação só. Só funciona no Windows.' }
]);

const USOS_DO_TEXTO = padrao([
  { valor: 'leitor', nome: 'Só no leitor de tela',
    indicacao: 'Bom para quem lê o roteiro só ouvindo e não quer texto no vídeo.',
    contraindicacao: 'Menos indicado para quem quer a frase escrita no vídeo.',
    descricao: 'A frase atual é falada pelo leitor de tela e aparece só nesta janela. Não entra no vídeo.' },
  { valor: 'legenda', nome: 'Mostrar na tela do vídeo, como legenda',
    indicacao: 'Bom para vídeo em que a frase lida deve aparecer escrita para quem assiste.',
    contraindicacao: 'Menos indicado para vídeo em que a imagem deve ficar limpa.',
    descricao: 'A frase atual fica escrita na parte de baixo do vídeo, em letras brancas sobre uma faixa escura, e muda quando você troca de frase.' }
]);

const EFEITOS = padrao([
  { valor: 'borrar', nome: 'Borrar o fundo', sufixo: 'fundo borrado',
    indicacao: 'Bom para quase todo vídeo, inclusive com movimento de mãos. É o mais natural e o que menos erra.',
    contraindicacao: 'Menos indicado para quando o ambiente não pode aparecer de jeito nenhum, porque ainda dá para perceber cores e formas.',
    descricao: 'Desfoca o que está atrás de você, como uma câmera profissional.' },
  { valor: 'substituir', nome: 'Substituir o fundo', sufixo: null,
    indicacao: 'Bom quando o ambiente está bagunçado ou quando a ideia é não mostrar o lugar da gravação. Funciona melhor com pouco movimento, boa luz e parede lisa atrás.',
    contraindicacao: 'Menos indicado com muito movimento de mãos, cabelo solto ou volumoso, ou roupa da cor da parede, porque as bordas podem tremer ou piscar.',
    descricao: 'Troca o que está atrás de você por uma das imagens de fundo do programa.' },
  // 1.3.1: só no caminho da gravação (o vídeo já vem dos ajustes de áudio).
  { valor: 'nenhum', nome: 'Fundo original', sufixo: null,
    indicacao: 'Bom quando o ambiente já está bom e você só quer os ajustes de áudio, o título e o logo.',
    contraindicacao: 'Menos indicado para ambiente bagunçado ou que não deve aparecer.',
    descricao: 'Mantém a imagem como foi gravada, sem mudar o que está atrás de você. O vídeo é salvo com os ajustes de áudio e, se você escolher, com o título e o logo.' }
]);

// O valor é o nome interno dos arquivos de fundo (escritorio-horizontal.jpg...).
const FUNDOS = [
  { valor: 'escritorio', nome: 'Escritório', sufixo: 'fundo escritório',
    descricao: 'Parede clara em tom bege, estante de madeira clara com livros e uma plantinha, luminária de chão acesa e janela com cortina branca, tudo levemente desfocado. Bom para conversas sérias ou informativas: explicações, orientações, notícias e divulgação de trabalho.' },
  { valor: 'praia', nome: 'Praia ao pôr do sol', sufixo: 'fundo praia',
    descricao: 'Mar calmo com reflexos dourados, céu laranja e rosa, sol baixo no horizonte, areia clara e um coqueiro desfocado num canto. Bom para vídeos leves e inspiradores: reflexões, mensagens de bem-estar e contos. Menos indicado para assuntos sérios ou técnicos.' },
  { valor: 'sala', nome: 'Sala de estar simples e aconchegante', sufixo: 'fundo sala de estar',
    descricao: 'Casa brasileira comum, sem luxo: sofá de tecido cor de terracota com manta de crochê e almofadas, mesinha de madeira com uma caneca, planta costela-de-adão, quadro abstrato e janela com cortina clara e luz de fim de tarde, tudo desfocado. Bom para conversas intimistas, desabafos, contos e vídeos de tom pessoal.' },
  { valor: 'carro', nome: 'Dentro de um carro popular com crochê', sufixo: 'fundo carro',
    descricao: 'Interior de um carro popular brasileiro antigo, visto do banco de trás: capas de crochê coloridas nos bancos, em quadradinhos mostarda, terracota, creme e verde-água, volante com capa de crochê, uma bonequinha de crochê e uma florzinha penduradas no retrovisor, painel cinza simples com rádio antigo e, pelo para-brisa, uma rua ensolarada com árvores, tudo levemente desfocado. Bom para vídeos irreverentes, bem-humorados e conversas descontraídas. Menos indicado para assuntos sérios.' },
  { valor: 'grafite', nome: 'Grafite com neon', sufixo: 'fundo grafite',
    descricao: 'Muro de rua à noite, pintado com grafite colorido de manchas e pinceladas em roxo, verde-água e laranja, sem letras nem desenhos de pessoas, com tubos de luz neon rosa e azul-claro fazendo curvas na parede e o chão de cimento escuro refletindo as cores, tudo levemente desfocado. Bom para vídeos jovens, urbanos e criativos: música, arte, cultura de rua, tecnologia e conversas descontraídas. Menos indicado para assuntos sérios ou formais.' },
  { valor: 'estudio', nome: 'Estúdio de gravação musical', sufixo: 'fundo estúdio',
    descricao: 'Sala de gravação com espuma acústica escura nas paredes, um microfone de estúdio com tela anti-sopro e fones de ouvido pendurados no pedestal, de um lado, e um violão e uma guitarra encostados na parede, do outro. Ao fundo, um teclado e uma janela de vidro que mostra a técnica, com a mesa de som cheia de botões e luzinhas coloridas. Luz quente e baixa, com um toque de azul na parede, tudo levemente desfocado. Bom para música, cantoria, poesia, podcast e vídeos sobre arte. Menos indicado para assuntos formais ou de negócios.' },
  { valor: 'cafe', nome: 'Café rústico com tijolos aparentes', sufixo: 'fundo café',
    descricao: 'Cafeteria tranquila e vazia, com paredes de tijolo aparente, mesinhas e cadeiras de madeira, xícaras de café sobre as mesas, lâmpadas antigas penduradas do teto e plantas. De um lado, um balcão de madeira com uma máquina de espresso prateada, e uma janela deixa entrar a luz amarela de fim de tarde, tudo levemente desfocado. Bom para conversas leves, bate-papo, contos e vídeos de tom pessoal e acolhedor. Menos indicado para assuntos sérios ou técnicos.' },
  { valor: 'jardim', nome: 'Banco no jardim com jasmim', sufixo: 'fundo jardim',
    descricao: 'Banco de madeira num jardim florido, sob um arco de madeira coberto por uma trepadeira de jasmim com florzinhas brancas em forma de estrela. Um passarinho pequeno está pousado no encosto do banco. Em volta há canteiros com flores cor-de-rosa e lilás, e ao fundo árvores na luz dourada e suave do fim do dia, tudo levemente desfocado. Bom para conversas intimistas e românticas, reflexões, mensagens de afeto e contos. Menos indicado para assuntos técnicos ou formais.' },
  { valor: 'indiano', nome: 'Cantinho indiano com mandala', sufixo: 'fundo indiano',
    descricao: 'Cantinho despojado de inspiração indiana, com uma grande tapeçaria de mandala em vinho e dourado na parede do fundo e um cordão de luzinhas quentes por cima. À esquerda, uma janelinha com cortina de tecido indiano estampado e um filtro dos sonhos de penas pendurado ao lado. À direita, um violão encostado na parede, vasos de plantas e uma planta pendente. No chão, tapetes e panos estampados sobrepostos, almofadas jogadas, uma almofada de chão, um pufe de tricô, uma pilha de livros com um aberto por cima, uma xícara de chá, cristais, pedrinhas e um incensário dourado soltando fumacinha, tudo na luz baixa e quente e levemente desfocado. Bom para conversas livres, contos, poesia, música e vídeos de tom pessoal, com uma vibe alternativa e espiritualizada. Menos indicado para assuntos formais ou de negócios.' },
  { valor: 'capela', nome: 'Capelinha ecumênica com vitral', sufixo: 'fundo capela',
    descricao: 'Pequena capela silenciosa de parede de pedra, com um arco de pedra pontudo emoldurando um vitral de formas geométricas nas cores dourado, azul, verde e vermelho, sem nenhum símbolo religioso. A luz que atravessa o vitral desenha manchas coloridas no chão claro. Dos dois lados há castiçais com velas brancas acesas, vasos com lírios e rosas brancas, painéis e bancos de madeira escura, tudo levemente desfocado. Bom para reflexões, mensagens de fé e esperança, homenagens, momentos de luto e de gratidão. Menos indicado para assuntos leves, divertidos ou de negócios.' },
  { valor: 'quarto-feminino', nome: 'Quarto rosa', sufixo: 'fundo quarto rosa',
    descricao: 'Quarto claro, em tons de rosa antigo e creme. Ao fundo, uma cama com colcha de renda e almofadas, e uma cabeceira com um cordão de luzinhas. Ao lado, uma janela com cortina de voal, um abajur aceso, flores num vaso e uma prateleira com livros e um porta-retrato, tudo na luz suave e levemente desfocado. Bom para conversas leves, desabafos, contos e vídeos de tom pessoal e afetivo.' },
  { valor: 'quarto-masculino', nome: 'Quarto sóbrio', sufixo: 'fundo quarto sóbrio',
    descricao: 'Quarto arrumado, em tons de cinza, azul-marinho e madeira. Ao fundo, uma cama com edredom liso e uma parede de painel de madeira. Ao lado, uma estante com livros e uma janela com persiana, tudo limpo, na luz quente e levemente desfocado. Bom para conversas, relatos, opiniões e vídeos de tom pessoal e direto.' },
  { valor: 'biblioteca', nome: 'Biblioteca', sufixo: 'fundo biblioteca',
    descricao: 'Canto tranquilo de biblioteca, com estantes altas de madeira escura cheias de livros de lombadas coloridas cobrindo a parede do fundo. À frente, uma mesa de madeira com uma pilha de livros e uma luminária de banqueiro com cúpula verde acesa, de luz dourada. De um lado, uma poltrona de couro marrom; do outro, uma janela alta com luz do dia e um vaso de planta. Luz quente e calma, tudo levemente desfocado. Bom para análises, debates, resenhas de livros e assuntos acadêmicos.' },
  { valor: 'sala-de-aula', nome: 'Sala de aula', sufixo: 'fundo sala de aula',
    descricao: 'Sala de aula vazia e clara, vista da posição do professor. Na parede do fundo, um quadro-negro verde com alguns riscos de giz apagados, sem palavras, um mapa-múndi colorido e um globo sobre uma estante baixa. Fileiras de carteiras de madeira clara com cadeiras, uma janela grande com luz do dia de um lado e um vaso de planta do outro, tudo levemente desfocado. Bom para explicações, tutoriais e conteúdos escolares, do ensino fundamental ao médio.' },
  { valor: 'estacao-espacial', nome: 'Estação espacial', sufixo: 'fundo estação espacial',
    descricao: 'Interior de uma estação espacial, com paredes de painéis brancos e cinza-claros, corrimãos e luzinhas azuis e verdes. No centro, atrás de você, uma grande janela redonda mostra o céu negro do espaço, cheio de estrelas, com uma nuvem suave roxa e azul, e embaixo a curva azul e branca da Terra brilhando. Luz fria e suave, levemente desfocado. Bom para vídeos criativos e divertidos, ficção científica, curiosidades sobre o espaço e conteúdo infantil. Menos indicado para assuntos sérios.' },
  { valor: 'ceu-estrelado', nome: 'Céu estrelado no campo', sufixo: 'fundo céu estrelado',
    descricao: 'Noite no campo, no interior de Minas Gerais. Ao fundo, montanhas em camadas, uma atrás da outra, como as serras de Minas, cada vez mais azuladas ao longe. De um lado, uma cerca de madeira, com uma fileira de mourões que vai sumindo na distância. No meio do campo, uma árvore sozinha, como um ipê. Na frente, capim baixo e florzinhas do mato, um pouco desfocados. O céu é azul-escuro e cheio de estrelas, com a Via Láctea atravessando na diagonal. Sem lua: só uma luz fraca e azulada sobre tudo. Sem pessoas e sem casas. Bom para leitura de contos, histórias para dormir, reflexões e conversas tranquilas.' },
  { valor: 'sala-dos-gatos', nome: 'Sala dos gatos', sufixo: 'fundo sala dos gatos',
    descricao: 'Sala de estar clara e alegre, de parede creme e chão de madeira clara. À esquerda, uma janela grande com cortinas brancas bem finas, de tule, deixando passar a luz do dia, e um vaso de planta. No chão, um tapete claro e almofadas soltas em rosa, verde e azul-claro, com pouca decoração. À direita, contra a parede do fundo, destaca-se um arranhador alto de três andares com quatro gatos: em cima, dois gatos deitados brincando juntos, um cinza listrado e um laranja, dando patadinhas um no outro; no andar do meio, um gato branco e cinza agachado, se preparando para pular; embaixo, um gato listrado lambendo a patinha, se limpando. O meio da sala fica livre, só com a parede lisa. Luz clara e aconchegante, tudo levemente desfocado. Bom para vídeos alegres e fofinhos, sobre pets e assuntos leves.' },
  { valor: 'anime', nome: 'Terraço de escola, estilo anime', sufixo: 'fundo anime',
    descricao: 'Cenário desenhado no estilo de anime, sem nenhum personagem: terraço de escola ao fim da tarde, com a grade de proteção embaixo, uma cidade ao longe com janelinhas acesas, fios de poste cruzando o céu, nuvens grandes com borda de luz dourada, raios de sol e pétalas de cerejeira caindo no ar. O céu vai do azul forte ao rosa e ao dourado, tudo levemente desfocado. Bom para vídeos jovens e criativos, de cultura pop: animes, mangás, jogos, música, histórias e conversas descontraídas. Menos indicado para assuntos formais ou de negócios.' },
  { valor: 'carro-masculino', nome: 'Carro executivo', sufixo: 'fundo carro executivo',
    descricao: 'Banco do motorista de um carro de interior escuro, com volante de couro e painel discreto. Pelo para-brisa e pelas janelas, uma rua arborizada desfocada, na luz do fim de tarde. Bom para vídeos "a caminho", desabafos rápidos e conversas informais.' }
];

// 1.1: ordem por categorias internas (o usuário não vê as categorias, só a ordem).
// Cada fundo é lido assim: nome, depois para que serve (aplicação), depois a descrição da imagem.
const CATEGORIAS_FUNDOS = [
  ['profissionais', ['escritorio', 'estudio', 'biblioteca', 'sala-de-aula']],
  ['estilo', ['indiano', 'grafite', 'capela', 'carro', 'carro-masculino', 'estacao-espacial', 'anime']],
  ['domesticos', ['quarto-feminino', 'quarto-masculino', 'sala', 'sala-dos-gatos']],
  ['externos', ['jardim', 'praia', 'ceu-estrelado']],
  ['outros', ['cafe']]
];
// 2.0: os fundos que só diziam para que servem agora dizem também quando evitar.
const CONTRA_FUNDOS = {
  escritorio: 'Menos indicado para vídeos descontraídos, infantis, de poesia ou de tom muito pessoal.',
  biblioteca: 'Menos indicado para vídeos leves, infantis ou de humor.',
  'sala-de-aula': 'Menos indicado para assuntos de adulto, vídeos de tom pessoal ou conteúdo de negócios.',
  'carro-masculino': 'Menos indicado para assuntos sérios, formais ou que pedem calma e atenção.',
  'quarto-feminino': 'Menos indicado para assuntos formais, técnicos ou de negócios.',
  'quarto-masculino': 'Menos indicado para vídeos alegres, infantis ou de festa.',
  sala: 'Menos indicado para assuntos técnicos, formais ou de negócios.',
  'sala-dos-gatos': 'Menos indicado para assuntos sérios, luto ou conteúdo técnico.',
  'ceu-estrelado': 'Menos indicado para assuntos técnicos, formais ou de humor.'
};
{
  const ordem = CATEGORIAS_FUNDOS.flatMap(([cat, vs]) => vs.map((v) => [v, cat]));
  const porValor = Object.fromEntries(FUNDOS.map((f) => [f.valor, f]));
  const novos = ordem.map(([v, cat]) => {
    const f = porValor[v];
    const i = f.descricao.indexOf('Bom para');
    const aplicacao = i >= 0 ? f.descricao.slice(i).trim() : '';
    const cena = i >= 0 ? f.descricao.slice(0, i).trim() : f.descricao;
    const j = aplicacao.indexOf('Menos indicado');
    const indicacao = j >= 0 ? aplicacao.slice(0, j).trim() : aplicacao;
    const contraindicacao = j >= 0 ? aplicacao.slice(j).trim() : (CONTRA_FUNDOS[v] || '');
    const aplicacaoCompleta = [indicacao, contraindicacao].filter(Boolean).join(' ');
    return { ...f, categoria: cat, aplicacao: aplicacaoCompleta, indicacao, contraindicacao, cena,
      descricao: descricaoPadrao({ indicacao, contraindicacao, descricao: cena }) };
  });
  FUNDOS.splice(0, FUNDOS.length, ...novos);
}

const acharPor = (lista, valor) => lista.find((x) => x.valor === valor) || null;

const ESPELHO = {
  nome: 'Minha câmera espelha a imagem',
  descricao: 'Marque se a sua câmera mostra a imagem como um espelho, como a maioria das câmeras de computador. Assim o Alt E acerta os lados quando diz para ir para a sua direita ou para a sua esquerda, ou que um braço saiu cortado de um dos lados. Vem marcado. Se o Alt E trocar os lados, desmarque.'
};

module.exports = { ESPELHO, PROPORCOES, QUALIDADES, FONTES_AUDIO, USOS_DO_TEXTO, EFEITOS, FUNDOS, acharPor };
