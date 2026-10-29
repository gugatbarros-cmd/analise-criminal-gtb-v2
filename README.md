# Análise Criminal GTB 2.0

Versão 0.1.61. Sistema local com instalador Windows completo e consulta online autenticada. O instalador inclui programa e inicializador, cria atalhos e registra a desinstalação em Aplicativos do Windows, preservando contas e bases nas atualizações.

Depois de instalar, entre com sua conta local e abra **Administração → Sincronização online**. Conecte o e-mail e a senha de administrador ou analista ativo do sistema antigo. O Firebase permanece no Spark, sem cobrança ou upgrade automático. A senha online não é guardada; o token de renovação é protegido pelo Windows DPAPI. Cada importação e mudança de versão agenda uma cópia consistente dos dados processados para `sharedBases/gtb2-online`, separada das bases do legado. Falhas mantêm os dados locais e tentam novamente em até cinco minutos. A página online consulta mudanças a cada minuto enquanto visível.

- Instalação: baixe `GTB2-Instalador-0.1.61.exe` em [Releases](https://github.com/gugatbarros-cmd/analise-criminal-gtb-v2/releases/tag/v0.1.61).
- Sistema online: https://gugatbarros-cmd.github.io/analise-criminal-gtb-v2/ — usa as contas já autorizadas no sistema antigo.
- Demonstração fictícia: https://gugatbarros-cmd.github.io/analise-criminal-gtb-v2/?demo=1 — sem importações reais.

Arquivos originais, backups, contas locais, quarentena e divergências permanecem locais. Tabelas processadas, análises e histórico MVI são consultáveis online depois do primeiro envio. Nenhum dado real entra no Git ou nos arquivos públicos do GitHub Pages. Veja [sincronização](docs/SYNC_LOCAL.md) e [instalador](docs/EMPACOTAMENTO_WINDOWS.md).

## Requisitos

- Python 3.12 ou superior
- Node.js 20 ou superior

## Iniciar no Windows

Na pasta deste projeto, execute `scripts\iniciar-backend.cmd` e `scripts\iniciar-frontend.cmd` em dois terminais. Na primeira execução, os scripts criam o ambiente Python e instalam dependências gratuitas do PyPI/npm. A API fica em `http://127.0.0.1:8000/health`; a interface em `http://127.0.0.1:5173`. Crie a primeira conta administradora pela interface e importe as seis planilhas em `fixtures/synthetic/` para conferir os cartões e o gráfico. O administrador pode criar perfis de analista ou consulta; o perfil de consulta não importa arquivos.

Para criar um executável independente do ambiente de desenvolvimento, siga [o empacotamento Windows](docs/EMPACOTAMENTO_WINDOWS.md). O `GTB2-Local.exe` abre a interface e a API na mesma porta local e oferece comandos de backup e restauração dos dados do projeto novo.

O instalador pronto fica em **Releases**. Baixe e execute `GTB2-Instalador-0.1.61.exe`; não é necessário extrair ZIP nem executar comandos. A instalação não exige privilégios administrativos e preserva os dados locais durante atualizações.

### Ver a demonstração

Na pasta deste projeto, execute `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\iniciar-demonstracao.ps1` e abra `http://127.0.0.1:5173/` no mesmo computador. A prévia usa exclusivamente `fixtures/synthetic/` e seu banco fica em `data/demo/`, separado do banco local normal. Ela bloqueia importações via API e mostra um aviso de dados fictícios. As portas 8000 e 5173 precisam estar livres. Para encerrar apenas os processos iniciados pela demonstração, execute `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-demonstracao.ps1`. Os dados sintéticos permanecem em `data/demo/` para a próxima abertura.

Para gerar a prévia estática com as mesmas planilhas fictícias, execute `.venv\Scripts\python.exe scripts\export-demo-snapshot.py` e, na pasta `frontend`, defina `VITE_STATIC_DEMO=1` antes de `npm.cmd run build`. O resultado em `frontend/dist/` funciona sem API e bloqueia importações. `frontend/public/demo-data.json` contém somente dados sintéticos e é recriado pelo exportador. A prévia estática permite testar a interface; o backend completo permanece local.

A prévia privada anterior, versão 0.1.55, está em `https://gtb-analise-criminal-v2-demo.gugatbarros628864.chatgpt.site`. Ela contém apenas a interface estática e 31 registros sintéticos. Para a distribuição atual, utilize o pacote da página Releases e a demonstração do GitHub Pages.

O código está em `https://github.com/gugatbarros-cmd/analise-criminal-gtb-v2`. O GitHub Actions publica automaticamente a interface no GitHub Pages ao atualizar `main`. O endereço principal exige autenticação para consultar as bases sincronizadas no Firestore; `?demo=1` abre exclusivamente `frontend/public/demo-data.json`, com exemplos fictícios. Os arquivos públicos nunca contêm dados reais.

Para conferir, execute `scripts\testar.cmd`. Se a instalação de pacotes estiver bloqueada, consulte `docs/ARQUITETURA.md` e rode ao menos `python -m compileall backend/src`. A verificação TypeScript depende da instalação das dependências do frontend. Para comparar seis amostras anonimizadas com totais oficiais sem publicá-las, siga [a comparação local](docs/COMPARACAO_REFERENCIA.md). Para copiar e restaurar **todos os dados do sistema novo**, siga [o procedimento local](docs/BACKUP_LOCAL.md). O backup antigo de um único banco DuckDB continua disponível em `scripts\restore-local.py`.

## Estado

A implementação funcional está 100% concluída. A validação operacional está em 90% porque ainda depende das duas bases restantes, dos totais oficiais e da operação paralela com o legado. Esses itens podem ser adicionados depois pelo fluxo de importação e não impedem o uso desta versão. Fases 2, 3, 4 e 5 permanecem em validação: CSV/XLS/XLSX com versões, quarentena, backup antes do lote, filtros e indicadores provisórios. O arquivo bruto e o banco ficam em `data/`, ignorados pelo Git. A API oferece `/sources`, `/imports`, `/imports/{id}/divergences`, `/indicators/summary`, `/indicators/operations/{kind}/analysis` e `/records/{source}`. O upload usa `POST /imports/{source}` com corpo binário, cabeçalho `X-Filename` e `scope=partial|complete`. O limite é 64 MB. Arquivos completos sinalizam ausentes sem apagar registros. Quatro layouts fornecidos foram conferidos apenas no ambiente local; faltam duas fontes e os totais oficiais.

As regras foram extraídas do legado, mas não há paridade comprovada com bases reais. As seis fontes têm adaptadores e análises iniciais; armas, drogas e guarnições ainda exigem validação de layout e paridade oficial. A autenticação local usa senhas derivadas, sessões de oito horas e perfis; o backup integral valida os bancos antes da troca e invalida sessões restauradas. Ainda faltam validação do ambiente operacional, conexão operacional ao Firebase e detalhes completos do legado. Use apenas dados sintéticos até a análise das amostras anonimizadas. As decisões pendentes estão em `docs/DECISOES_PENDENTES.md`.

O [andamento por fase](docs/STATUS_IMPLEMENTACAO.md) também aparece na tela inicial. A implementação funcional está **100% concluída** e a validação operacional está **90% concluída, com 10% dependente das bases e conferências futuras**; as Fases 0 e 1 estão concluídas. O [benchmark local](docs/BENCHMARKS.md) registra os ensaios sintéticos de 10 mil, 100 mil e um milhão de ocorrências.

O código antigo continua dois diretórios acima e na URL de produção. Seu backup de código está em `../legacy-v4.6.256-2026-10-22.bundle`. O bundle não contém dados privados do navegador nem exportação atual do Firestore.
