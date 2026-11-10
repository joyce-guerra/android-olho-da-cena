# Manual Operacional de Agentes — Olho da Cena Android (`AGENTS.md`)

Este repositório contém o port Android completo do **Olho da Cena 3.0.4**, regido pelo Sistema Operacional de Engenharia em Loop Fechado.

## 1. Regras Inegociáveis do Projeto
- **Isolamento de Diretório:** Este port Android vive exclusivamente em pasta separada (`T:/codigos/android-olho-da-cena`), mantendo a pasta original de computador (`T:/codigos/olho-da-cena`) 100% intocada.
- **Decisões Congeladas (`**Decided**`):** Todas as decisões marcadas com `**Decided**` em `specs/` e `docs/ARCHITECTURE.md` são vinculantes e não podem ser contornadas silenciosamente.
- **Inspeção Prévia de `module.exports`:** Antes de invocar qualquer módulo existente de `src/` ou `ui/`, leia sua declaração real de exportação para nunca supor nomes de funções ou constantes internas.
- **Cabeçalho Obrigatório `Role:`:** Todo arquivo de implementação novo deve declarar nas primeiras 10 linhas `// Role: entity | value | policy | port | adapter | service | controller` (ou `# Role:` em scripts Python).
- **Teto Estrito de 250 Linhas e Extração Lateral:** Todo arquivo de código novo deve ter no máximo **250 linhas**. Arquivos legados trazidos da versão 3.0.4 acima de 250 linhas constam na lista de dívida legada e não podem crescer com responsabilidades novas (extraia sempre módulos laterais coesos `<= 250` linhas).
- **Proibição de `utils` / `helpers`:** É proibido criar arquivos com nomes genéricos (`utils`, `helpers`, `common`, `shared`, `misc`).
- **Higiene de Comentários:** Comentários explicam apenas o *porquê* do estado atual; são proibidos comentários narrando histórico de PRs (`"antes era"`, `"mudou no milestone"`).
- **Teste Literal do Exemplo Concreto e Mapeamento 1-para-1 de Cenários:** O primeiro teste de cada onda deve executar literalmente o snippet do `"Exemplo Concreto de Uso"` da `Behaviour Spec`, e cada `Cenário N` deve possuir seu próprio teste individual.
- **Invariantes de Acessibilidade Android:** Preservar sempre o Modo Duplo (TalkBack por toque com barras visíveis e botões `"Ouvir detalhes"` + 100% dos atalhos de teclado físico), armazenamento duplo em `Documentos/Olho da Cena` + indexação no `MediaStore` + botão `"Compartilhar"`, e pausa segura em chamadas telefônicas ou perda de foco de áudio.
- **Instrumento de Voo Único (`tools/dev.py check`):** Toda entrega deve passar por `python tools/dev.py check`, que valida o ambiente (`doctor`), a sincronia deste manual (`test_manual_sync`), os papéis `Role:`, o limite de 250 linhas, a tabela `"Onde vive"` de `docs/ARCHITECTURE.md`, a paridade estática entre a ponte Kotlin (`@JavascriptInterface`) e o adaptador JS (`check_kotlin_js_bridge_parity`) e executa 100% da suíte de testes automatizados.
