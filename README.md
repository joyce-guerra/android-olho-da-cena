# Olho da Cena

Junta o Gerador de Vídeo 2.0.3 e o Gravador de Vídeo (teste) 0.3 num programa só.
Tela inicial: Gravar (Alt R), Montar (Alt G), Editar (Alt C), Juntar (Alt J) e Dividir (Alt D).
Tudo o que o programa cria vai para Documentos\Olho da Cena. Guia completo para quem usa:
"Olho da Cena - Como usar.docx".

- `npm start`: abre o programa.
- `npm test`: testes de unidade.
- `npm run e2e`: testes de ponta a ponta (Playwright + Xvfb + xdotool, câmera e microfone falsos).
- `test/instalador-wine.sh`: instala Gerador 2.0.3 + Gravador 0.3 no Wine e o Olho da Cena por cima.
- `npm run dist:win`: gera `dist/Olho-da-Cena-Setup-1.0.0.exe`.

O texto abaixo é do Gerador de Vídeo (a parte Montar, que continua igual).

## Gerador de Vídeo

Pega um áudio e um punhado de imagens e devolve um MP4 pronto pra subir, com
movimento e transições aplicados automaticamente.

## Pré-requisitos

Só para rodar a partir do código. A versão portátil (mais abaixo) não precisa de
nada disso.

- Node.js 18 ou mais novo
- FFmpeg instalado e acessível no PATH (precisa do `ffmpeg` **e** do `ffprobe`)

No Windows, o jeito mais rápido:

```
winget install Gyan.FFmpeg
```

Depois feche e reabra o terminal e confira:

```
ffmpeg -version
ffprobe -version
```

Se os dois responderem, está pronto. O app avisa logo na abertura se não achar.

## Instalar e rodar

```
cd gerador-video
npm install
npm start
```

## Como usar

Na tela inicial, escolha "Montar vídeo". A tela tem quatro etapas, uma depois da
outra. No topo há botões para pular direto para qualquer uma, e cada etapa
termina com "Salvar e continuar" e "Voltar para a etapa anterior". Também dá para
pular com `Ctrl+1` (Áudio), `Ctrl+2` (Imagens), `Ctrl+3` (Extras) e `Ctrl+4`
(Ajustes finais), até com o cursor dentro de um campo de texto.

