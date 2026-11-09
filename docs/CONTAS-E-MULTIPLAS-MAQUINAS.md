# Contas e operação em várias máquinas

## Situação da versão 0.1.100

O instalador executa o GTB 2.0 localmente. O banco operacional `gtb.duckdb`, as contas `auth.sqlite3`, os arquivos originais e os backups pertencem ao computador da instalação. A Central de Acesso local lista todas as contas desse banco, inclusive revogadas; o administrador pode alterar perfil, revogar ou reativar, e definir senha temporária. A senha inicial ou temporária deve ser entregue ao titular por canal seguro. No primeiro acesso, ele precisa trocá-la. O administrador não consegue ler a senha anterior. Contas antigas continuam aceitando a senha existente; novas contas e trocas exigem 12 caracteres, maiúscula, minúscula e caractere especial.

As contas da página online são contas **Firebase separadas**. A Central de Acesso online permite ao administrador ver os perfis autorizados, alterar nome, posto e papel, revogar o acesso e enviar e-mail de recuperação de senha ao titular. O titular escolhe a nova senha pelo link do Firebase; o administrador não a vê. O plano Spark permite até [150 e-mails de redefinição por dia](https://firebase.google.com/docs/auth/limits); quando a cota acabar, o envio informa indisponibilidade e não ativa faturamento. A página online consulta uma cópia autenticada dos dados processados enviados a `sharedBases/gtb2-online`; os originais e backups não são enviados. Revogar uma conta local afeta somente aquele computador. O aplicativo anterior não participa do acesso ao GTB 2.0.

## Instalação segura agora

1. Instale a mesma versão do GTB 2.0 em cada computador pelo instalador oficial. Não copie manualmente os arquivos `gtb.duckdb` ou `auth.sqlite3` entre máquinas em uso.
2. Escolha **um computador principal** para importar e revisar bases. Faça backup antes de trocar a versão ou o equipamento principal.
3. Conecte a sincronização online no computador principal. Os demais operadores consultam a cópia online autenticada. Cada pessoa usa sua própria conta; não compartilhe senha de administrador.
4. Verifique a data e a versão da última sincronização antes de usar resultados operacionais. Se a rede ou a cota gratuita falhar, a consulta deve informar indisponibilidade ou dado antigo, sem ativar faturamento.

## Evolução recomendada para dois ou mais computadores que importam

Para permitir escrita simultânea com segurança, será preciso criar um protocolo próprio: identidade estável para cada fonte e lote, versão central por base, comparação da versão antes de publicar, rejeição de conflitos com revisão humana, histórico e backup por lote, e download incremental validado por hash. Também será preciso unificar ou federar a identidade local e online; copiar a base de senhas local entre máquinas criaria contas duplicadas e revogações inconsistentes. O Firestore no plano Spark pode continuar como ponto de coordenação enquanto as cotas gratuitas bastarem. Ao atingir uma cota, a operação compartilhada fica temporariamente indisponível; nenhuma migração para serviço pago é automática.

Até esse protocolo existir e ser testado com duas máquinas, use um importador principal e várias instalações de consulta. Esse fluxo elimina conflitos de gravação e evita instalar a base operacional completa em cada estação.
