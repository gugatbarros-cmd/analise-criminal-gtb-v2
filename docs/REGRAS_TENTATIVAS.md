# Tentativas de homicídio no sistema novo (versão 0.1.5)

A classificação inicial segue o contrato em `../../../docs/regras-indicadores.md` e as funções de tentativas do `../../../assets/js/app.js` do legado 4.6.256. A unidade é a ocorrência por CAD/BO e ano na base geral. O registro bruto e suas versões permanecem no banco.

- Inclui tentativa explícita de homicídio, feminicídio ou assassinato na tipificação, natureza ou relato. Expressões como “tentou matar” e “atentado contra a vida” também identificam casos candidatos.
- Exclui hipótese expressamente descartada no texto ou solução improcedente, não constatada, cancelada, duplicada, trote, sem ilicitude ou engano.
- Solução vazia não elimina uma tentativa explícita.
- A relação de casos mostra data, CAD/BO, município, natureza e solução, respeitando ano e município selecionados. A rota `/records/ocorrencias` aceita `category_prefix=Tentativa%20de%20homic%C3%ADdio`.

Na primeira abertura da versão 0.1.5, categorias derivadas de importações anteriores são recalculadas a partir do JSON bruto, após backup automático em `data/backups/before-adapter-*.duckdb`. O sistema não altera os arquivos importados nem remove versões.

A classificação textual ainda precisa de amostras anonimizadas e validação numérica com o legado. A auditoria em níveis, meios empregados, horários, gráficos, relatórios e tratamento de versões contraditórias continuam pendentes. A lista deve ser conferida no registro original antes de qualquer conclusão operacional.
