# 30 leads externos validados e disponíveis no CRM

Auditoria: 13/10/2026, 12:09:59, America/Sao_Paulo.

**30 negociações novas disponíveis, 30 CNPJs únicos, todas atribuídas à Nicolle.** Os dois leads gerados antes deste pedido não foram recontados. Etapas atuais: Prospecção. Status: aberto.

- [Lista dos 30 leads, telefones, fontes e IDs](30-leads-externos-validados.csv)
- [Auditoria completa](external30-evidence.json)
- [13 testes aprovados](external30-tests.tap)
- [Diagnóstico Google](external30-google-diagnostic.json)
- [Sites encontrados pelo diretório público](external30-directory-discovery.json)
- [Painel publicado](external30-panel.png)

## Histórico e reposição

Lote original: 1638792c-2593-47e8-ba89-da080cf97d11, 30 entregas históricas. Uma negociação foi removida após o cadastro; não há evento de auditoria que permita identificar a causa. CNPJ 14158734000108, negócio df9b5cef-af80-4c94-920c-69678f95448f. Organização, contato, importação e prova permaneceram intactos. Esse negócio não foi recriado.

Uma nova empresa passou pelas mesmas verificações e foi entregue em um lote de reposição de uma entrega, cb67e667-9d81-4265-84ac-71c34ab2a78a. Assim, houve **31 criações históricas, uma remoção posterior e 30 negociações disponíveis**. Todos os eventos foram preservados; não foi apagado o histórico para simular uma contagem de 30. A lista CSV contém exclusivamente as 30 negociações disponíveis.

## Limites

O teto global permanece **160 por dia**, incluindo os externos. Não foi aumentado para 190. O lote externo não consome a meta horária de 16 nem a contagem de entregas da rotina. No instante da auditoria: rotina da hora 9, rotina do dia 19, total global do dia 50. A negociação removida continua na contabilidade histórica do teto diário, por já ter sido criada.

A rota normal de integração não permite que um cliente se declare externo. Lotes internos usam external_batch_id, limite próprio e transação com lock compartilhado. Organização, contato, negócio, importação e prova são vinculados; origem IA PROSPECÇÃO, source_system IA_PROSPECCAO, estágio inicial Prospecção, status aberto. O fluxo verificou telefones publicados e não efetuou ligações.

O modo externo termina automaticamente ao atingir cada lote. A rotina de prospecção permanece ativa.

## Google

Pesquisa isolada pelo SearXNG: zero resultados; HTTP 403 no adaptador XML /wml/search. A interface normal respondeu 200 e exigiu JavaScript; quando renderizada por Chromium sem alterações de identidade, redirecionou para /sorry/index e mostrou CAPTCHA por tráfego incomum. A tentativa foi interrompida e nenhuma proteção foi contornada.

Foram corrigidos problemas locais: categories=general incluía mecanismos não solicitados e foi removido; as consultas repetiam 20 combinações e agora variam também por região. O lote foi complementado por buscas reais e sites próprios vinculados no diretório de Juruaia. O diretório serve apenas à descoberta: CNPJ e telefone são conferidos no site empresarial e situação ativa em BrasilAPI/CNPJ.ws.

**O bloqueio externo do Google permanece.** O usuário confirmou não ter integração autorizada. É necessário desbloqueio legítimo pelo Google ou uma integração autorizada de resultados Google. Não se deve presumir a disponibilidade de Google Custom Search para uma conta nova: [documentação oficial](https://developers.google.com/custom-search/v1/overview) informa restrições e descontinuação em 01/01/2027.

## Validação e produção

13 testes passaram, incluindo lote externo após a meta horária, teto global 160, identificação na importação e bloqueio atômico da 31ª entrega dentro de um lote de 30. Fixtures não foram inseridas em produção. Build passou e foi publicado. Painel autenticado HTTP 200 e conferência visual aprovada.

A auditoria confirmou 30 CNPJs válidos e únicos, responsável Nicolle, vínculos de organização/contato/negócio, telefone correspondente à prova, origem e source_system corretos, prova cadastral ativa e fontes de verificação.

Backup anterior à migração: /var/backups/digitale-external30-20261013-142701. Migração idempotente executada: backend/migrations/20261013_external_prospecting_batches.sql. Serviço digitale-prospecting.service ativo e habilitado após reboot. Só esse worker foi reiniciado e só portal-digitale-backend recebeu reload. Nenhum outro sistema foi reiniciado.

## Arquivos de implementação alterados

- backend/migrations/20261013_external_prospecting_batches.sql
- backend/src/services/prospecting-auto-delivery.mjs
- backend/src/services/prospecting-auto-verification.mjs
- backend/src/services/prospecting-verification.mjs
- backend/src/workers/prospecting-auto.mjs
- backend/src/routes/prospecting-dashboard.js
- backend/test/prospecting-auto.test.mjs
- src/pages/ProspectingAI.tsx
