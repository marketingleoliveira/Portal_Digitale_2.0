# Agendor: CRM individual por vendedor + visão de Gerência

## Diagnóstico da estrutura atual

**O que já existe e será reaproveitado**
- Rota única `/agendor` (`src/pages/Agendor.tsx`) com abas internas: Funil, Organizações, Contatos, Atividades.
- Núcleo de dados já correto e único: `crm_pipelines` → `crm_stages` → `crm_deals` → `crm_activities`, mais `crm_organizations`, `crm_people`, `crm_deal_products`. Todos já possuem `owner_user_id` (negócios/empresas/pessoas) ou `assigned_to` (atividades) — o campo "responsável" pedido já está no banco.
- Hook central `src/hooks/useAgendor.ts` (queries, mutations, realtime), componentes `AgendorKanban`, `AgendorStats`, `DealDetailSheet`, `ActivitiesPanel`, formulários de negócio/empresa/pessoa.
- Cargos já resolvidos por `isDevLevel` (dev, diretoria, gerente) em `src/types/auth.ts`, navegação centralizada em `src/config/navigation.ts` com suporte a submenus e controle por cargo em Configurações ERP.
- Trigger `crm_log_deal_change` já grava histórico de mudança de etapa/situação como atividade tipo `historico`.

**Problemas encontrados (o que precisa ser corrigido)**
1. **Sem isolamento algum.** Todas as políticas de leitura de `crm_*` são `true`: qualquer usuário autenticado vê negócios, empresas, pessoas e atividades de todos os vendedores. Este é o ponto crítico.
2. Não há distinção entre "Meu Agendor" e "Gerência" — uma única tela para todos.
3. Sem indicadores de saúde/estagnação: falta marcar a data da última movimentação e a próxima tarefa no card.
4. Sem dashboard (visão geral), sem tela de desempenho por vendedor, sem relatórios.
5. Ações de ganhar/perder negócio só existem indiretamente pelo arrastar de etapa; sem motivo de perda estruturado.
6. Kanban mostra negócios ganhos/perdidos junto com os abertos.
7. Sem transferência de carteira nem histórico de reatribuição.

## Plano de implementação

### Fase 1 — Isolamento real no banco (base de tudo)
- Função `crm_can_view(_user uuid, _owner uuid)`: verdadeiro se o usuário for dev/diretoria/gerente (via `has_full_access`) ou se for o próprio responsável/criador.
- Reescrever as políticas de leitura/escrita de `crm_deals`, `crm_organizations`, `crm_people`, `crm_activities` e `crm_deal_products` para usar essa regra — vendedor passa a ver apenas a própria carteira; empresas e pessoas ficam visíveis quando são dele ou estão ligadas a um negócio dele.
- Novos campos: `crm_deals.last_activity_at`, `crm_deals.won_value`, `crm_deals.loss_competitor`; tabela `crm_ownership_transfers` (registro de transferências de carteira) e `crm_settings` para motivos de perda e regras de estagnação (dias).
- Triggers: atualizar `last_activity_at` quando o negócio muda ou recebe atividade; registrar transferência de responsável no histórico e na tabela de transferências.

### Fase 2 — Estrutura de menu e escopo
- Menu "Agendor" com submenus: **Gerência** (`/agendor/gerencia`, cargos dev/diretoria/gerente) e **Meu Agendor** (`/agendor`, todos).
- Hook `useAgendorScope`: define o escopo ativo (próprio usuário, todos, ou um vendedor específico para quem tem permissão) e alimenta todas as queries. O seletor de contexto só é renderizado para cargos autorizados.

### Fase 3 — Meu Agendor
Navegação interna por abas: Visão Geral, Meus Negócios, Empresas, Contatos, Minhas Tarefas.
- **Visão Geral**: cards pessoais (negócios abertos e valor, ganhos e valor, perdidos, conversão, ticket médio, tarefas de hoje, atrasadas), resumo do funil por etapa, próximas tarefas e lista de negócios que precisam de atenção.
- **Meus Negócios**: Kanban (apenas abertos) + visão em lista com busca, filtro e ordenação; cards passam a exibir responsável, próxima tarefa, última movimentação e o semáforo de saúde (verde = tem próxima tarefa futura; amarelo = tarefa pendente/atrasada; vermelho = sem próxima tarefa ou parado).
- **Detalhe do negócio**: painel ampliado com cabeçalho (etapa, probabilidade, responsável, previsão), ações rápidas (editar, nova tarefa, nota, trocar responsável, Ganhar, Perder), timeline cronológica de histórico, coluna lateral com cliente/contato, próxima atividade e produtos do catálogo do ERP.
- **Ganhar/Perder**: diálogos dedicados — ganho confirma valor final e data; perda exige motivo (lista configurável) com concorrente e observação opcionais. Tudo registrado no histórico.
- **Minhas Tarefas**: lista com visões Hoje / Próximas / Atrasadas / Concluídas, filtros por tipo e período, vínculo a negócio/empresa/pessoa.

### Fase 4 — Gerência
Abas: Visão Geral, Vendedores, Negócios, Leads e Empresas, Tarefas, Relatórios, Configurações.
- **Visão Geral**: dashboard consolidado com os mesmos indicadores em escala global, filtros por período, vendedor, funil e origem.
- **Vendedores**: tabela comparativa (negócios recebidos, em andamento, valor em negociação, ganhos, receita, conversão, ticket médio, tarefas atrasadas, negócios críticos) com ação "Ver Agendor" que abre a visão individual daquele vendedor.
- **Atribuição**: transferir responsável de um ou vários registros de uma vez, com histórico de transferências visível.
- **Configurações**: funis (criar, editar, funil padrão), etapas (criar, reordenar, probabilidade, status ganho/perdido), motivos de perda, origens e regra de dias de estagnação.

### Fase 5 — Relatórios e alertas
- Relatórios de conversão por etapa, receita ganha/perdida/em aberto, desempenho por vendedor, produtos mais negociados, tempo médio de fechamento — com gráficos (recharts, já usado no ERP) e filtros.
- Alertas usando o sistema de notificações existente: negócio atribuído, tarefa atrasada, negócio parado, negócio sem próxima tarefa.

## Notas técnicas
- Nenhuma tabela nova de leads/negócios: base única, apenas escopo e permissão diferentes. Dados atuais preservados (migrations só adicionam colunas e substituem políticas).
- Segurança aplicada no banco (RLS), não apenas no frontend; o filtro por vendedor no frontend é conveniência de UI.
- Reaproveita `products` do ERP nos itens do negócio, `profiles` para responsáveis, `leads` para rastreio de origem, design system e componentes shadcn atuais.
- Responsivo: Kanban com rolagem horizontal no mobile, painéis laterais virando sheets, tabelas com rolagem.

Entrego as fases em sequência, validando cada uma antes de avançar — a Fase 1 (isolamento) primeiro, por ser pré-requisito de todo o resto.
