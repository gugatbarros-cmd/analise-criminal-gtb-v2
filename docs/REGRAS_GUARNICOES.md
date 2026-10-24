# Guarnições — regra inicial 0.1.24

Referência: funções `teamsColumns`, `canonicalTeamName`, `isRosterTeamName`, `teamOccurrenceComplexity`, `parseTeamOfficers` e `renderTeamsDashboard` de `assets/js/app.js` do legado 4.6.256. Esta é uma implementação inicial; ainda não há paridade com layout e totais oficiais.

- **Fonte:** vínculo entre recurso e ocorrência na planilha própria de guarnições. Uma ocorrência pode aparecer vinculada a mais de uma equipe.
- **Chave:** ano, número da ocorrência, nome canônico da equipe e papel (`titular` ou `apoio`). Sem número de ocorrência, usa hash dos campos da linha. Mudanças numa linha sem identificador podem formar outra chave e exigem revisão. Linhas sem equipe identificável vão para quarentena.
- **Nome da equipe:** `RP 1` e `RP 01` são `RP 01`; força-tarefa e alguns nomes de equipes de escala seguem as equivalências explícitas do legado. O ranking de equipes usa apenas nomes reconhecidos da escala. Força-tarefa e outros recursos ficam em contadores separados.
- **Complexidade:** natureza crítica = 5 pontos; alta = 4; média = 3; rotineira = 2; básica = 1. O total de pontos soma vínculos de equipes de escala, não ocorrências distintas de toda a base.
- **Policiais:** a composição textual procura função, nome e matrícula. O ranking evita repetir a mesma matrícula na mesma ocorrência; ele inclui vínculos de escala e recursos extras, como no legado. Na prévia, todos os nomes e matrículas são fictícios.
- **Filtros atuais:** ano e município do recorte geral, mais mês, datas inicial/final inclusivas, equipe, matrícula do policial e natureza próprios da análise de guarnições. Os mesmos filtros se aplicam à pontuação, rankings e relação individual. Datas invertidas são rejeitadas; equipe, matrícula e natureza usam comparação exata após normalização de acentos e grafia. Ainda faltam controles independentes de ano/município, especialidades, tempos e relatórios completos do legado.

`fixtures/synthetic/guarnicoes.csv` contém cinco vínculos inteiramente fictícios: três da escala, um da força-tarefa e um recurso eventual. A pontuação das equipes de escala é 11 pontos. A conferência com planilhas anonimizadas é obrigatória antes de usar dados operacionais.
