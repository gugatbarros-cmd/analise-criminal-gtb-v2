# CVP no sistema novo (versão 0.1.4)

Esta implementação segue a regra de `../../../docs/METODOLOGIA-CVP.md` e o contrato de `../../../docs/regras-indicadores.md` do legado 4.6.256. A unidade é uma ocorrência por número CAD/BO e ano. Os registros originais e suas versões permanecem no DuckDB.

- Inclusão: `roubo` ou marcador explícito `CVP` nas colunas de tipificação, tipicidade, natureza, classificação ou indicador criminal.
- Exclusão: latrocínio e roubo seguido de morte ou com resultado morte. Furto e demais delitos sem roubo ou marcador CVP ficam fora.
- Situação: `Tentado` quando a classificação contém tentativa, tentado ou não consumado; os demais são `Consumado`.
- Consulta: o painel usa o mesmo recorte de ano e município do resumo, mostra os dois subtotais e pagina as ocorrências filtradas. A rota `/records/ocorrencias` aceita `category_prefix=CVP%20` ou `CVP%20Tentado`.

Na primeira abertura da versão 0.1.4, registros de ocorrências importados com adaptador anterior são reclassificados a partir do JSON original. O programa salva antes uma cópia do banco em `data/backups/before-adapter-*.duckdb`. A classificação derivada muda; arquivos brutos, chaves e histórico de versões continuam preservados.

Ainda faltam modalidades, instrumentos, faixas horárias, gráficos e comparação com totais oficiais. Marcadores conflitantes em colunas diferentes e mudanças de natureza dentro da mesma ocorrência exigem conferência com exemplos anonimizados antes de declarar paridade.
