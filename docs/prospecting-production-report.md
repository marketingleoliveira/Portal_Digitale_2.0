# Prospecção IA em produção

Evidências coletadas em 2026-10-13T14:16:04.883Z. Dados detalhados: [prospecting-production-evidence.json](prospecting-production-evidence.json).

Novos negócios criados e entregues à Nicolle por esta implementação: **2**. As três entregas IA anteriores no dia são contabilizadas apenas para impedir excesso da cota; não são apresentadas como resultado deste trabalho.

## Entregas reais

- RANE MODA PRAIA E FITNESS — CNPJ 16624806000190; negócio `64963992-d65c-439a-8234-41416d939727`; responsável Nicolle; etapa Prospecção; status aberto; origem IA PROSPECÇÃO.
- VELUIE — CNPJ 41544462000157; negócio `dc761019-3039-4d39-be4f-3ca89aa98c77`; responsável Nicolle; etapa Prospecção; status aberto; origem IA PROSPECÇÃO.

## Operação

- Serviço systemd `digitale-prospecting.service`: ativo e habilitado após reboot, Restart=always.
- Rotina de descoberta, verificação e cadastro: `backend/src/workers/prospecting-auto.mjs`.
- Todos os dias, das 08:00 às 18:00, America/Sao_Paulo. Limites transacionais: 16/hora e 160/dia. Sem compensações que ultrapassem o limite da hora. Déficits registrados em cada ciclo.
- SearXNG existente em 127.0.0.1:8888. Consultas rotativas dos cinco segmentos; filtro de fontes alheias ao segmento, site próprio, redes sociais, diretórios e marketplaces.
- Consulta cadastral BrasilAPI, com CNPJ.ws como fallback e intervalo conservador de 22 segundos. Falhas de busca aplicam backoff exponencial; candidatos inconclusivos têm retentativas escalonadas e permanecem em revisão.
- Telefone publicado em página ou link tel/WhatsApp do site que publica o CNPJ. Nenhuma ligação foi realizada ou declarada.
- Cadastro usa o mesmo serviço transacional da rota real de integração do Portal, vinculando organização, contato, negociação e importação IA_PROSPECCAO.
- Lock MySQL do worker impede sobreposição; lock de importação compartilhado com SITE serializa as entregas.
- Reinícios recuperam candidatos em verificação. Entregas e a contagem são persistidas na mesma transação.
- Painel `/prospeccao-ia`, consulta autenticada `/api/prospecting-dashboard`. Indicadores reais e históricos.
- Somente o backend portal-digitale-backend recebeu reload PM2. Serviço antigo de prospecção substituído; timer antigo e cron `/etc/cron.d/digitale-verified-delivery` desabilitados para evitar outra automação. Cron original preservado no backup.

## Migração e backup

- Migração executada: `backend/migrations/20261013_prospecting_automation.sql`, idempotente.
- Tabelas criadas: prospecting_auto_candidates, prospecting_auto_deliveries, prospecting_auto_runs e prospecting_auto_runtime. Collation alinhada ao CRM.
- A tabela prospecting_verified_delivery_queue já existe em site_digitale; a consulta antiga usava portal_digitale, onde ela não existe. A rotina nova usa sua própria contabilidade de entregas. Não foi criada uma fila vazia para mascarar o erro.
- Backup anterior à migração: `/var/backups/digitale-prospecting-20261013-140345/portal_digitale.sql`. Arquivos anteriores e dist também preservados nesse diretório.

## Validação

- 11 testes automatizados passaram: CNPJ/DDD, janela diária e fim de semana, horário de verão histórico, limites de entrega, verificação com fonte e falha de provedor, telefone publicado, quatro fontes de deduplicação, recuperação idempotente, origem SITE, transação com atribuição/etapa e rollback de falha. Fixtures desses testes não foram inseridas no banco de produção.
- `npm run build -- --outDir /tmp/digitale-prospecting-build`: passou; bundle publicado após validação.
- Consultas de deduplicação executadas com sucesso no schema real.
- Saúde do Portal: HTTP 200. Painel autenticado: 200; sem autenticação: 401.
- RANE MODA PRAIA E FITNESS teve revalidação real pelo endpoint de integração: HTTP 200, created=false, duplicate=true, mesmo deal_id. Hash do negócio permaneceu igual.
- Após reinício controlado, serviço retomou sozinho; entregas persistiram. is-enabled=enabled; Restart=always. Nenhum reboot do servidor foi realizado.
- Tentativa concorrente de adquirir digitale:prospecting-worker retornou 0, bloqueando o segundo worker.

## Dependências e limitações observadas

- Google e DuckDuckGo apresentaram indisponibilidade no SearXNG. Falhas são registradas no histórico; outros mecanismos retornaram sites empresariais reais.
- Sites sem CNPJ comprovável ou telefone publicado não são entregues. Empresas de atividade cadastral diferente de fabricação de vestuário são reprovadas.
- A meta de 16/hora é alvo de produção, não quantidade garantida pela busca. O serviço registra o déficit e continua pesquisando; não houve comprovação de 160 leads em um dia nesta janela de observação.

## Arquivos alterados ou adicionados

- `backend/migrations/20261013_prospecting_automation.sql`
- `backend/src/database.js`
- `backend/src/server.js`
- `backend/src/routes/prospecting-leads.js`
- `backend/src/routes/prospecting-dashboard.js`
- `backend/src/routes/site-leads.js`
- `backend/src/routes/ai-leads.js`
- `backend/src/services/prospecting-verification.mjs`
- `backend/src/services/prospecting-policy.mjs`
- `backend/src/services/prospecting-auto-verification.mjs`
- `backend/src/services/prospecting-auto-delivery.mjs`
- `backend/src/workers/prospecting-auto.mjs`
- `backend/test/prospecting-auto.test.mjs`
- `src/pages/ProspectingAI.tsx`
- `src/App.tsx`
- `src/config/navigation.ts`
- `/etc/systemd/system/digitale-prospecting.service`
- `/etc/cron.d/digitale-verified-delivery`
- `docs/prospecting-production-evidence.json`
- `docs/prospecting-production-report.md`
- `docs/prospecting-tests.tap`
