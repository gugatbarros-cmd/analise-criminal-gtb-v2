# Importação e versionamento planejados

Na fase 2: guardar bruto protegido, detectar encoding UTF-8/Windows-1252, separador e datas brasileiras; validar colunas obrigatórias; processar em transação; registrar divergências. Reimportação do mesmo SHA-256 deverá ser idempotente. Retificações criarão nova versão com proveniência. O backup anterior à aplicação e sua restauração terão testes. Esta fase ainda não aceita arquivos.
