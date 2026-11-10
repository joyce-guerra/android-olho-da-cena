
## Foto da câmera durante a gravação (pedido da Joy)

Na tela Gravar, poder tirar só uma foto do que a câmera está mostrando, como está na tela. Não é captura de tela: é uma foto da câmera, como na tela Tirar fotos.

Para que serve:
- tirar uma foto do vídeo que está sendo gravado, sem parar a gravação;
- mostrar a imagem para alguém (por exemplo, para a Claude descrever), sem precisar de print.

Onde fica e como se chama:
- na pasta Fotos, dentro de uma subpasta chamada "fotos de vídeo";
- o nome do arquivo é a última descrição da câmera (a mais recente fala do Alt Q ou do Alt E).

Pontos a combinar antes de fazer:
- qual atalho (Alt F, Alt T e Alt P já têm uso no Gravar);
- um bipe curto para confirmar, que não entre no vídeo quando o som do computador está sendo gravado;
- o que fazer se ainda não houve descrição (nome padrão, por exemplo "Foto de vídeo" mais um número);
- se a foto sai na resolução da câmera ou no recorte da proporção escolhida.

## Anotado na 3.0

- A árvore de detalhes que abre separado (tom, indicação, descrição, contraindicação) existe só nas figurinhas. Se funcionar bem nos testes, levar para as molduras e os fundos.
- Legenda do post: hoje o Gemma escreve em segundo plano e guarda legenda.txt. Sem o descritor instalado, a pasta recebe um rascunho com o texto do post. Ideia: pedir mais de uma versão (curta, para o Threads, e longa).
- Cores do texto do post: hoje só escuro sobre fundo claro e branco sobre fundo escuro. Ideia: cor de destaque por moldura, como dourado sobre o azul marinho.
- Kit de datas: as molduras de data usam margens próprias para fugir dos enfeites. Se alguma ainda atrapalhar a leitura, ajustar em POST_EXTRA, em src/fotos.js.
- Stories em sequência: o limite de 20 slides é o do carrossel. Se o Instagram publicar outro número para stories, ajustar em FORMATOS_POST.
- Foto da câmera dentro do Gravar, salva em Fotos, com o nome da última descrição (ideia anterior, ainda aberta).

## 3.0.1 (versão-ponte): o que entra
- Posts em vídeo no Criar post: Reel, Vídeo de feed e Stories em vídeo, em Posts\Vídeos. Posts de imagem vão para Posts\Imagens.
- Figurinhas corrigidas: mimic, coelho com pescoço, ursinhos, morangos, alaúde com cordas, dino, gato, raposa, dançarina, viajante.
- Tela Sobre e licença (Alt S na tela inicial), arquivo LICENSE, package.json com CC-BY-NC-ND-4.0, página de licença no instalador.
- Instalador assistido (oneClick false), por usuário, com a licença. Quem atualiza da 3.0.0 vê o assistente em vez da instalação direta.
- Atualização leve: helper\trocar-asar.js e helper\base-runtime.json em resources. Esta versão ensina o programa a receber app.asar sozinho nas próximas.

## Roteiro de teste no Windows, que não dá para rodar fora dele
1. Instalar a 3.0.1 por cima da 3.0.0. Conferir a página de licença, a leitura pelo NVDA e que projetos e configurações ficaram.
2. Conferir que existem resources\helper\trocar-asar.js e resources\helper\base-runtime.json na pasta de instalação.
3. Com a 3.0.1 instalada, publicar num servidor de teste uma versão maior com o trecho leve, gerada por: node empacotar-entrega.js --leve --minima 3.0.1
4. Abrir o programa, aceitar a atualização rápida, confirmar o botão Fechar e abrir a versão nova. Conferir o Sobre.
5. Repetir com o app.asar do servidor corrompido, com antivírus segurando o arquivo e com a rede cortada. A instalação anterior precisa continuar abrindo.
6. Mudar baseRuntime no helper e conferir que o programa passa a oferecer o setup completo.
Sempre que mudar Electron, FFmpeg, DLLs, módulos nativos ou o helper, mude também helper\base-runtime.json.

