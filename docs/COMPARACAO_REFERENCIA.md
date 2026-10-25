# Comparação local com totais de referência

`scripts/compare-reference.py` importa as seis planilhas anonimizadas em um diretório temporário, calcula indicadores do sistema novo e compara os resultados com totais oficiais informados em um manifesto JSON. O relatório mostra apenas fontes, hashes, contagens de importação e diferenças numéricas; nenhuma linha da planilha é publicada. O diretório temporário é removido após a comparação.

Execute o exemplo sintético incluído no projeto:

```powershell
.venv\Scripts\python.exe scripts\compare-reference.py fixtures\synthetic\reference-checks.json
```

Para conferir amostras anonimizadas, copie [`fixtures/synthetic/reference-checks.json`](../fixtures/synthetic/reference-checks.json) para uma pasta local fora do Git e substitua os caminhos das seis fontes, seus SHA-256 e os totais `expected` aprovados. Cada caminho relativo é interpretado a partir da pasta do manifesto. Os filtros aceitos dependem da métrica: ano e município em todas; mês e datas em armas, drogas e guarnições; tipo/situação em armas, tipo em drogas e equipe, matrícula e natureza em guarnições. O campo `metric` aceita somente os indicadores listados em `METRICS` no script.

O comando retorna código `0` quando todos os totais conferem, `1` quando há diferenças e `2` para manifesto ou arquivos inválidos. Uma diferença deve ser analisada por fonte e caso, inclusive linhas em quarentena. O resultado sintético não comprova paridade com dados oficiais.

Não coloque planilhas reais, amostras operacionais ou manifestos com seus caminhos em `fixtures/`, no Git ou na prévia publicada. O sistema antigo permanece em uso até a validação paralela e o backup de seus dados operacionais.
