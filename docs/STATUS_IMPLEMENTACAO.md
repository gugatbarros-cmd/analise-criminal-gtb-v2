# Andamento da implantação — 23/10/2026

**58% concluído · 42% restante.** Apenas a **Fase 1** está concluída. A versão 0.1.16 oferece uma demonstração local e uma prévia estática com dados sintéticos e consulta somente leitura. O backend novo permanece local; o sistema antigo segue em produção.

A prévia estática privada da versão 0.1.16 foi publicada em `https://gtb-analise-criminal-v2-demo.gugatbarros628864.chatgpt.site` em 23/10/2026. Ela permite testar a interface com 14 registros sintéticos. A publicação não inclui o backend, banco DuckDB ou dados operacionais.

| Fase | Situação | Entregas | Progresso da fase | Peso no projeto |
| --- | --- | ---: | ---: | ---: |
| 0 — Inventário do legado | Em andamento | 2/4 | 50% | 5% |
| 1 — Base local | Concluída | 4/4 | 100% | 10% |
| 2 — Importação e histórico | Em andamento | 4/5 | 80% | 20% |
| 3 — MVI CAD e NEAC | Em andamento | 7/10 | 70% | 25% |
| 4 — Demais módulos | Em andamento | 8/20 | 40% | 30% |
| 5 — Preparação para troca | Pendente | 0/5 | 0% | 10% |

O cálculo soma `peso × entregas concluídas ÷ entregas planejadas` e arredonda o resultado total ao inteiro mais próximo: 58% → **58%**. O restante é `100 − 58 = 42%`. Os pesos refletem uma estimativa de esforço, não uma previsão de prazo. Uma fase só aparece como concluída quando todas as suas entregas foram implementadas e verificadas. O arquivo usado pela tela é [`frontend/src/project-progress.json`](../frontend/src/project-progress.json).

## Critérios restantes

- **Fase 0:** detalhar filtros e cálculos de todas as abas e medir o desempenho de referência do legado.
- **Fase 2:** o ensaio sintético de 10 mil e 100 mil linhas passou após otimização da gravação por lote. Falta validar adaptadores das seis fontes com layouts anonimizados, medir memória e ampliar a escala; não há paridade comprovada.
- **Fase 3:** perfis anuais, de municípios, de classificações e do meio explicitamente declarado são independentes para CAD e NEAC. A ficha individual abre os campos originais da versão atual ou de uma versão histórica na própria fonte. Ainda é preciso provar paridade MVI com casos oficiais, interpretar relatos com revisão humana e completar campos derivados e demais análises.
- **Fase 4:** migrar os demais indicadores, tabelas, gráficos, relatórios e fluxos operacionais. CVP e tentativas têm classificação e relação inicial de casos. TCO, mandados cumpridos, visitas realizadas e perturbação do sossego têm relação, evolução mensal e rankings, podendo coexistir com outros indicadores na mesma ocorrência. Armas, drogas, violência doméstica, relatórios e paridade oficial ainda faltam.
- **Fase 5:** as prévias sintéticas local e estática permitem inspecionar a interface, mas não equivalem à validação paralela. Ainda faltam segurança multiusuário, empacotamento, backup dos dados existentes, validação paralela e plano de troca.

Cada entrega futura deve atualizar o arquivo de progresso, este registro e a versão no mesmo trabalho. A conclusão da implantação exige validação de paridade, segurança e dados, além do código pronto.
