# Andamento da implantação — 22/10/2026

**38% concluído · 62% restante.** Apenas a **Fase 1** está concluída. O projeto novo permanece local; o sistema antigo segue em produção.

| Fase | Situação | Entregas | Progresso da fase | Peso no projeto |
| --- | --- | ---: | ---: | ---: |
| 0 — Inventário do legado | Em andamento | 2/4 | 50% | 5% |
| 1 — Base local | Concluída | 4/4 | 100% | 10% |
| 2 — Importação e histórico | Em andamento | 3/5 | 60% | 20% |
| 3 — MVI CAD e NEAC | Em andamento | 3/10 | 30% | 25% |
| 4 — Demais módulos | Em andamento | 4/20 | 20% | 30% |
| 5 — Preparação para troca | Pendente | 0/5 | 0% | 10% |

O cálculo soma `peso × entregas concluídas ÷ entregas planejadas` e arredonda o resultado total ao inteiro mais próximo: 38% → **38%**. O restante é `100 − 38 = 62%`. Os pesos refletem uma estimativa de esforço, não uma previsão de prazo. Uma fase só aparece como concluída quando todas as suas entregas foram implementadas e verificadas. O arquivo usado pela tela é [`frontend/src/project-progress.json`](../frontend/src/project-progress.json).

## Critérios restantes

- **Fase 0:** detalhar filtros e cálculos de todas as abas e medir o desempenho de referência do legado.
- **Fase 2:** validar adaptadores das seis fontes com layouts anonimizados e medir importações grandes.
- **Fase 3:** provar paridade MVI com casos oficiais, completar instrumentos, detalhes e análises independentes.
- **Fase 4:** migrar os demais indicadores, tabelas, gráficos, relatórios e fluxos operacionais. CVP e tentativas têm classificação e relação inicial de casos. TCO elaborado tem regra de solução e relação de casos, podendo coexistir com CVP ou tentativa na mesma ocorrência. Modalidades, instrumentos, auditoria técnica e paridade oficial ainda faltam.
- **Fase 5:** segurança multiusuário, empacotamento, backup dos dados existentes, validação paralela e plano de troca.

Cada entrega futura deve atualizar o arquivo de progresso, este registro e a versão no mesmo trabalho. A conclusão da implantação exige validação de paridade, segurança e dados, além do código pronto.
