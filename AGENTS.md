# Manual Operacional de Agentes — Olho da Cena Android (`AGENTS.md`)

Este repositório contém o port Android completo do **Olho da Cena 3.0.4**, regido pelo Sistema Operacional de Engenharia em Loop Fechado.

## 1. Regras Inegociáveis do Projeto
- **Decisões Congeladas (`**Decided**`):** Todas as decisões marcadas com `**Decided**` em `specs/` e `docs/ARCHITECTURE.md` são vinculantes e não podem ser contornadas silenciosamente.
- **Cabeçalho Obrigatório `Role:`:** Todo arquivo de implementação novo deve declarar nas primeiras 10 linhas `// Role: entity | value | policy | port | adapter | service | controller` (ou `# Role:` em scripts Python).
- **Teto Estrito de 250 Linhas:** Todo arquivo de código novo deve ter no máximo **250 linhas**. Arquivos legados trazidos da versão 3.0.4 acima de 250 linhas constam na lista de dívida legada e não podem crescer com responsabilidades novas.
- **Proibição de `utils` / `helpers`:** É proibido criar arquivos com nomes genéricos (`utils`, `helpers`, `common`, `shared`, `misc`).
- **Higiene de Comentários:** Comentários explicam apenas o *porquê* do estado atual; são proibidos comentários narrando histórico de PRs (`"antes era"`, `"mudou no milestone"`).
- **Instrumento de Voo Único (`tools/dev.py check`):** Toda entrega deve passar por `python tools/dev.py check`, que valida o ambiente (`doctor`), a sincronia deste manual (`test_manual_sync`), os papéis `Role:`, o limite de 250 linhas, a tabela `"Onde vive"` de `docs/ARCHITECTURE.md` e executa 100% da suíte de testes automatizados.
