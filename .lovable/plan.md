# Leads qualificados do Agente CRM no Agendor

## Objetivo
Enviar automaticamente ao Agendor os leads do Agente CRM do projeto institucional quando forem classificados como **Qualificados**, sempre atribuídos exclusivamente a `sdr@digitaletextil.com.br` para prospecção.

## Implementação
1. Criar neste portal um receptor seguro para leads externos, protegido por segredo compartilhado.
2. Registrar cada lead externo com identificador único de origem para impedir duplicações.
3. Ao receber um lead qualificado:
   - criar ou reutilizar a empresa;
   - criar ou reutilizar o contato;
   - criar o negócio no funil padrão, etapa **Prospecção**;
   - atribuir empresa, contato e negócio ao usuário SDR indicado;
   - incluir os dados da qualificação no histórico/observações;
   - enviar uma notificação ao SDR.
4. No projeto institucional, disparar o envio logo após a validação mudar para `qualified`.
5. Fazer uma sincronização inicial dos qualificados existentes ainda não enviados.
6. Validar duplicidade, atribuição, visibilidade por permissão e notificação.

## Segurança e regras
- O receptor não será público sem autenticação: aceitará somente chamadas com o segredo compartilhado.
- Um lead já importado não será criado novamente, mesmo se for revalidado.
- Nenhum vendedor diferente do SDR indicado será proprietário dos registros importados.
- Falhas de envio ficarão registradas no projeto institucional para nova tentativa, sem perder o lead.

## Detalhes técnicos
- Destino: tabelas existentes `crm_organizations`, `crm_people`, `crm_deals`, `crm_activities` e `user_notifications`.
- Destinatário confirmado: Nicolle, conta `sdr@digitaletextil.com.br`.
- Funil confirmado: **Funil de Vendas**, etapa inicial **Prospecção**.
- A alteração no projeto institucional será separada da alteração deste portal, pois cada projeto possui código e banco próprios.
