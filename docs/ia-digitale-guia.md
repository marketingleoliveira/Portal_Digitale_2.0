# IA DIGITALE — configuração e base de clientes

O menu **IA DIGITALE** está disponível no Portal Digitale. O menu, as configurações, a base de clientes e o monitoramento são exclusivos da conta marketing@digitaletextil.com.br. Outros usuários, inclusive administradores, não podem acessar essas telas ou APIs.

## Configurar a prospecção

Abra **IA DIGITALE → Configuração e clientes → Configuração**.

1. Use **Prospecção automática ativa** para ativar ou pausar.
2. Defina a quantidade máxima por hora (1 a 100) e por dia (1 a 1.000). O limite diário deve ser igual ou maior que o horário. Os valores são limites, não garantia de entrega: cada empresa precisa passar pelas verificações.
3. Selecione os estados desejados. A configuração inicial continua sendo apenas São Paulo. A UF é verificada no cadastro público do estabelecimento no CNPJ, tanto na verificação como antes de inserir no CRM.
4. Informe os segmentos, um por linha, e clique em **Salvar configuração**. A classificação de fabricante de vestuário, CNPJ ativo e telefone publicado continua obrigatória.

O expediente continua de 08h a 18h, horário de Brasília. Alterações não removem leads antigos nem zeram o consumo do dia. Lotes externos também respeitam o limite diário. As alterações são registradas com o usuário responsável.

## Importar a base de clientes

Abra a aba **Base de clientes**. Use **Baixar modelo CSV** ou uma planilha própria XLSX, XLS ou CSV. O cabeçalho e a tabela de clientes são reconhecidos automaticamente, inclusive quando há uma aba ou tabela anterior com o título do relatório. O arquivo pode ter até 10.000 linhas e 20 MB.

Campos:

| Coluna | Conteúdo |
| --- | --- |
| CNPJ | CNPJ válido, com ou sem máscara. |
| Nome do cliente | Nome da empresa, até 200 caracteres. |
| Data do último pedido | DD/MM/AAAA, AAAA-MM-DD ou célula de data do Excel. |

1. Clique em **Selecionar planilha**.
2. Confira as colunas reconhecidas; escolha manualmente se os títulos forem diferentes.
3. Clique em **Validar e visualizar prévia**. A prévia não grava dados.
4. Corrija CNPJs ou datas inválidos na planilha. Alternativamente, clique em **Excluir linhas inválidas e revisar prévia** para excluir explicitamente até 100 linhas com erros. Sem essa escolha, nenhuma linha é importada enquanto houver erros.
5. Confira as quantidades e a amostra e clique em **Confirmar importação**.

Linhas repetidas do mesmo CNPJ são consolidadas pela data de pedido mais recente. A reimportação atualiza nomes e pedidos. Uma data antiga ou vazia não apaga uma compra recente já cadastrada. Clientes que não constam na próxima planilha permanecem na base.

Todos os CNPJs importados, inclusive inativos e sem data, ficam bloqueados na prospecção automática. O bloqueio é conferido antes da consulta cadastral e novamente dentro da transação de entrega, evitando corridas com a importação. A importação não remove negócios antigos do CRM.

## Clientes ativos e inativos

- **Ativo:** último pedido dentro do prazo configurado em meses de calendário, incluindo a data limite.
- **Inativo:** último pedido anterior à data limite, ou seja, mais meses sem pedido que o prazo configurado.
- **Sem informação:** não há data de último pedido disponível.

A regra considera a quantidade configurada de meses de calendário, e ajusta meses com menos dias. A data limite aparece no painel. A situação é recalculada pelo serviço automático, inclusive fora do expediente e com a prospecção pausada; a consulta do painel também calcula a situação atual. Um pedido recente informado em nova planilha reativa o cliente.

Como os pedidos vêm da planilha, importe a base atualizada quando houver novas compras. Não existe uma consulta automática a um ERP externo de pedidos nesta implementação.

Busque por nome ou CNPJ, filtre por situação e consulte as últimas importações no final da aba.

## Monitorar entregas

