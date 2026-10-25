# Contrato de sincronização local

Cada importação nova grava, na mesma transação DuckDB do lote, um evento `import_aggregate` de versão 1 na tabela `sync_outbox`. O payload contém somente fonte, ID do lote e contagens de linhas, inserções, atualizações, quarentena e divergências. Reimportar um arquivo idêntico não cria outro evento.

O estado inicial é `awaiting_authorization`. O módulo `gtb.sync.outbox` define `SyncProvider`, `DeliveryResult` e transições locais de tentativa, conflito ou entrega para uso futuro. Eventos nesse estado inicial não podem ser marcados como enviados pela rotina local. **Não existe despachante, credencial, endpoint remoto ou sincronização automática nesta versão.** O banco DuckDB não deve ser compartilhado por escritores de rede.

Antes de implementar qualquer envio, é necessário definir e autorizar destino, dados agregados permitidos, autenticação, política de conflitos e limites de custo R$ 0. O backup integral inclui a fila para conservar sua trilha local.
