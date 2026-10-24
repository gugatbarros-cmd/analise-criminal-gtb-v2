# Drogas — regra provisória

Referência: funções `drugColumn`, `buildDrugRowKey`, `getDrugType`, `getDrugQuantity`, `getDrugWeightGrams` e `summarizeDrugDashboard` em `assets/js/app.js` do legado 4.6.256. Os totais ainda não foram comparados com base oficial.

- **Fonte:** planilha própria de drogas, separada de ocorrências gerais.
- **Chave:** `ID OCOR DESPC ENVL DROG` quando presente; sem esse ID, hash dos campos da linha, como aproximação ao fallback do legado. Alterações numa linha sem ID podem formar nova chave e exigem revisão antes de uso operacional.
- **Registros:** cada linha corrente conta uma vez, com séries mensais e rankings de tipo, município e local.
- **Quantidade:** texto com vírgula decimal é convertido em número. Valor negativo ou ausente não entra na soma de peso.
- **Peso:** unidades reconhecidas: kg para 1.000 g, g para 1 g e mg para 0,001 g. Outras unidades continuam visíveis na relação, sem conversão presumida. A análise apresenta a cobertura de linhas com peso reconhecido.
- **Tipo:** usa o campo explícito; quando ausente, procura no texto maconha, cocaína, crack, MDMA/ecstasy, LSD, skunk, pasta base ou inalantes, como no legado.
- **Filtros atuais:** ano e município do recorte geral ou próprios da análise, mais mês, datas inicial/final inclusivas e tipo. Os mesmos filtros se aplicam aos registros, peso reconhecido, cobertura, séries, rankings e relação individual. Datas invertidas são rejeitadas e tipo usa comparação exata após normalização de acentos e grafia.

O arquivo `fixtures/synthetic/drogas.csv` contém quatro registros fictícios. Três têm peso reconhecido, totalizando 1.000,1 g; a linha em comprimidos não recebe peso presumido. Ainda faltam relatório especializado e validação com layout anonimizado e totais oficiais antes de usar dados operacionais.
