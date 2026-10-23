# Armas — regra inicial 0.1.22

Esta implementação usa como referência as funções `armsColumn`, `getUniqueArmsRows`, `armQuantity`, `isSeizedArm` e `summarizeArmsDashboard` de `assets/js/app.js` do legado 4.6.256. A conferência com layout e totais oficiais ainda está pendente.

- **Fonte:** planilha própria de armas; nunca substitui ou soma automaticamente ocorrências gerais.
- **Chave:** ano e série da arma; quando a série é ausente ou genérica, ano, ocorrência e ID do item. Linhas sem chave estável vão para quarentena. A mesma ocorrência pode conter várias armas.
- **Quantidade:** valor positivo inteiro entre 1 e 1.000 no campo de quantidade de armas; valores ausentes ou inválidos contam uma unidade. Munições não são somadas.
- **Apreensão:** situação contém apreensão, recolhimento ou localização; expressões negativas explícitas são excluídas. Se a coluna de situação estiver ausente, o texto da linha é consultado como no legado.
- **Uso restrito:** conta as unidades cuja classificação de uso contém `restrito` ou `proibido`, independentemente de apreensão.
- **Filtros atuais:** ano e município; série mensal contém unidades apreendidas. Rankings de município, tipo, calibre e situação somam unidades. A relação individual mostra cada item, sua quantidade e situação.

O arquivo `fixtures/synthetic/armas.csv` contém três itens fictícios que representam quatro unidades. A análise deve indicar três unidades apreendidas e duas de uso restrito. Ainda faltam os filtros de mês, datas, situação e tipo do legado, relatórios detalhados e validação com layout anonimizado da fonte.
