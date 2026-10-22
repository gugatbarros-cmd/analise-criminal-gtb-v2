# Modelo de dados proposto

Ainda não há tabelas implementadas. Planejamento para fase 2:

- `source_types`: código e versão do layout de cada fonte.
- `import_batches`: fonte, hash SHA-256, escopo completo/parcial, data, adaptador, contagens e status.
- Staging tipado e erros de validação por linha.
- Fatos separados de ocorrências e vítimas, com origem, chave natural, versão, vigência e campos originais.
- Dimensões de data, município, natureza e fonte.

MVI CAD e MVI NEAC terão fatos separados. Ausência em arquivo parcial não excluirá registros. Arquivo completo divergente gerará revisão. Sem chave estável, a linha ficará em quarentena. Uma ocorrência pode ter várias vítimas; os dois totais não são equivalentes.
