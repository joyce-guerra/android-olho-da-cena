# Behaviour Spec 0001: Ponte Android, Armazenamento Duplo e Navegação Modo Duplo (TalkBack + Teclado)

## Exemplo Concreto de Uso (Aprovado pelo Humano)

```javascript
// 1. Inicialização da ponte Android compatível com window.api do Olho da Cena:
const bridge = criarPonteAndroid({
  nativo: window.OlhoAndroidNativo, // Interface Kotlin @JavascriptInterface ou adaptador em memória
  plataforma: 'android'
});
window.api = bridge;

// 2. Leitura/gravação de configuração e resolução das pastas Universal/Avançado + MediaStore:
await window.api.salvarConfig({
  organizacaoPastas: 'universal',
  confirmacao: 'fala_e_bipe',
  videosDescartados: 'lixeira'
});
const destino = await window.api.resolverPastaSaida({
  funcao: 'gravar-video',
  nomeArquivo: 'meu-video.mp4'
});
// -> { pasta: '/storage/emulated/0/Documents/Olho da Cena/Vídeos', indexarGaleria: true }

// 3. Navegação na árvore inicial e nas árvores de seleção tanto por toque (click/duplo-toque) quanto por setas:
// Toque em um grupo ("Gravar", "Editar", "Criar") expande/recolhe a categoria e anuncia o estado;
// Toque em um item folha ("Gravar vídeo") abre a ferramenta diretamente.
```

## Cenários Observáveis (Casos Antes da Aceitação)

### Cenário 1: Caminho Feliz — Navegação por Toque (TalkBack) e por Teclado no Menu Inicial (`ui/menu.js`)
- **Dado (Given):** O menu inicial em árvore (`#menu-inicial`) carregado no celular com os grupos `"Gravar"`, `"Editar"`, `"Criar"` e os itens de nível superior (`"Configurações"`, `"Ajuda"`, `"Sair do programa"`).
- **Quando (When):** O usuário dá dois toques (evento `click`) no cabeçalho do grupo `"Gravar"` e em seguida dá dois toques no item `"Gravar vídeo"` (ou usa `ArrowRight` e `Enter` no teclado físico).
- **Então (Then):** O grupo `"Gravar"` muda `aria-expanded` para `"true"`, exibe seus subitens, e o toque em `"Gravar vídeo"` aciona a abertura da tela de gravação sem exigir teclas de seta.

### Cenário 2: Caminho Feliz — Ponte Android (`window.api`) e Pastas de Saída (`Universal` vs `Avançado`)
- **Dado (Given):** A ponte Android inicializada e a configuração `organizacaoPastas` definida como `"universal"` ou `"avancado"`.
- **Quando (When):** Qualquer módulo solicita o salvamento de uma mídia finalizada ou consulta `lerConfig` / `salvarConfig`.
- **Então (Then):** O arquivo é gravado na subpasta correta dentro de `Documentos/Olho da Cena` (respeitando `src/pastas-saida.js`), indexado no `MediaStore` quando for vídeo/foto/áudio final, e um comando `compartilharMidia` fica disponível para acionar o seletor de compartilhamento nativo do Android.

### Cenário 3: Caminho Feliz — Árvore de Seleção (`ui/selecao.js`) com Botões de Toque e Gesto Voltar
- **Dado (Given):** Uma árvore de seleção de fundos, molduras ou figurinhas aberta no celular.
- **Quando (When):** O usuário toca no botão `"Ouvir detalhes"` de uma opção ou aciona o botão `"Confirmar e fechar seleção"` (ou o gesto Voltar do Android).
- **Então (Then):** O botão `"Ouvir detalhes"` anuncia o Tom, Indicação, Descrição e Contraindicação daquele item (equivalente à barra de espaço no computador), e `"Confirmar e fechar seleção"` recolhe as categorias e dispara o callback `aoFecharComEsc` (anunciando a combinação com a roupa).

### Cenário 4: Falha Determinística / Caso de Borda — Interrupção de Gravação por Chamada ou Perda de Foco de Áudio
- **Dado (Given):** Uma gravação de vídeo ou de áudio em andamento (`gravando === true`).
- **Quando (When):** O sistema Android emite perda de foco de áudio (`AUDIOFOCUS_LOSS_TRANSIENT` ou chamada telefônica recebida).
- **Então (Then):** O controlador de ciclo de vida pausa imediatamente a gravação, preserva todos os pedaços já gravados no arquivo provisório sem corrompê-lo e, quando o foco retorna, anuncia na região de fala: `"A gravação foi pausada por uma interrupção; toque em Continuar ou em Parar e guardar."`
