# Arquitetura inicial

O backend FastAPI escuta apenas em `127.0.0.1:8000`. O frontend React/TypeScript/Vite escuta em `127.0.0.1:5173` e consulta a API por TanStack Query. CORS permite apenas as duas origens locais de desenvolvimento. Apache ECharts mostra a série mensal separada de CAD e NEAC; a interface sinaliza que os números são provisórios.

O DuckDB armazena lotes, versões correntes e históricas, quarentena, divergências de arquivo completo e a fila `sync_outbox`. CSV UTF-8/Windows-1252, XLS antigo e XLSX são lidos localmente; cada lote guarda o bruto em `data/raw/` e cria cópia prévia do banco em `data/backups/`. As seis fontes têm mapeamento inicial de colunas; quatro layouts fornecidos foram conferidos localmente, sem versionar nem publicar os arquivos. Contas e sessões locais ficam em `data/auth.sqlite3`, com senhas derivadas por scrypt e papéis de administrador, analista e consulta. O backup integral local inclui DuckDB, contas e brutos. A fila de sincronização registra só contagens agregadas, inicia com estado `awaiting_authorization` e não possui despachante nem provedor remoto ativo. A API continua restrita ao computador local.

O diretório está separado do repositório legado. O Firebase Spark antigo segue ativo sem mudanças. Serviço externo novo: nenhum. Custo de licenças: R$ 0; instalação inicial de pacotes usa internet, sem serviço pago.
