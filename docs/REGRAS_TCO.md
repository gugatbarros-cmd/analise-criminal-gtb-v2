# TCO no sistema novo (versão 0.1.6)

O contrato foi extraído de `../../../docs/regras-indicadores.md` e das funções `isElaborouTcoStatus` e `getTcoRows` em `../../../assets/js/app.js` do legado 4.6.256. A unidade é a ocorrência por CAD/BO e ano na base geral.

- Inclui solução equivalente a `ELABOROU TCO (PM)`, tolerando acentos e separadores.
- Exclui solução vazia, `NÃO ELABOROU TCO` e menções genéricas a TCO sem elaboração confirmada.
- Usa o número da ocorrência e o ano do fato como chave de deduplicação. A relação de casos mostra data, CAD/BO, município, natureza e solução.
- O campo `indicators` do banco mantém TCO, CVP e tentativa como marcadores independentes. Uma mesma ocorrência pode aparecer em mais de um indicador sem duplicar a ocorrência na base. A rota `/records/ocorrencias` aceita `indicator=TCO`.

Na primeira abertura da versão 0.1.6, o banco anterior recebe a coluna de indicadores, após cópia em `data/backups/before-adapter-*.duckdb`. As classificações derivadas são recalculadas a partir dos registros originais; arquivos brutos e histórico de versões são preservados.

Faltam tipologias, série mensal, distribuição territorial, busca por CAD/BO, relatórios e conferência com amostras anonimizadas e totais do legado. Valores contraditórios em mais de uma coluna de solução precisam de validação antes de declarar paridade.
