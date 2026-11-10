# Dúvidas que sobraram, para a Joy responder antes de compilar

## Atalhos universais nas telas de áudio, no leitor de tela
- Nos meus testes automáticos, Page Up avança, Page Down volta, End vai ao fim do áudio e cada atalho escreve a fala na região de avisos. Não consegui reproduzir o que a Joy ouviu.
- Pode ser o NVDA em modo de navegação, que toma para si as teclas Home, End, Page Up, Page Down e setas quando o foco está num título. Quando uma tecla é tomada pelo NVDA, a página não recebe.
- Perguntas: em qual etapa de áudio isso acontece? O foco está no título da etapa ou em um botão? O End faz alguma coisa, ou fica mudo? Em Configurações, a Confirmação dos atalhos está em Som e beep, Só som ou Só beep? Só beep desliga a fala.

## Page Up e Page Down
- Nas telas de áudio e no Editar vídeo já era Page Up avança e Page Down volta. Só a lista de frases do Gravar vídeo estava ao contrário, e foi corrigida.

## Onde cada coisa é salva: montado na 3.0.3, aguardando teste da Joy
Respostas dela e o que foi feito.
- Tipo de salvamento em Configurações, em rádio: Universal e Avançado. A pessoa continua podendo escolher outra pasta base em Alterar a pasta.
- Universal: dentro da pasta escolhida ficam só Áudios, Vídeos, Imagens e Extras. Posts mantêm uma pasta cada, como antes.
- Avançado: Gravar vídeo, Montar vídeo e Editar, cada um com Áudios, Vídeos e Extras dentro. Editar vale para Editar, Dividir, Juntar, Converter em lote e Editar áudio. Gravar áudio guarda em Áudios, com Extras dentro. Fotos tem a pasta Fotos, para Tirar fotos e as fotos do Gravar vídeo. Transcrever e Descrever, abertos pelo menu Extras, guardam em Extras.
- Extras: transcrições, descrições e legendas em texto vão para a pasta Extras da função de onde vieram.
- A pasta dos posts se chama Imagens, como já era. Posts de vídeo ficam em Vídeos.
- Conversão em lote: a pasta de saída tem o mesmo nome de antes, "Áudios em vídeo - nome", e fica dentro da pasta de onde vêm os áudios.
- Editar áudio e Editar vídeo agora salvam na pasta do programa, e não ao lado do arquivo original.
- Arquivos que já existem não são movidos, porque o programa não sabe de qual função cada um veio. Por isso nada é perguntado ao trocar de tipo de salvamento. A pergunta ficou desnecessária; se ela quiser uma arrumação opcional dos arquivos antigos, é outra ideia.
- A renomeação antiga de Áudios para Áudios de vídeos foi desligada, porque conflitaria com a nova estrutura.
- Ponto a conferir com a Joy: no Avançado, os vídeos prontos que o Criar post sugere são procurados na pasta raiz, em Vídeos e nos Vídeos de Gravar vídeo, Montar vídeo e Editar.

## Graves no Editar áudio
- Medi o som salvo. Com um tom de 120 Hz, os graves subiram uns 15 dB. Com uma fala, subiram só uns 3 dB, porque o filtro de graves começa abaixo de 120 Hz, onde a voz tem pouca energia.
- Proposta: subir a frequência do filtro de graves, por exemplo para 200 Hz, para a voz soar mais encorpada. Isso vale para todas as telas, e não só para o Editar áudio. A Joy decide se faço.
- Pergunta: quando ela sobe os graves pelo Editar vídeo, o arquivo é uma fala? Em qual tela fica esse controle de graves, já que o Editar vídeo novo só tem os Cortes?