Abra **IA DIGITALE → Monitoramento da prospecção**, ou a aba **Monitoramento**. O painel informa a região configurada, limites atuais, disponibilidade de leads no CRM, entregas, duplicidades e reprovações. O histórico anterior permanece disponível.

## Validação e implantação

Migração aditiva: `backend/migrations/20261013_digitale_ai.sql`. Backup anterior à alteração: `/var/backups/digitale-ia-config-20261013/`, com código e SQL.

27 testes automatizados aprovados. As rotas e o SQL foram exercitados em uma transação revertida ao final, cobrindo gravação/leitura da configuração, prévia, importação, bloqueio de CNPJ, classificação de inativos, reativação e preservação da data mais recente. O navegador verifica o formulário, XLSX/XLS/CSV, datas brasileiras, erros e o painel; gravações desse teste são interceptadas para não criar clientes fictícios.

O build de produção passou. A verificação TypeScript geral ainda aponta erros anteriores em `useCRM.ts` e `useCrmMeetingSchedules.ts`, sem novos erros nos arquivos desta implementação.

## Formato Relatório Empresa

O arquivo `relatorio_empresa.xls` é um relatório HTML Windows-1252 com extensão XLS. A importação lê a tabela de clientes, preserva acentos e ignora as tabelas com título. As colunas são reconhecidas como Nome Fantasia → nome, CNPJ/CPF → CNPJ e Última Compra → data do último pedido. Conforme a escolha do proprietário, clientes com CPF e linhas sem documento são excluídos da seleção, com contagens visíveis na prévia.

A validação do arquivo fornecido encontrou 2.621 CNPJs válidos distintos, três repetições, um CNPJ inválido, 769 CPFs e 31 linhas sem documento. A prévia dos CNPJs válidos mostra 190 ativos, 1.262 inativos e 1.169 sem informação de último pedido. O arquivo foi usado apenas para validação de leitura e prévia; não houve gravação de clientes na base. Evidência em `client-report-format-evidence.json`.

## Selo Cliente no Agendor

Leads cujo CNPJ coincida com a base importada recebem automaticamente o selo Cliente, com fundo mostarda e texto branco, tanto no kanban quanto na lista. A identificação se aplica ao histórico existente e às novas importações, sem alterar a origem IA/Site, a etapa ou o responsável. O acesso continua respeitando a carteira autorizada do usuário.

Ao clicar no card ou no selo, os detalhes mostram Última compra e Ticket médio. A importação reconhece a coluna Ticket Médio do relatório e aceita valores brasileiros como 1.535,14. A prévia e a base de clientes também mostram essa coluna. Informações ausentes aparecem como Não informada/Não informado; ticket zero permanece como R$ 0,00.

Migração: backend/migrations/20261013_client_average_ticket.sql. Validação: 30 testes, teste transacional da importação e verificação no navegador do botão, cores e dados do card. Os tickets vazios da base já importada foram completados com o relatório fornecido, somente quando a data da última compra coincidia, sem alterar datas ou valores existentes. Backup em /var/backups/digitale-cliente-badge-20261013/clients-before-ticket.json.

## Prazo de inatividade configurável

Em IA DIGITALE → Configuração, use **Meses sem compra para considerar cliente inativo**. O padrão é três meses; são aceitos inteiros de 1 a 60. Ao salvar, a situação da base é recalculada na mesma transação e as consultas do Agendor, da base e da prévia de importação usam esse prazo. A rotina diária também segue a configuração, inclusive com a prospecção pausada.

Os selos passam a **Cliente Ativo** e **Cliente Inativo**, mantendo o fundo mostarda e o texto branco. Clientes sem data de última compra exibem **Cliente sem data**, sem classificação indevida. A data da última compra e o ticket médio continuam nos detalhes. O menu de configuração permanece exclusivo de marketing@digitaletextil.com.br.

Validação desta alteração: 32 testes aprovados, teste transacional da configuração com prazo de seis meses e verificação de campo, envio e selos no navegador. Evidência em inactivity-months-evidence.json.
