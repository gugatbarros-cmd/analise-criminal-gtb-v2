# Análise Criminal GTB 2.0

Projeto novo e independente do sistema legado em produção. A versão 0.1.52 reproduz a moldura institucional, a identidade visual e os grupos de menu do sistema antigo, mantendo identificados como "Em migração" os módulos que ainda não têm paridade funcional. O executável local permite pré-validar e importar bases reais CSV/XLS/XLSX, com quarentena, backup automático anterior ao lote e armazenamento exclusivamente local. Também aceita exportações Excel antigas (`.xls`) do CAD, inclusive cabeçalhos repetidos e arquivos OLE tolerados pelo Excel. Oferece comparação local de seis fontes, importação CSV/XLS/XLSX com gravação por lote, histórico no DuckDB, lista de lotes e auditoria visual paginadas de quarentena e divergências e benchmark sintético de um milhão de linhas em lotes com medição de memória. As relações MVI CAD e NEAC aceitam intervalo de datas independente por fonte. Inclui indicadores provisórios de MVI CAD, MVI NEAC, CVP, tentativas, TCO, mandados, visitas, sossego, triagem doméstica, armas, drogas e guarnições, relatórios imprimíveis, relações paginadas, evolução e rankings, perfis MVI separados com faixas de horário, comparação conservadora CAD × NEAC e ficha original com navegação por versões. Inclui contas locais e prévia estática somente leitura com dados sintéticos. Não acessa CAD/Firebase nem publica dados operacionais.

## Requisitos

- Python 3.12 ou superior
- Node.js 20 ou superior

## Iniciar no Windows

Na pasta deste projeto, execute `scripts\iniciar-backend.cmd` e `scripts\iniciar-frontend.cmd` em dois terminais. Na primeira execução, os scripts criam o ambiente Python e instalam dependências gratuitas do PyPI/npm. A API fica em `http://127.0.0.1:8000/health`; a interface em `http://127.0.0.1:5173`. Crie a primeira conta administradora pela interface e importe as seis planilhas em `fixtures/synthetic/` para conferir os cartões e o gráfico. O administrador pode criar perfis de analista ou consulta; o perfil de consulta não importa arquivos.

Para criar um executável independente do ambiente de desenvolvimento, siga [o empacotamento Windows](docs/EMPACOTAMENTO_WINDOWS.md). O `GTB2-Local.exe` abre a interface e a API na mesma porta local e oferece comandos de backup e restauração dos dados do projeto novo.

### Ver a demonstração

Na pasta deste projeto, execute `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\iniciar-demonstracao.ps1` e abra `http://127.0.0.1:5173/` no mesmo computador. A prévia usa exclusivamente `fixtures/synthetic/` e seu banco fica em `data/demo/`, separado do banco local normal. Ela bloqueia importações via API e mostra um aviso de dados fictícios. As portas 8000 e 5173 precisam estar livres. Para encerrar apenas os processos iniciados pela demonstração, execute `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-demonstracao.ps1`. Os dados sintéticos permanecem em `data/demo/` para a próxima abertura.

Para gerar a prévia estática com as mesmas planilhas fictícias, execute `.venv\Scripts\python.exe scripts\export-demo-snapshot.py` e, na pasta `frontend`, defina `VITE_STATIC_DEMO=1` antes de `npm.cmd run build`. O resultado em `frontend/dist/` funciona sem API e bloqueia importações. `frontend/public/demo-data.json` contém somente dados sintéticos e é recriado pelo exportador. A prévia estática permite testar a interface; o backend completo permanece local.

A prévia privada da versão 0.1.52 foi publicada em `https://gtb-analise-criminal-v2-demo.gugatbarros628864.chatgpt.site`. Ela contém apenas a interface estática e 31 registros sintéticos; não recebe dados nem substitui o sistema antigo.

O código do projeto novo está em `https://github.com/gugatbarros-cmd/analise-criminal-gtb-v2`. A demonstração pública gratuita é publicada automaticamente pelo GitHub Pages em `https://gugatbarros-cmd.github.io/analise-criminal-gtb-v2/`. O workflow compila somente a interface estática e usa exclusivamente `frontend/public/demo-data.json`, que contém dados sintéticos.

Para conferir, execute `scripts\testar.cmd`. Se a instalação de pacotes estiver bloqueada, consulte `docs/ARQUITETURA.md` e rode ao menos `python -m compileall backend/src`. A verificação TypeScript depende da instalação das dependências do frontend. Para comparar seis amostras anonimizadas com totais oficiais sem publicá-las, siga [a comparação local](docs/COMPARACAO_REFERENCIA.md). Para copiar e restaurar **todos os dados do sistema novo**, siga [o procedimento local](docs/BACKUP_LOCAL.md). O backup antigo de um único banco DuckDB continua disponível em `scripts\restore-local.py`.

## Estado

Fases 2, 3, 4 e 5 em andamento: CSV/XLS/XLSX com versões, quarentena, backup antes do lote, filtros e indicadores provisórios. O arquivo bruto e o banco ficam em `data/`, ignorados pelo Git. A API oferece `/sources`, `/imports`, `/imports/{id}/divergences`, `/indicators/summary`, `/indicators/operations/{kind}/analysis` e `/records/{source}`. O upload usa `POST /imports/{source}` com corpo binário, cabeçalho `X-Filename` e `scope=partial|complete`. O limite é 64 MB. Arquivos completos sinalizam ausentes sem apagar registros. Quatro layouts fornecidos foram conferidos apenas no ambiente local; faltam duas fontes e os totais oficiais.

As regras foram extraídas do legado, mas não há paridade comprovada com bases reais. As seis fontes têm adaptadores e análises iniciais; armas, drogas e guarnições ainda exigem validação de layout e paridade oficial. A autenticação local usa senhas derivadas, sessões de oito horas e perfis; o backup integral valida os bancos antes da troca e invalida sessões restauradas. Ainda faltam validação do ambiente operacional, sincronização autorizada e detalhes completos do legado. Use apenas dados sintéticos até a análise das amostras anonimizadas. As decisões pendentes estão em `docs/DECISOES_PENDENTES.md`.

O [andamento por fase](docs/STATUS_IMPLEMENTACAO.md) também aparece na tela inicial. A estimativa atual é **88% concluído e 12% restante**; somente a Fase 1 está concluída. O [benchmark local](docs/BENCHMARKS.md) registra os ensaios sintéticos de 10 mil, 100 mil e um milhão de ocorrências.

O código antigo continua dois diretórios acima e na URL de produção. Seu backup de código está em `../legacy-v4.6.256-2026-10-22.bundle`. O bundle não contém dados privados do navegador nem exportação atual do Firestore.
