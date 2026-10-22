# Arquitetura inicial

O backend FastAPI escuta apenas em `127.0.0.1:8000`. `/health` devolve estado e versão sem consultar dados. O frontend React/TypeScript/Vite escuta em `127.0.0.1:5173` e consulta a API por TanStack Query. CORS permite apenas as duas origens locais de desenvolvimento. Apache ECharts está reservado para os futuros indicadores; não há gráfico com dados fictícios apresentado como oficial.

Esta fase não cria DuckDB, não lê planilhas, não mantém sessão de usuário e não sincroniza. Polars e DuckDB estão declarados para a etapa de importação. Cada fonte deverá ter adaptador próprio e dados brutos protegidos localmente. O uso multiusuário dependerá de autenticação e perfis antes de qualquer exposição em rede. A sincronização terá contrato e fila local antes de implementação remota.

O diretório está separado do repositório legado. O Firebase Spark antigo segue ativo sem mudanças. Serviço externo novo: nenhum. Custo de licenças: R$ 0; instalação inicial de pacotes usa internet, sem serviço pago.
