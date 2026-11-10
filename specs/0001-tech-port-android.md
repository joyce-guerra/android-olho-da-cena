# Tech Spec 0001: Arquitetura Interna da Ponte Android, Armazenamento e Modo Duplo de Toque

## 1. Decisões Técnicas Congeladas
- **Decided:** Todo arquivo novo de código criado para o port Android deve declarar nas primeiras linhas seu papel arquitetural único (`// Role: entity | value | policy | port | adapter | service | controller`) e respeitar o teto estrito de **250 linhas**.
- **Decided:** São estritamente proibidos arquivos genéricos (`utils.*`, `helpers.*`, `common.*`, `shared.*`, `misc.*`) e comentários narrativos de histórico de mudanças.
- **Decided:** A comunicação entre a interface web acessível (`ui/`) e a camada nativa Android ocorre pelo contrato `window.api` provido por `src/android-ponte-service.js` e `src/android-nativo-adapter.js`, mantendo compatibilidade 100% com as chamadas existentes e adicionando os métodos móveis (`compartilharMidia`, `colarTexto`, `resolverPastaSaida`, `registrarInterrupcaoAudio`).
- **Decided:** O carregamento de recursos locais (`vendor/fundos/*`, `vendor/visao/*`, áudios e vídeos locais) no Android usa `WebViewAssetLoader` / interceptação do esquema `app://olho/` na camada Kotlin (`android/app/src/main/java/br/com/olhodacena/OlhoAssetLoaderAdapter.kt`).

## 2. Mapa de Módulos Novos da Onda 1 e Papéis (Proibido `utils`/`helpers`, Teto <= 250 linhas)

| Arquivo / Classe | Papel (`Role`) | Responsabilidade Única | Colaboradores Permitidos |
| :--- | :--- | :--- | :--- |
| `src/android-armazenamento-policy.js` | `policy` | Resolve caminhos de saída Android (`Documentos/Olho da Cena`), regras de indexação no `MediaStore`, lixeira e compartilhamento | `src/pastas-saida.js` (`policy`) |
| `src/android-interrupcao-policy.js` | `policy` | Decide transições determinísticas de pausa e mensagens faladas ao ocorrer chamada telefônica, alarme ou perda de foco de áudio | Nenhum (puro) |
| `src/android-nativo-port.js` | `port` | Contrato abstrato das capacidades nativas Android (arquivos, FFmpeg, câmera, área de transferência, compartilhamento, foco de áudio) | Nenhum |
| `src/android-nativo-adapter.js` | `adapter` | Implementação concreta do contrato nativo conectando `window.OlhoAndroidNativo` (Kotlin WebView) ou fallback para testes | `src/android-nativo-port.js` |
| `src/android-ponte-service.js` | `service` | Orquestra `window.api` no Android combinando políticas de armazenamento, interrupção, configuração e o adaptador nativo | `src/android-armazenamento-policy.js`, `src/android-interrupcao-policy.js`, `src/android-nativo-port.js` |
| `ui/toque-controles-controller.js` | `controller` | Controlador fino de gestos de toque TalkBack, barra de ações móveis, botão Voltar do Android e reação a interrupções de áudio | `src/android-ponte-service.js`, `ui/menu.js`, `ui/selecao.js` |
| `android/app/src/main/AndroidManifest.xml` | `adapter` | Manifesto Android declarando permissões de câmera/microfone/mídia, `ForegroundService` e `intent-filter` de `Share Target` | Sistema Android |
| `android/app/src/main/java/br/com/olhodacena/MainActivity.kt` | `controller` | Ponto de entrada Android que hospeda o WebView acessível, intercepta botão Voltar e encaminha intents de compartilhamento | `OlhoBridgeService.kt`, `OlhoAssetLoaderAdapter.kt` |
| `android/app/src/main/java/br/com/olhodacena/OlhoAssetLoaderAdapter.kt` | `adapter` | Resolve URLs `app://olho/arquivo` e assets empacotados para o WebView sem bloqueio de CORS | Android `WebView` |
| `android/app/src/main/java/br/com/olhodacena/OlhoBridgeService.kt` | `service` | Serviço e interface `@JavascriptInterface` que coordena `MediaStore`, `ClipboardManager`, `AudioFocusRequest` e `ShareCompat` | `MainActivity.kt` |