1. **Áudio.** Escolher um ou vários áudios. Eles tocam na ordem da lista, que
   dá para reordenar e remover. Cada áudio pode ficar em velocidade normal,
   1,25x, 1,5x ou 2x, e dá para ouvir uma prévia de 6 segundos antes de decidir.
   A lista mostra a duração de cada um em minutos e o total. Ao salvar e
   continuar, o programa junta tudo sozinho. Depois vem o corte de silêncios
   (com a opção de suavizar as emendas com um fade rápido) e as trilhas de
   fundo (veja [Trilhas de fundo](#trilhas-de-fundo)). Só adicione trilhas
   quando terminar de editar os áudios.
2. **Imagens.** Primeiro a orientação do vídeo, horizontal ou vertical: é
   a partir dela que o programa avisa se uma imagem não combina. Depois o
   título do começo (até 50 caracteres no horizontal e 40 no vertical), o
   modo de distribuição, as imagens e, no fim do bloco, a legenda
   (opcional). Cada imagem adicionada é descrita em voz alta com a orientação e a proporção. Se você
   trocar a orientação depois, o programa diz quantas imagens deixaram de
   combinar.
   - **Movimento das imagens longas.** É automático, sem nada para marcar.
     Quando uma imagem fica muito tempo na tela, ela renova o movimento a cada
     30 a 90 segundos (o intervalo vem do ritmo do preset): a mesma imagem
     aproxima, afasta e muda de lado, sem corte. Não vale nos presets que
     juntam as imagens com passagem entre elas, como Literário e Novelinhas.
   - **Imagens que não combinam com o formato.** O programa resolve sozinho:
     preenche o que sobra com um fundo desfocado da própria imagem, no clima do
     preset (mais escuro no Canal dark, mais vivo na Animação). Se a imagem for
     pequena demais, o zoom diminui sozinho para não perder nitidez.
   - **Sem imagens.** Marque essa opção se quiser só o áudio. O vídeo vira uma
     tela preta com o título do vídeo em creme, e o título passa a ser
     obrigatório.
3. **Extras.** Títulos em outros momentos, logo e texto de encerramento.
   - **Logo.** Escolha a imagem e o jeito de aparecer; o programa decide o
     resto. Há dois jeitos, e nenhum cobre as suas imagens:
     - *Junto de cada título:* o logo aparece logo acima do texto, a cada vez
       que um título entra, com o mesmo fade, e some com ele. Se você mudar o
       título, o logo continua. Exige que o vídeo tenha ao menos um título; sem
       imagens, o logo fica acima do título parado.
     - *Na faixa do topo:* o programa reserva uma faixa fina no alto do vídeo
       (cerca de 9% da altura) e encaixa as imagens no espaço que sobra. O logo
       fica na faixa o tempo todo ou só num trecho (digite os tempos, ou toque o
       áudio e use "Marcar o início aqui" e "Marcar o fim aqui"). A faixa existe
       no vídeo inteiro. A cor dela é escolhida para o logo aparecer bem: a
       mesma cor do fundo do logo, se ele tiver fundo liso; clara para logo
       escuro; escura para logo claro. A faixa comporta um logo por vez.
     O programa também tira o fundo liso do logo, põe uma sombra suave no logo
     do título e calcula o tamanho pela forma da imagem. Até 6 logos, misturando
     os dois jeitos. Se você cortar silêncios depois, os tempos dos logos da
     faixa são ajustados junto com os dos títulos.
4. **Ajustes finais.** Atmosfera, qualidade e o botão "Montar vídeo". O programa
   pergunta onde salvar e começa.

Trilhas estáticas, que tocam uma vez, têm as caixas "Fade de entrada" e "Fade de
saída", marcadas por padrão, para não entrarem nem saírem secas.

Teclas de atalho: `Alt+A` áudio, `Alt+I` imagens, `Alt+G` gerar.

## Os dois modos

**Em looping** — cada imagem fica um tempo fixo na tela (definido pelo preset) e
o ciclo recomeça até o áudio terminar. Dez imagens num áudio de 30 minutos com o
preset dark dá 150 trocas, ou seja, o ciclo roda 15 vezes.

**Uma de cada vez** — o tempo do áudio é dividido igualmente entre as imagens,
cada uma aparece uma vez só. Dez imagens em 4 minutos dá 24 segundos cada; as
mesmas dez em 30 minutos dá 3 minutos cada.

Nos dois casos o vídeo termina exatamente junto com o áudio.

## As dez atmosferas

| Preset | Tempo por imagem | Movimento | Transição |
|---|---|---|---|
| Clipe musical | 5s | zoom marcado, 18%, alternando de lado | corte seco |
| Balada | 8s | zoom suave, 12%, deriva contínua | dissolução de 0,6s, cor quente |
| Canal dark | 12s | aproximação lenta, 10% | fade de 1,2s, cor dessaturada e vinheta |
| Tensão | 6s | zoom fechado, 16%, quase parado | corte de 0,4s, cor fria e vinheta mais forte |
| Animação | 5s | zoom e câmera alternando com energia | corte de 0,3s, cor viva e saturada |
| Literário | 10s | quase parado | passagem de página de 0,8s, cor quente e desbotada |
| Estático suave | 20s | quase imperceptível, 4% | fade de 2s |
| Família | 7s | zoom suave, 10%, alternando de lado | dissolução de 1s, cor quente e clara |
| Educativo | 15s | quase parado, 3% | transição curta de 0,5s, cor neutra |
| Novelinhas | 6s | zoom forte, 22%, deslizando de lado | imagem que desliza, 0,5s, cor quente e viva |

**Balada** é pra música mais lenta, voz e violão: fica entre o clipe musical e o
estático suave, com a câmera em deriva contínua em vez de alternar de lado a
cada imagem, e a cor puxando pro quente.

**Tensão** é mais rápido que o canal dark, com o zoom mais fechado e quase
claustrofóbico, a cor mais fria e dessaturada, e a vinheta mais forte — pensado
pra criar inquietação, não pra embalar. (Se você quer esse clima só a partir de
um ponto específico do vídeo, em vez do vídeo inteiro, veja "Troca de preset
por título", mais abaixo — é pra isso que ela existe.)

**Animação** é pra vídeo de brincadeira, conteúdo infantil ou engraçadinho: cor
viva e saturada, zoom e câmera alternando com energia alegre, corte rápido.

**Literário** troca o corte ou o fade pelo preto por uma passagem de página de
verdade: por um instante, a imagem que está saindo e a que está entrando
aparecem juntas, como se uma folha estivesse virando por cima da outra. A
câmera quase não se mexe, e a cor é quente e um pouco desbotada, como papel
encorpado. Funciona melhor com imagens que já parecem ilustração de livro ou
gravura — traço desenhado em vez de foto realista, fundo mais liso, tom
amarelado ou acastanhado, pouca coisa disputando o centro da composição — do
que com fotografia comum. Pensado pra conto.

**Família** é pra viagem, aniversário e festa: cada imagem fica bastante tempo,
com movimento suave, dissolução de um segundo e cor quente e clara, sem vinheta.

**Educativo** é pra estudo, aula e tutorial, no estilo de slide, com mais texto
que imagem. A imagem fica quase parada por bastante tempo e o título vem em
amarelo sobre azul escuro, em fonte bem legível: cores que chamam a atenção e
ajudam no foco.

**Novelinhas** é pra novelinha, historinha inventada e personagem de RPG. É o
mais animado: zoom forte, câmera de um lado pro outro, a imagem desliza pra dar
lugar à próxima, cor quente com contraste alto e título grande e pesado. Para
momentos tristes ou contemplativos, os outros presets servem melhor.

O logo do título também segue o clima de cada preset: força da sombra, velocidade
do fade e tamanho mudam de um para o outro.

Por causa da passagem de página, o Literário e o Novelinhas têm uma limitação
própria: hoje eles não funcionam junto com a troca de preset por título (a
seguir), nem com a renovação de movimento. Use um dos
outros presets como base se quiser trocar de atmosfera no meio do vídeo.

## Formato e qualidade

**Formato** — horizontal (1920x1080) pro vídeo normal do YouTube, ou vertical
(1080x1920) pra Shorts, Reels e TikTok. É só trocar no menu; a normalização das
imagens se ajusta sozinha, o que importa bastante no vertical, onde quase toda
imagem comum vai sobrar borda dos dois lados.

**Qualidade** — muda a resolução em que o movimento é calculado, e é o que mais
pesa no tempo de render.

| | Resolução de trabalho | Tempo |
|---|---|---|
| Rápida | 1,5x o formato final | referência |
| Normal | 2x o formato final | perto do dobro |

Na prática a "Rápida" resolve: como o zoom máximo é de 18%, 1,5x já cobre com
folga e a diferença de nitidez é quase invisível. A "Normal" existe pra quem
quer margem extra e não se importa de esperar.

## Como os efeitos se ajustam ao tempo

Os presets não guardam velocidade de movimento, guardam **quantidade**. O zoom é
escrito em função do número de quadros do próprio segmento, então ele sempre
completa exatamente quando a imagem sai da tela. Um segmento de 24 segundos e um
de 3 minutos aplicam a mesma aproximação — só que um devagar e o outro bem
devagar. É o que faz o mesmo conjunto de imagens funcionar em áudio curto e
longo sem você mexer em nada.

## Títulos

Texto opcional por cima da imagem, em quantos pontos do vídeo você quiser. É uma
camada independente da linha do tempo: um título no meio do áudio não
interrompe nem desloca o ciclo das imagens, e não muda a duração do vídeo.

O tempo é sempre `hora:minuto:segundo`, contado do começo do vídeo. Formas
curtas valem — `3:20` é minuto e segundo, e o campo se completa sozinho quando
você sai dele, pra conferir ouvindo.

O texto de encerramento aparece por cima da última imagem, enquanto ela
escurece. Se quiser que ele respire, deixe um segundo de silêncio no fim do
áudio — o programa não alonga o vídeo por conta própria.

### Troca de preset por título

O vídeo inteiro usa um preset só, a não ser que você marque uma troca. Ao
adicionar um título, tem um campo opcional "a partir deste título, trocar de
preset": deixando em "não trocar", o título aparece normalmente e a atmosfera
continua a mesma de antes; escolhendo um preset ali, a partir do instante
exato daquele título o vídeo passa a usar a aparência do preset escolhido —
zoom, movimento, cor, vinheta e até a fonte e o estilo do texto — até o
próximo título que trocar de novo, ou até o fim do vídeo.

A troca acontece no instante marcado, não na próxima imagem: se o título cai
no meio do tempo em que uma imagem já está na tela, aquela mesma imagem
continua ali, só que a atmosfera embaixo dela muda — é o que resolve, por
exemplo, aplicar o clima do preset Tensão só a partir do momento de virada de
um conto, em vez do vídeo inteiro.

Dois detalhes de como isso funciona por baixo:

- **O ritmo de corte (modo looping) não muda.** Trocar de preset troca a
  aparência; o tempo que cada imagem fica na tela continua sendo o do preset
  escolhido pra pasta inteira. Pra um trecho mais rápido ou mais lento de
  verdade, use o modo "distribuir" ou o modo manual, que não dependem do tempo
  por imagem de nenhum preset.
- **O FPS do vídeo é sempre o do preset principal.** Se você trocar para um
  preset com outro FPS, ele continua com sua própria cor, zoom e fonte, mas
  roda no FPS do preset que você escolheu lá em cima — senão a emenda dos
  pedaços quebraria.

Não dá pra combinar com o preset Literário (veja "As dez atmosferas"), porque
a passagem de página dele precisa de um jeito de juntar os pedaços que ainda
não conversa com a troca de preset.

### Limites de caractere

|  | Horizontal | Vertical |
|---|---|---|
| Título | 50 | 40 |
| Encerramento | 30 | 24 |

Não são chute: foram medidos renderizando texto de verdade e conferindo a
largura em pixels no pior caso (fonte com serifa em negrito, formato vertical).
No vertical cabe menos porque a tela tem metade da largura. O contador na tela
acompanha o formato escolhido.

### Legibilidade

Texto branco sobre imagem clara some, e esse é um defeito que o autor do vídeo
não tem como perceber sozinho. Por isso o piso é fixo e não muda nunca: caixa
escura atrás do texto, texto branco, contorno fino, margem de segurança.

O que varia por preset, acima desse piso: a fonte (Arial no clipe, Georgia no
dark, Segoe UI no estático), a opacidade e a folga da caixa, a altura na tela, a
velocidade de entrada e o tempo que o texto fica. A identidade mora aí, e
nenhuma dessas escolhas pode tornar o texto ilegível.

### O que o programa confere e te conta

Impedem de gerar: texto acima do limite, tempo em formato inválido, título
marcado depois do fim do áudio, e dois textos que ficariam na tela ao mesmo
tempo sem folga pra encurtar.

Avisam, mas deixam seguir: em quantas linhas o texto ficou e como foi quebrado,
título que o áudio corta antes do fim, e texto encurtado automaticamente pra não
se sobrepor ao seguinte.

## Abertura e encerramento

Independente do preset, a primeira imagem nasce do preto num fade de 1,2s e a
última morre nele em 2,5s. Vale até no "Clipe musical", onde as trocas do meio
são corte seco — é o que dá a sensação de vídeo que começa e termina, em vez de
trecho recortado.

O áudio acompanha: entrada curta de 0,4s, que evita o estalo do começo, e saída
de até 3s no fim, casada com o escurecimento da imagem.

## Como as imagens ficam todas iguais

Antes de qualquer coisa, cada imagem é convertida pra 3840x2160. A original
entra inteira, centrada e sem distorção; o que sobraria de borda é preenchido
com uma cópia ampliada e desfocada da própria imagem, escurecida. Foto em pé,
print quadrado, wallpaper deitado — tudo sai com o mesmo enquadramento e nada
fica esticado.

O trabalho é feito no dobro da resolução final (1920x1080) pra sobrar pixel de
verdade quando o zoom aproxima. Cada imagem é normalizada uma vez só, mesmo que
apareça 15 vezes no modo looping.

## Juntar vídeos

Emenda vídeos prontos num só, na ordem da lista, sem reeditar o conteúdo de
nenhum deles. Serve pra montar uma coisa só a partir de partes: sequências de
foto com trilha geradas aqui, clipes filmados no celular, trechos com
audiodescrição.

Cada vídeo pode ter um título próprio, que aparece no começo dele. O
encerramento é um só, no fim de tudo. O primeiro trecho nasce do preto, o último
morre nele, e entre um e outro há uma passagem escura curta.

### O relatório antes de juntar

Vídeo de fontes diferentes traz defeitos que o autor não tem como perceber
sozinho. O botão "Conferir os vídeos" analisa cada arquivo e diz o que vai
acontecer:

- trecho com proporção diferente da escolhida, e de que lado vão as faixas pretas
- trecho sem faixa de áudio, que vai ficar em silêncio
- trecho gravado girado, que vai ser endireitado
- texto de título que quebrou em mais de uma linha

Arquivo que não é vídeo vira erro e precisa ser removido da lista. O resto é
informação: a decisão é de quem está montando.

Trecho sem áudio ganha uma faixa de silêncio na saída. Sem isso, a emenda
desencaixaria o som de tudo que vem depois.

### Nivelamento de volume

Um clipe de celular costuma vir bem mais baixo que uma trilha, e emendado isso
vira um vídeo que alterna entre alto e baixo. A opção fica ligada por padrão.

O alvo não vem de fora: é a mediana dos próprios trechos. A ideia é fazê-los
combinar entre si, não impor um volume de referência. Quem já está a menos de 2
decibéis do alvo não é tocado — mexer seria fuçar sem motivo.

Estourar não acontece por sorte. A medição devolve o pico real de cada arquivo,
e o ganho é limitado por ele de forma que nada passe de −1,5 dBTP. Quando esse
limite impede o ajuste completo, o programa diz em vez de fazer calado: "levantei
7,5 decibéis em vez dos 9,5 necessários, para não estourar". Um limitador entra
depois como rede de segurança.

O que pode piorar: aumento muito grande sobe o chiado junto com a voz, e o
trecho fica chapado. Não é distorção, é falta de respiro. Acima de 8 decibéis de
aumento, o programa avisa.

Custa uma passada de leitura por arquivo antes de gerar, então demora um pouco
mais. Desligue a opção se a trilha já vier masterizada — aí nivelar tende a
piorar.

### Trilhas de fundo

Disponível tanto em "Montar vídeo" quanto em "Juntar vídeos". Funciona como a
lista de títulos: você escolhe um arquivo, ajusta o tipo e o volume, e clica
em "Adicionar trilha". Pode adicionar quantas quiser, misturando os dois
tipos, cada uma com seu próprio volume.

- **Em loop** — entra por baixo do áudio principal (ou do som dos vídeos, em
  Juntar) e dá quantas voltas forem precisas até cobrir tudo. Quem manda no
  tamanho é o vídeo: a trilha é cortada no fim, com fade de entrada e de
  saída. Serve de fundo musical contínuo, ou de paisagem sonora (fogueira,
  pássaros pela manhã) que toca o vídeo inteiro.

- **Estática** — começa a partir de um tempo marcado (hora, minuto e
  segundo, do mesmo jeito que os títulos), e a partir daí tem duas opções:

  - **Toca uma vez só** — vai do início ao fim do arquivo e para. Serve para
    um som pontual, um efeito sonoro que marca um momento específico.
  - **Repete em loop até o fim do vídeo** — a partir do tempo marcado, fica
    dando voltas (com a mesma costura sem estalo do tipo em loop) até o
    vídeo acabar. Serve para uma ambientação que só deve começar num certo
    momento, em vez de tocar desde o início do vídeo.

  Em "Montar vídeo", ao marcar o tempo de uma trilha estática aparece um
  tocador do próprio áudio principal (a narração): tocar ou pausar, voltar e
  avançar 5 segundos, e marcar este ponto — que já fala e escreve o tempo no
  campo, num botão só —, pra achar o instante certo ouvindo em vez de ter
  que digitar um palpite. Em "Juntar vídeos" não tem esse tocador porque ali
  não existe um áudio único: o tempo é contado a partir do começo da emenda de
  todos os vídeos, então o jeito de achar o instante é ouvir pelo tocador da
  tela de cortar, ou abrindo um dos vídeos por fora.

  Se o tempo marcado for depois do fim do vídeo, o programa avisa e não gera
  — esse é exatamente o tipo de engano que não dá pra perceber sem ouvir o
  resultado inteiro, então ele impede em vez de deixar passar calado. Numa
  trilha que toca uma vez só, se o som for mais longo do que o tempo
  restante, ele é cortado no fim do vídeo, e isso é dito antes de gerar.

Volume em quatro opções nomeadas, de 6 a 30 por cento, com 10 por cento como
padrão — escolhido por trilha, não um valor único para todas. Por baixo de
fala, quanto mais baixa melhor — trilha alta engole a voz, e isso não dá pra
conferir sem ouvir o resultado inteiro.

**Por que a emenda de uma trilha em loop não estala.** Arquivo MP3 ou AAC
carrega um pedaço de silêncio no começo e no fim, criado pelo próprio
compressor. Repetido, isso vira um tique a cada volta. A trilha é convertida
para áudio sem compressão antes de qualquer coisa.

Depois, o fim dela é costurado por baixo do próprio começo: os últimos
segundos diminuem enquanto os primeiros crescem, e os dois somam. O arquivo
resultante já é um ciclo fechado, e daí em diante basta repetir. Isso vale
para o tipo em loop e para a trilha estática que repete até o fim — uma
estática que toca uma vez só não precisa de costura nenhuma.

**O que continua sendo escolha sua.** Se a música não foi composta para dar a
volta, o fim dela não conduz de volta ao começo — a emenda está certa, a
música é que não fecha o ciclo. Trilha ambiente sem batida marcada costuma
funcionar; música com batida tende a desalinhar o ritmo na virada. O YouTube
tem um acervo grande de trilhas livres feitas justamente para isso.

**Quando duas trilhas contínuas se encontram.** Uma trilha contínua é a que
toca até o fim do vídeo por conta própria — em loop, ou estática marcada
pra repetir. Se você já tem uma trilha contínua na lista e adiciona outra,
o programa pergunta o que fazer com a anterior, porque as duas tocariam
juntas do jeito que vier:

- **Encerrar a anterior aqui** — ela desce com um fade curto bem no
  instante em que a nova entra, como passar o bastão: uma trilha de
  suspense que toca sem parar, até ceder lugar pra uma trilha mais calma a
  partir de um certo ponto, por exemplo.
- **Deixar as duas tocando** — a anterior continua do jeito que já toca, e
  as duas terminam juntas no mesmo fade final, no fim do vídeo.

Isso só vale entre trilhas contínuas. Uma trilha que toca uma vez só nunca
entra nessa pergunta, porque ela é rápida e já funciona naturalmente
sobreposta a qualquer outra.

## Modo manual (marcar imagens ouvindo o áudio)

Terceira forma de distribuir as imagens, ao lado de looping e uma de cada vez.
Em vez de o programa calcular quando cada imagem aparece, você ouve o áudio e
marca o instante certo — útil para casar uma imagem com o momento exato de um
conto que ela ilustra.

O áudio toca dentro do programa, com os mesmos princípios da tela de cortar:
botões em vez de controles nativos, e Alt H lista os atalhos. No instante
certo, "Adicionar imagem aqui" pausa e pede qual imagem entra ali. A ordem final
é sempre pela marca de tempo, não pela ordem em que você adicionou.

A primeira imagem precisa estar marcada em `00:00:00` — sem isso o vídeo
começaria sem nenhuma imagem na tela, e o programa recusa gerar até isso ser
corrigido.

O efeito do preset escolhido (zoom, deslocamento, fade) continua rodando
normalmente em cada intervalo entre duas marcas — só a duração de cada segmento
passa a vir do que você marcou, em vez de looping ou divisão igual.

## Atalhos de teclado

Alt H, em qualquer tela, lista os atalhos daquela tela.

Nas telas com tocador (cortar vídeo, e o modo manual de gerar vídeo), um
conjunto de teclas funciona sem precisar do Alt, contanto que o foco não esteja
num campo de texto: barra de espaço toca ou pausa, A avança cinco segundos, V
volta, O diz o tempo atual. Na tela de cortar, I marca o início do descarte e F
marca o fim. No modo manual, T adiciona a imagem no ponto atual.

Essas teclas nuas existem para quem digitar uma combinação com Alt é mais
trabalhoso — basta ouvir o ponto certo e apertar uma letra.

## Cortar vídeo

Todo corte é um descarte de um ponto até outro. Cortar o começo é descartar do
começo até onde o conteúdo começa; cortar o fim é descartar de onde ele termina
até o final; cortar no meio é marcar os dois pontos. Tudo se faz ouvindo e marcando com
Alt I e Alt F; não há campos de tempo na tela. Para cortar o começo, aperte
Home e Alt I; para cortar até o final, aperte End e Alt F.

Marque quantos descartes quiser. Tudo é aplicado de uma vez, numa passada só —
cortar várias vezes seguidas perderia qualidade a cada salvamento.

**Marcar vários trechos (Alt I e Alt F).** Alt I marca o início e Alt F o
fim de um trecho, no ponto onde o vídeo está. Repita quantas vezes quiser:
por exemplo, Alt I em 0:00 e Alt F em 0:03, depois Alt I em 10:00 e Alt F em
12:00, são quatro marcas e dois trechos. A cada Alt F o programa fala
"Trecho 2 marcado, de 10:00 a 12:00". Depois:

- **Delete** (ou Backspace) descarta todos os trechos marcados de uma vez.
  Eles vão para a lista de descartes e as marcas são apagadas. **Alt Z**
  desfaz esse lote inteiro de uma vez.
- **Alt S** salva todos os trechos marcados, cada um num arquivo. Pergunta
  uma vez só o formato (horizontal, vertical para short ou só áudio) e uma
  vez só o nome; com mais de um trecho os arquivos ganham -01, -02... na
  ordem do vídeo. As marcas continuam, então dá para salvar e depois
  descartar os mesmos trechos com Delete.
- Um Alt I sem Alt F depois fica pendente: o programa avisa e ele é ignorado
  pelo Delete e pelo Alt S. Um Alt F sem Alt I antes não marca nada.
- **O** (ou Alt O) fala onde o vídeo está e quantos trechos estão marcados.
  Não há campo na tela com a posição nem para digitar tempos: quem diz onde
  você está é o próprio áudio. Para ir ao começo ou ao fim, use Home e End.

**Tamanho do salto (F2).** Alt A avança e Alt V volta no tamanho do salto
(A e V sem Alt também), que começa em 5 segundos. F2 abre uma janela que muda
só o tamanho do salto, em minutos e segundos (sem hora): por exemplo, 10
segundos ou 10 minutos. Enter confirma, Escape cancela.

**Salvar.** A seção 6 tem, nesta ordem, Salvar áudio e Salvar vídeo. Salvar
vídeo pergunta onde gravar e grava o vídeo com os descartes marcados, as
trilhas e a legenda aplicados (era o antigo "Cortar agora"). Depois dá para
ouvir o resultado, voltar ao original e continuar editando.

**Selecionar todos.** Cada descarte da lista tem uma caixa de seleção; só os
marcados são aplicados. Acima da lista, "Selecionar todos os descartes" marca
ou desmarca todos de uma vez, e Ctrl A, com o foco dentro da lista, faz o
mesmo. O mesmo vale para os silêncios encontrados na etapa Áudio do Montar
vídeo ("Selecionar todos os silêncios").

### Ouvir e marcar

O vídeo toca dentro do programa, controlado por botões em vez dos controles
nativos do tocador, que não são confiáveis com leitor de tela. Atalhos: Alt T
toca ou pausa, Alt V volta e Alt A avança no tamanho do salto (5 segundos, ou o
que você escolher no F2), O ou Alt O diz o tempo atual e quantos trechos estão
marcados, Alt I marca o início de um trecho e Alt F marca o fim.

### Ouvir a emenda

Cada descarte da lista tem esse botão. Ele toca quatro segundos antes do corte,
pula o trecho descartado e continua quatro segundos do outro lado — direto do
arquivo original, sem gerar nada. É o que permite julgar se o corte caiu no
lugar certo e se a passagem ficou brusca, sem esperar um vídeo de vinte minutos
ser processado.

Num corte do começo, ele toca como o vídeo vai começar. Num corte do fim, como
vai terminar.

Depois de cortar, "Ouvir o resultado" carrega o vídeo pronto no mesmo tocador.

### Precisão

O corte é exato: o vídeo é recodificado. Existe um jeito instantâneo que só
copia, mas ele só corta nos quadros-chave do arquivo, que podem estar a vários
segundos de distância — pedir 1:23 e receber 1:21 é comum, e num conto isso cai
no meio de uma palavra. Testado com quadros-chave a cada oito segundos, que é o
pior caso: o corte caiu no ponto pedido com dez milissegundos de diferença.

Cada emenda recebe um fade de áudio de vinte milésimos. Não dá pra ouvir como
fade; existe só pra impedir o estalo que um corte seco no meio de uma onda
sonora produz.

O que o programa ajusta sozinho, e avisa: descartes que se sobrepõem viram um;
um pedacinho de menos de meio segundo sobrando entre dois descartes é descartado
junto, pra não virar um soluço.

## Dividir vídeo

Pega um vídeo grande e o separa em partes menores, já na vertical, pra postar
em YouTube Shorts, Instagram Reels e TikTok.

1. Na tela inicial, escolha "Dividir vídeo" e depois o vídeo. O programa diz
   quanto ele dura.
2. Diga quantos minutos terá cada parte. Um número sozinho é em minutos
   ("3", ou "1,5" para um minuto e meio). Com dois-pontos é minuto e segundo
   ("1:30"). "Calcular partes" fala quantas saem e quanto dura a última.
3. "Dividir agora" gera tudo, uma parte por vez, falando o andamento.
   "Cancelar" interrompe; as partes que já ficaram prontas são mantidas.

As partes vão para uma pasta nova ao lado do vídeo original, chamada
"nome (partes)", com arquivos como "nome - parte 02 de 05.mp4". Se a pasta já
existir, a nova ganha um número ("partes 2"); nada é sobrescrito.

Todas as partes têm o tamanho pedido, menos a última, que fica com o que
sobrar. Se ela ficar com menos de 10 segundos, o programa avisa antes.

**Formato vertical.** Sai em 1080 por 1920. O vídeo inteiro fica no meio e o
espaço de cima e de baixo é preenchido com uma versão desfocada do próprio
vídeo. Nada é cortado, então o texto escrito na tela continua inteiro.

**Limites das plataformas.** YouTube Shorts e Reels aceitam até 3 minutos; o
programa avisa se as partes passarem disso. O TikTok aceita vídeos mais longos
no envio (até 60 minutos de um arquivo só), então partes de até 3 minutos
servem nas três. Esses limites mudam de vez em quando: o número está em
`LIMITE_CURTOS`, no arquivo `src/dividir.js`.

O corte é no tempo exato e pode cair no meio de uma frase. Pra tirar trechos
antes, use "Cortar vídeo".

## Versão portátil (outro PC, ou depois de formatar)

Com o programa já funcionando, rode:

```
montar-portatil.bat
```

Ele não baixa nada: copia o Electron que já está em `node_modules`, encontra o
FFmpeg instalado na máquina e monta uma pasta única em `portatil\GeradorDeVideo`.

Essa pasta você leva num pen drive pra qualquer PC com Windows. Lá dentro tem o
`GeradorDeVideo.exe` — abre com Enter e funciona, sem Node, sem npm, sem
terminal e sem instalar o FFmpeg. São uns 350 MB.

Não tem atalho no menu iniciar nem entrada em "Adicionar ou remover programas";
é uma pasta que você guarda onde quiser. O ícone continua sendo o do Electron,
porque trocar ícone exigiria ferramenta extra.

## Estrutura

```
main.js                   processo principal do Electron, diálogos, IPC
preload.js                ponte segura pro renderer
src/presets.js            os dez conjuntos de efeito
src/formatos.js           formatos de tela e níveis de qualidade
src/timeline.js           divide a duração do áudio em segmentos
src/ffmpeg-builder.js     monta os comandos do FFmpeg (o único lugar com filtros)
src/ffmpeg-path.js        acha o ffmpeg e o ffprobe sem depender do PATH
src/titulos.js            limites, quebra de linha, tempo e validação dos textos
src/juntar.js             análise dos vídeos e montagem do modo juntar
src/cortar.js             descartes, trechos mantidos e o comando de corte
src/dividir.js           partes de tamanho fixo, vertical com fundo desfocado
src/logos.js             logo no vídeo: junto do título ou na faixa do topo, tamanho, sombra, fundo, trecho
src/render.js             orquestra: probe, normaliza, renderiza, junta
ui/                       interface
montar-portatil.bat       monta a versão portátil, sem baixar nada
```

Pra criar uma atmosfera nova, basta acrescentar uma entrada em `src/presets.js`.
Ela aparece sozinha na lista do app.

## Coisas que ainda dá pra melhorar

- **Crossfade real nos outros presets.** Hoje só o Literário usa transição de
  verdade (`xfade`); os demais continuam com fade pelo preto ou corte seco.
  Daria pra oferecer o mesmo tipo de passagem no clipe musical ou na balada,
  mas cada preset que usa isso precisa de um caminho de render mais pesado
  (ver aviso abaixo), então por ora ficou só onde fazia mais diferença.
- **Corte na batida**: ler os picos do áudio e alinhar as trocas de imagem com
  eles no preset de clipe musical.
- **Estimativa de tempo restante** durante o render.
- **Troca de preset junto com o Literário.** Hoje as duas coisas não se
  combinam (ver "Troca de preset por título"); juntar as duas exigiria misturar
  os dois jeitos de emendar os pedaços no mesmo vídeo.

## Aviso

Áudio longo demora. Um vídeo de 30 minutos gera cerca de 150 pedaços antes de
juntar tudo. Num i5 recente com 16 GB, espere algo entre 10 e 25 minutos
dependendo da qualidade escolhida. O botão Cancelar funciona a qualquer momento
e apaga os arquivos temporários.

**O preset Literário é mais lento que os outros**, porque a passagem de página
precisa de um passo a mais em cada pedaço (preparar a "massa" que a transição
consome) e a emenda final recodifica o vídeo inteiro numa passada só, em vez da
cópia rápida que os outros presets usam. Testado com 20 pedaços pequenos: o
resultado saiu certo, com a duração batendo exatamente com o áudio, mas levou
bem mais tempo que o mesmo teste nos outros presets. Num conto longo, considere
isso ao escolher esse preset — e o botão Cancelar continua funcionando a
qualquer momento, igual nos outros.

## Novidades da versão 2.0.3

- Sem mudanças de funcionamento em relação à 2.0.2.
- O instalador não faz mais a verificação demorada de integridade ao abrir.
- Novo: atualização leve (Gerador-de-Video-Atualizacao-<versão>.exe). Quem já
  tem o Gerador instalado só precisa rodar esse arquivo pequeno; ele fecha o
  app, troca apenas os arquivos que mudaram e mantém o ffmpeg e o resto.
  O instalador completo só é necessário numa instalação nova.

## Novidades da versão 2.0.2

### Editar vídeo
- F2 muda só o tamanho do salto (minutos e segundos, sem hora). Os campos de
  início e fim do trecho saíram da janela.
- Marcação em lote de volta: Alt I e Alt F repetidos marcam vários trechos;
  Delete descarta todos de uma vez (Alt Z desfaz o lote) e Alt S salva todos,
  um arquivo por trecho, numerados.
- O botão "Onde estou" saiu da tela; a tecla O (ou Alt O) continua falando a
  posição e quantos trechos estão marcados.

## Novidades da versão 2.0.1

### Editar vídeo
- O botão "Cortar agora" passou a se chamar **Salvar vídeo** e fica logo
  depois de **Salvar áudio**, na seção 6 (agora chamada "Salvar").
- Caixa de seleção em cada descarte e **Selecionar todos os descartes**
  (Ctrl A dentro da lista também alterna). Só os marcados entram no vídeo e
  no áudio salvos.
- O texto do começo da tela agora explica que F2 muda o tamanho do salto
  (e os tempos do trecho) e que Alt A e Alt V pulam nesse tamanho.

### Montar vídeo
- Silêncios encontrados com caixa de seleção e **Selecionar todos os
  silêncios** (Ctrl A dentro da lista também alterna). Só os marcados são
  cortados.

## Novidades da versão 2.0

### Editar vídeo
- Alt I marca o início do trecho e Alt F marca o fim, no ponto onde o vídeo está.
- Delete (ou Backspace) descarta o trecho marcado (desde a 2.0.2, todos os
  trechos marcados de uma vez).
- Alt Z desfaz o último descarte (um silêncio detectado conta como um lote).
- Alt S salva só o trecho marcado num arquivo novo: horizontal, vertical para
  short (1080 por 1920, fundo desfocado) ou só áudio (MP3 ou WAV). Fade
  discreto de 0,2 segundo nas pontas.
- F2 abre a janela de ajustes: tamanho do salto (minutos e segundos, padrão
  5 segundos) e os tempos do trecho à mão. Enter confirma, Escape cancela.
- Voltar e Avançar (V, A, Alt V, Alt A) usam o salto escolhido.
- Home e End vão para o começo e o final do vídeo.
- Salvar áudio grava o áudio editado (descartes e trilhas aplicados) em MP3 ou
  WAV, em segundo plano.

### Dividir vídeo
- Escolha entre partes na vertical (padrão, para short) ou na horizontal.

### Montar vídeo
- Salvar áudio, no fim da etapa do áudio, grava a voz com as trilhas num
  arquivo, sem sair do fluxo.

### Instalador
- `npm run dist:win` gera o instalador do Windows (NSIS, por usuário, com
  atalhos no menu Iniciar e na área de trabalho). Antes, ponha `ffmpeg.exe` e
  `ffprobe.exe` em `vendor/ffmpeg/`; eles vão para `resources/ffmpeg`.
- `npm test` roda os testes de sanidade dos comandos do FFmpeg.
