# Mandados e visitas no sistema novo (versão 0.1.12)

As regras iniciais vêm de `../../../docs/regras-indicadores.md` e da função `classifyOperationalAction` do legado. A origem é a base geral de ocorrências. Cada ocorrência identificada por CAD/BO e ano conta uma vez por indicador; uma mesma ocorrência pode satisfazer mandados, visitas, TCO ou outro indicador. A classificação é provisória até a conferência com planilhas anonimizadas e números de referência.

**Mandados:** exige texto afirmativo de cumprimento, execução, apoio ao cumprimento ou resultado efetivo associado a mandado judicial, de prisão ou de busca e apreensão. Mandado apenas expedido, solicitado, pendente, a cumprir, não cumprido, não localizado, cancelado ou sem êxito fica fora.

**Visitas:** exige modalidade explícita de visita orientativa, preventiva, comunitária, tranquilizadora ou de acompanhamento. Ação não realizada, cancelada, improcedente ou sem êxito fica fora.

A busca considera natureza, tipificações, classificação, solução, providência, modalidade e textos de relato, histórico ou descrição. Nomes de pessoas e números administrativos não servem como evidência. A relação apresenta a frase de evidência classificada, além de data, ocorrência, município, natureza e solução. Os filtros de ano e município são aplicados à relação, evolução mensal e rankings. Registros antigos da base geral são reclassificados localmente após backup quando a versão do adaptador muda; o arquivo original não é alterado.
