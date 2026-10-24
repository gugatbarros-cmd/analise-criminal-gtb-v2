# Andamento da implantação — 24/10/2026

**78% concluído · 22% restante.** Apenas a **Fase 1** está concluída. A versão 0.1.29 acrescenta relatório detalhado imprimível dos módulos principais, preservando os filtros do recorte e os totais MVI separados. O backend novo permanece local; o sistema antigo segue em produção.

A prévia estática privada da versão 0.1.29 foi publicada em `https://gtb-analise-criminal-v2-demo.gugatbarros628864.chatgpt.site` em 24/10/2026. Ela permite testar a interface, os perfis MVI e o relatório detalhado com 31 registros sintéticos. A publicação não inclui o backend, banco DuckDB ou dados operacionais.

| Fase | Situação | Entregas | Progresso da fase | Peso no projeto |
| --- | --- | ---: | ---: | ---: |
| 0 — Inventário do legado | Em andamento | 2/4 | 50% | 5% |
| 1 — Base local | Concluída | 4/4 | 100% | 10% |
| 2 — Importação e histórico | Em andamento | 4/5 | 80% | 20% |
| 3 — MVI CAD e NEAC | Em andamento | 9/10 | 90% | 25% |
| 4 — Demais módulos | Em andamento | 14/20 | 70% | 30% |
| 5 — Preparação para troca | Em andamento | 3/5 | 60% | 10% |

O cálculo soma `peso × entregas concluídas ÷ entregas planejadas` e arredonda o resultado total ao inteiro mais próximo: **78%**. O restante é `100 − 78 = 22%`. Os pesos refletem uma estimativa de esforço, não uma previsão de prazo. Uma fase só aparece como concluída quando todas as suas entregas foram implementadas e verificadas. O arquivo usado pela tela é [`frontend/src/project-progress.json`](../frontend/src/project-progress.json).

## Critérios restantes

- **Fase 0:** detalhar filtros e cálculos de todas as abas e medir o desempenho de referência do legado.
- **Fase 2:** o ensaio sintético de 10 mil e 100 mil linhas passou após otimização da gravação por lote. Falta validar adaptadores das seis fontes com layouts anonimizados, medir memória e ampliar a escala; não há paridade comprovada.
- **Fase 3:** perfis anuais, mensais, de dia da semana, municípios, classificações, meio declarado ou inferido do relato e faixas de horário são independentes para CAD e NEAC. A cobertura de horário e a concentração por município identificam dados faltantes sem imputação. A ficha individual abre os campos originais da versão atual ou de uma versão histórica na própria fonte. O comparativo aponta pares exatos potenciais e registra casos sem par ou ambíguos; não soma nem funde fontes. Ainda é preciso provar paridade MVI com casos oficiais, revisar inferências da narrativa com casos oficiais e completar os demais campos derivados.
- **Fase 4:** migrar os demais indicadores, tabelas, gráficos, relatórios e fluxos operacionais. CVP e tentativas têm classificação e relação inicial de casos. TCO, mandados cumpridos, visitas realizadas e perturbação do sossego têm relação, evolução mensal e rankings, podendo coexistir com outros indicadores na mesma ocorrência. A triagem doméstica separa reconhecidas, pendentes, não configuradas no atendimento e fora do recorte feminino com evidências; ainda exige conferir versões conflitantes, paridade oficial e revisão humana. O relatório detalhado oferece impressão/PDF dos perfis MVI e dos módulos principais no recorte selecionado, somente após carregar todas as consultas. Armas possui contagem provisória por unidade e item, apreensões e relação individual; ainda faltam filtros completos, relatórios detalhados e paridade oficial. Drogas possui contagem inicial de registros, peso convertido quando a unidade é reconhecida, cobertura e relação individual. Guarnições possui pontuação inicial, ranking e separação de recursos fora da escala. Ainda faltam filtros e relatórios completos, além de paridade oficial.
- **Fase 5:** contas locais, senhas derivadas, sessão temporária, perfis e restrição de importação para consulta estão implementados. O backup integral verificável reúne DuckDB, contas e arquivos brutos do projeto novo; a restauração guarda uma cópia prévia e foi testada com dados sintéticos. As prévias sintéticas local e estática não equivalem à validação paralela. O executável Windows com interface, importação sintética e backup/restauração foi testado em execução real. Ainda faltam revisão de segurança operacional, backup dos dados do legado, validação paralela e plano de troca.

Cada entrega futura deve atualizar o arquivo de progresso, este registro e a versão no mesmo trabalho. A conclusão da implantação exige validação de paridade, segurança e dados, além do código pronto.
