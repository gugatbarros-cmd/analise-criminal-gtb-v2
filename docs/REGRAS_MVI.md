# Regras MVI a validar

As regras iniciais foram extraídas do código e de `../../../docs/METODOLOGIA-MVI.md` do legado. Cada fonte tem total próprio. CAD exige natureza final elegível, papel de vítima, identidade e óbito específico `S/Sim`. NEAC usa a natureza do relatório e a identidade, sem exigir o campo de óbito que não existe nessa fonte. Tentativas, culposo, trânsito, intervenção e resistência não contam. A unidade é vítima por ocorrência e ano; CVP e tentativas usam ocorrência, sem somar MVI das duas fontes.

A coluna final de despacho tem prioridade no CAD. Nomes desconhecidos sem NIC são rejeitados. `Tanque d Arca` e `Tanque d'Arca` são normalizados. Linhas sem chave confiável ou homônimos com contexto conflitante ficam em quarentena. Não há, ainda, paridade para todos os layouts, enriquecimento por narrativa, meio empregado, revisão humana nem confirmação com números oficiais.
