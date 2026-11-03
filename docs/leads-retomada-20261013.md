# Retomada dos leads da Nicolle — 13/10/2026

## Resultado confirmado

- O acesso autenticado da Nicolle confirmou inicialmente 129 negócios visíveis, sendo 116 de origem IA/IA PROSPECÇÃO. Os 30 externos já estavam incluídos nesse total.
- Depois da correção, dois novos leads foram verificados e cadastrados pelo serviço automático: 118 leads IA disponíveis, 88 da rotina/legado e 30 externos. Nenhum lead de teste foi inserido no CRM.
- Os 30 registros externos foram preservados. O histórico permanece com 31 entregas externas porque houve uma remoção anterior e uma reposição, documentadas em `external30-report.md`. Não foram recriados registros removidos nem duplicados os 30 existentes.
- O Portal está saudável e o serviço `digitale-prospecting.service` está ativo e habilitado. As metas e limites permanecem 16/hora, 160/dia e operação das 08h às 18h em São Paulo.

## Causas encontradas e correções

1. O worker executava consultas restritas com frases entre aspas e CNPJ, repetindo a primeira página de poucas combinações. Nas últimas execuções, não encontrava novos candidatos. Google estava bloqueado e Bing retornava resultados vazios ou irrelevantes. Yahoo e DuckDuckGo responderam com sites pertinentes na verificação atual.
2. A descoberta agora varia segmentos, termos e polos de confecção, usa os mecanismos disponíveis e avança páginas de busca. O cursor é persistido a cada consulta concluída. A primeira rodada corrigida encontrou 20 novos candidatos; descoberta não é tratada como entrega.
3. A verificação agora segue links de contato e páginas institucionais publicados no próprio site, com limite de páginas e respeito às regras de robots.txt. Sites próprios do grupo, mídia, marketplaces e fontes irrelevantes continuam bloqueados. CNPJ válido/ativo, fabricação de vestuário, telefone publicado e deduplicação seguem obrigatórios.
4. As escritas do worker acontecem em outro processo e não geravam o evento websocket do backend. O Agendor dependia apenas desse evento: a página aberta podia permanecer sem os novos registros. Negócios, organizações e contatos passam a ser consultados a cada 30 segundos; as chaves de cache incluem o usuário.
5. O Agendor ganhou **Atualizar leads**, horário da última consulta e mensagem de erro de atualização. A Prospecção IA apresenta disponíveis no CRM, externos e rotina separadamente, além da última entrega, distinguindo disponibilidade de contabilidade histórica.
6. 183 candidatos inconclusivos foram reagendados para nova verificação, sem alterar a contagem de tentativas, remover evidência ou modificá-los em leads já aprovados.

## Validação

- 19 testes passaram: rotação/paginação, filtros de descoberta, registro de candidatos, links institucionais, robots.txt, fabricação, identificação fiscal, deduplicação, quotas, lote externo, transação e rollback.
- Build Vite passou e foi publicado. A página pública corresponde à compilação preparada.
- Endpoint de prospecção: 200 autenticado; 401 sem sessão. A soma disponíveis = rotina + externos foi conferida, com 30 externos presentes.
- Navegador com acesso da Nicolle: atualização automática observada após 30 segundos, atualização manual confirmada, 118 leads IA visíveis e nenhum erro JavaScript. Requisições de escrita do navegador foram interceptadas durante esse teste; não foram lançadas localização, presença ou ações comerciais fictícias.
- TypeScript global continua apontando erros em `useCRM.ts` e `useCrmMeetingSchedules.ts`, arquivos que não foram alterados nesta correção. Não houve indicação de erro de tipo nos arquivos modificados.

Evidências: [leads-retomada-evidence.json](leads-retomada-evidence.json), [leads-retomada-browser.json](leads-retomada-browser.json), [Agendor](leads-retomada-agendor.png) e [Prospecção IA](leads-retomada-prospeccao.png).

## Publicação e backup

Backup de código, dist e banco anterior às alterações: `/var/backups/digitale-leads-retomada-zP7JRj`. Somente o worker de prospecção e o backend do Portal foram reiniciados. Outros sistemas da VPS não foram reiniciados. Nenhuma tabela do CRM foi apagada ou restaurada a partir do backup.

## Limite externo

O bloqueio do Google permanece; não foi contornado. Os mecanismos alternativos disponíveis são usados para descoberta, mantendo a verificação em fontes empresariais e cadastrais. A quantidade entregue depende de empresas elegíveis e fontes acessíveis; não são criados contatos fictícios para atingir a meta.

Referência técnica: [API de pesquisa do SearXNG — parâmetro pageno](https://docs.searxng.org/dev/search_api.html).