## 3.0.2: o que entra em cima da 3.0.1
- Posts em vídeo remodelados: etapa do vídeo só com Gravar, Sugerir e Escolher; gravação sem beep e com a orientação só do formato; depois de gravar, Descartar e gravar outro, Salvar e continuar, Ir direto para o post e Voltar; telas de áudio do Gravar vídeo, sem equalização e sem fundo, com Ir para o post em cada uma; a análise do tempo na finalização; finalização numa tela só, com cartões, legenda, ajuste e nome.
- O plano das telas de áudio, com cortes, silêncios e trilha, é aplicado pela preparação do post, numa passada só.
- Molduras: São João, Casamento e Ano Novo. Categorias Datas comemorativas e Festas, e Comemorações dentro de Minhas vibes. O kit saiu.
- Cartões com sete cores vivas.
- Descrições: Espaço abre um textinho nas listas em árvore; as demais listas voltaram a ser botões de rádio simples.
- Alt E no Gravar vídeo diz também a cor do cabelo e da roupa.
- A figurinha da capa já vem escolhida nos slides do post.
- Sobre e licença, instalador assistido, atualização leve.

## 3.0.3: o que entra em cima da 3.0.2
- Tipo de salvamento: Universal (Áudios, Vídeos, Imagens, Extras) ou Avançado (uma pasta por função, com Áudios, Vídeos e Extras dentro). Ver ideias/duvidas-pendentes.md.
- Editar áudio e Editar vídeo salvam na pasta do programa, e não ao lado do original.
- Transcrições, descrições e legendas em texto vão para a pasta Extras da função.
- A renomeação de Áudios para Áudios de vídeos foi retirada.
- Montar vídeo: Títulos em outros momentos com player, teclas universais e Marcar aqui, Alt M. Salvar e continuar na etapa 1 já monta o áudio, e o botão Montar o áudio final saiu.
- Fundo do vídeo: molduras com cenário entram na lista de fundos, nas mesmas seções do Tirar fotos.
- Etapas de áudio: foco num botão, segurar Page Up e Page Down anda salto após salto, filtro de graves em 200 Hz.
- Posts: a contagem de caracteres ignora os sinais de formatação. As falas do tipo de post não repetem a escolha da proporção. Os botões de descrição dizem se usam o Gemma.
- Gemma: ao pedir uma descrição sem ele instalado, o programa oferece baixar na hora. O botão do Tirar fotos diz Gemma.
- Conversão em lote: aviso final com a pasta certa.

## 3.0.4: o que entra em cima da 3.0.3
- Tirar fotos: formato Capa de ebook, 5 por 8, sempre 1600 por 2560, sem corte. Tipo de escrito Capa, com título e nome, só nesse formato. Arquivo "Capa - título.jpg".
- Botão Copiar descrição, Alt C, copia a última descrição do Alt Q.
- As pastas do tipo de salvamento escolhido são criadas logo ao escolher o tipo, e ao abrir o programa. Antes só nasciam no primeiro arquivo salvo.
- Editar fotos: o menu Fotos agora tem Tirar e Editar. Escolhe-se uma pasta, o programa faz a triagem segura e diz o motivo das descartadas. As aprovadas são marcadas, uma ação por vez, e salvas com Alt S saindo da lista.
- Detalhes das listas em árvore lidos item a item, com as setas, em vez de uma nota só.
- Tela de escrita da foto: só Sim ou Não, e o Sim deixa o Tab chegar aos tipos.
- Baú monstro sem dentes e sem língua.

## Correção que entra na 3.0.4 (a 3.0.4 anterior não foi publicada, e a referência no servidor é a 3.0.3)
- Editar fotos: a janela principal agora é de escolher fotos, com o filtro de imagens e várias de uma vez, Control A para todas. A janela de pasta inteira virou segundo botão. A janela do Windows para pastas só mostra pastas, e por isso parecia vazia.
- Pasta sem imagem que o programa abre: a fala diz o que viu e o que fazer. Aceita também JFIF, GIF e AVIF.
- Editar fotos: limite de 200 fotos por vez, com aviso de como escolher só as que a pessoa quer. A foto inteira só fica na memória enquanto é composta, para aguentar muitas fotos.
