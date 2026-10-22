# Análise Criminal GTB 2.0

Projeto novo, local e independente do sistema legado em produção. A versão 0.1.8 oferece importação CSV/XLSX de teste, histórico no DuckDB, indicadores provisórios de MVI CAD, MVI NEAC, CVP, tentativas e TCO, relações paginadas, evolução e rankings TCO, perfis independentes de MVI por ano, município e classificação e andamento da implantação por fase. Não acessa CAD/Firebase nem publica dados.

## Requisitos

- Python 3.12 ou superior
- Node.js 20 ou superior

## Iniciar no Windows

Na pasta deste projeto, execute `scripts\iniciar-backend.cmd` e `scripts\iniciar-frontend.cmd` em dois terminais. Na primeira execução, os scripts criam o ambiente Python e instalam dependências gratuitas do PyPI/npm. A API fica em `http://127.0.0.1:8000/health`; a interface em `http://127.0.0.1:5173`. Importe as três planilhas em `fixtures/synthetic/` para conferir os cartões e o gráfico.

Para conferir, execute `scripts\testar.cmd`. Se a instalação de pacotes estiver bloqueada, consulte `docs/ARQUITETURA.md` e rode ao menos `python -m compileall backend/src`. A verificação TypeScript depende da instalação das dependências do frontend. Para restaurar um backup do **banco novo**, pare a API e execute `.venv\Scripts\python.exe scripts\restore-local.py data\backups\<arquivo>.duckdb`; o estado anterior também será salvo.

## Estado

Fases 2 e 3 em andamento: CSV/XLSX com versões, quarentena, backup antes do lote, filtros e indicadores básicos. O arquivo bruto e o banco ficam em `data/`, ignorados pelo Git. A API oferece `/sources`, `/imports`, `/imports/{id}/divergences`, `/indicators/summary` e `/records/{source}`. O upload usa `POST /imports/{source}` com corpo binário, cabeçalho `X-Filename` e `scope=partial|complete`. O limite é 30 MB. Arquivos completos sinalizam ausentes sem apagar registros. Arquivos XLS antigos ainda não são aceitos.

As regras foram extraídas do legado, mas não há paridade comprovada com bases reais. Armas, drogas e guarnições têm apenas cadastro genérico no banco, sem adaptadores ou indicadores completos. Autenticação multiusuário, sincronização, relatórios, empacotamento e publicação também faltam. Use apenas dados sintéticos. As decisões pendentes estão em `docs/DECISOES_PENDENTES.md`.

O [andamento por fase](docs/STATUS_IMPLEMENTACAO.md) também aparece na tela inicial. A estimativa atual é **42% concluído e 58% restante**; somente a Fase 1 está concluída.

O código antigo continua dois diretórios acima e na URL de produção. Seu backup de código está em `../legacy-v4.6.256-2026-10-22.bundle`. O bundle não contém dados privados do navegador nem exportação atual do Firestore.
