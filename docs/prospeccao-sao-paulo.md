# Prospecção São Paulo

Publicado em 13/10/2026 no Portal Digitale.

A prospecção de novos fabricantes abrange exclusivamente o estado de São Paulo, incluindo a capital e cidades do interior. Todas as variantes das buscas incluem a localização paulista. A UF do estabelecimento precisa ser confirmada como SP pelo cadastro público do CNPJ; localização no texto da busca ou DDD paulista não substituem essa confirmação.

A verificação usa a UF da BrasilAPI ou a sigla do estado no retorno alternativo do CNPJ.ws. Empresas de outros estados são reprovadas com `outside_target_state`. Se a UF não puder ser confirmada, a candidata fica para revisão com `registry_state_inconclusive`, sem gerar lead. A entrega ao CRM também exige UF SP na evidência, bloqueando evidências antigas sem essa confirmação. Candidatas pendentes passam novamente pela verificação antes da entrega.

O menu e o título passaram a “Prospecção São Paulo”. Os leads já cadastrados foram preservados, e os indicadores históricos continuam incluindo esses registros. A responsável Nicolle, o expediente de 08h a 18h e os limites de entrega existentes foram mantidos.

Validação: 21 testes automatizados aprovados, incluindo buscas de todas as variantes, rejeição de outras UFs/UF ausente e bloqueio anterior à abertura de transações no CRM. Build de produção concluído. Serviço automático reiniciado, ativo e habilitado. Verificação autenticada do painel e do navegador registrada em `prospeccao-sao-paulo-evidence.json`.

Backup anterior à alteração: `/var/backups/digitale-prospeccao-sp-20261013/code-before.tar.gz`.
