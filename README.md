# Olho da Cena — Edição Android

Estúdio acessível de criação e edição de vídeos, áudios, fotografias e posts para redes sociais projetado para pessoas cegas e com baixa visão (criado por **Joyce Guerra**).

Este projeto implementa o **Olho da Cena para Android** com **Modo Duplo de Interação** (gestos de toque do leitor de tela **TalkBack** + suporte completo a teclado físico Bluetooth/USB), armazenamento duplo em `Documentos/Olho da Cena` com indexação automática na Galeria do aparelho (`MediaStore`), proteção de gravação contra chamadas telefônicas e motores de visão e transcrição locais.

---

## Funcionalidades do Estúdio Android

1. **Gravar (Vídeo, Áudio e Foto):**
   - **Gravar vídeo:** Enquadramento guiado por voz em tempo real (posição do rosto, luz, distância, mãos, objetos e fundo), detecção automática de câmera frontal (com espelho) ou traseira (sem espelho e com lanterna), leitura na sombra por toque ou botão de volume e captura de foto durante a gravação sem interromper o vídeo.
   - **Gravar áudio:** Gravação pelo microfone do celular ou captura de áudio interno do aparelho (Android 10+), com pausa automática segura se entrar chamada telefônica ou alarme.
   - **Tirar foto:** Câmera fotográfica falada com 8 proporções, molduras, figurinhas em cartão, troca/desfoque de fundo e aviso de contraste com a roupa.
2. **Editar (Vídeo, Áudio, Fotos, Dividir e Juntar):**
   - **Editar vídeo e Editar áudio:** Barra de ações rápidas para toque no TalkBack (`Tocar/Pausar`, `Voltar salto`, `Avançar salto`, `Mudar salto`, `Marcar Início`, `Marcar Fim`, `Onde estou`, `Descartar marcados`, `Salvar marcados`, `Desfazer`), corte automático de silêncios e respirações, ajuste de volume (10% a 300%), velocidade (0,5x a 2,5x), equalização de 3 faixas e trilhas de fundo.
   - **Melhorar vídeo:** Diagnóstico falado em 3 janelas, desfoque de fundo e troca por 19 cenários ou molduras com aceleração móvel.
   - **Editar fotos:** Triagem acessível de até 200 fotos pelo seletor do Android ou pasta, com leitura item a item dos 7 diagnósticos por deslize.
   - **Dividir vídeo e Juntar vídeos:** Divisão por tempo ou cortes manuais por toque, e junção com conferência de formatos, títulos por parte e nivelamento de volume pela mediana (`-1.5 dBTP`).
3. **Criar (Montar Vídeo, Posts e Conversor em Lote):**
   - **Montar vídeo:** Combinação de áudios, imagens, 10 atmosferas visuais com movimento, títulos, logos (junto ao título ou em faixa de topo) e legendas sincronizadas, rodando em serviço de segundo plano com notificações faladas.
   - **Criar post (Imagem/Carrossel e Vídeo):** Geração de posts para Instagram, TikTok, Shorts e YouTube com botões diretos para copiar a legenda (`legenda.txt`) para a área de transferência do Android e compartilhar os arquivos prontos.
   - **Áudios para vídeos (Conversor em lote):** Transformação em lote de pastas ou arquivos de áudio em vídeos com imagem de fundo e logo.

---

## Tecnologias Utilizadas

- **Camada de Domínio e Interface Acessível (`src/` e `ui/`):** JavaScript (CommonJS / ES2022) e HTML5 semântico com árvores ARIA (`role="tree"`, `aria-live`) adaptadas para navegação por toque no TalkBack e teclado físico.
- **Camada Nativa Android (`android/`):** Kotlin (`MainActivity`, `OlhoBridgeService`, `OlhoAssetLoaderAdapter`), `WebView` com protocolo local `app://olho/`, `MediaStore`, `ClipboardManager`, `AudioManager` e `Intent` (`Share Target` para receber mídias e textos compartilhados de outros aplicativos).
- **Mídia e Inteligência Artificial:** FFmpeg / MediaCodec, MediaPipe Tasks Vision, transcrição de voz com `whisper.cpp` (incluindo revisão fala por fala com botão `"Ouvir trecho"`) e descrição visual com `llama.cpp` (ou chave opcional em nuvem para aparelhos com menos memória).
- **Governança de Engenharia (`tools/dev.py`, `specs/`, `docs/ARCHITECTURE.md`):** Engenharia em Loop Fechado com validação automática de arquitetura, papéis de módulo (`Role:`), limite de 250 linhas por arquivo novo e suíte completa de testes.

---

## Estrutura do Projeto

- `android/` — Projeto nativo Android (Kotlin e `AndroidManifest.xml`).
- `src/` — Regras de domínio puras, políticas de armazenamento/interrupção Android, portas, adaptadores e serviço da ponte `window.api`.
- `ui/` — Telas acessíveis e controlador de gestos de toque (`toque-controles-controller.js`).
- `specs/` — Tríade de especificações formais (`Proposal`, `Behaviour Spec` e `Tech Spec`).
- `docs/ARCHITECTURE.md` — Mapa vivo e acessível da arquitetura do sistema.
- `test/` — Suíte de testes automatizados (217 testes cobrindo domínio e ponte Android).
- `tools/dev.py` — Instrumento de voo único (`doctor`, `build`, `check`).

---

## Pré-requisitos e Instalação (Desenvolvimento e Testes)

- **Node.js** 18 ou superior
- **Python** 3.10 ou superior
- **FFmpeg** e **FFprobe** disponíveis no `PATH` (ou em `vendor/ffmpeg/` para a suíte de testes locais)
- **Android SDK / Gradle** (para compilação do `.apk` a partir de `android/`)

```bash
npm install
```

---

## Como Executar as Verificações

- **Verificador Único Completo (Ambiente + Governança + Paridade Kotlin/JS + 217 Testes):**
  ```bash
  python tools/dev.py check
  ```
- **Diagnóstico de Ambiente:**
  ```bash
  python tools/dev.py doctor
  ```

---

## Variáveis de Ambiente

Consulte o arquivo `.env.example` na raiz do repositório para opções de desenvolvimento e chave opcional de nuvem (`OLHO_CHAVE_NUVEM_IA`, `OLHO_FFMPEG_DIR`).

---

## Licença

© 2026 Joyce Guerra (`joycepsi.com.br`). Licença Creative Commons BY-NC-ND 4.0: uso e compartilhamento gratuitos com crédito à autora. Venda e versões modificadas proibidas. Consulte o arquivo [`LICENSE`](LICENSE) para detalhes.
