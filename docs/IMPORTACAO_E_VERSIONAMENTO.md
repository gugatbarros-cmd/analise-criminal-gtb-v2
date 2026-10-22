# Importação e versionamento planejados

Implementado: leitura CSV UTF-8/Windows-1252 com detecção de separador e XLSX; datas brasileiras/ISO/serial Excel; transação DuckDB; SHA-256 do arquivo; reimportação idempotente; versões com vigência; quarentena por linha; cópia do banco antes de cada lote; bruto em `data/raw/`. Importação completa registra ausentes em `import_divergences`, consultável por API, sem apagar registros. A restauração manual do banco novo preserva antes o estado atual. Testes cobrem reimportação, retificação, isolamento de fontes, rejeição, divergência e restauração.

Ainda pendente: XLS legado, layouts reais anonimizados, backup de dados atual do Firebase e chave robusta para todas as seis fontes. Nunca interpretar uma linha em quarentena como ausência estatística confirmada.
