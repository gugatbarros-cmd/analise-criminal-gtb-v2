# Modelo de dados proposto

Tabelas implementadas no DuckDB local:

- `source_types`: código e versão do adaptador.
- `import_batches`: fonte, SHA-256, escopo, data, contagens, status e caminhos locais.
- `record_versions`: origem, chave natural, hash, versão, vigência, campos originais e campos normalizados.
- `quarantine`: linha e motivo de rejeição, com original preservado.
- `import_divergences`: chave ausente em arquivo completo, pendente de revisão.

MVI CAD e MVI NEAC são separados por `source`. Ausência em arquivo parcial ou completo não exclui registros. Sem chave confiável, a linha fica em quarentena. Uma ocorrência pode ter várias vítimas; os dois totais não são equivalentes. Dimensões e fatos especializados ainda serão necessários para desempenho em bases grandes.
