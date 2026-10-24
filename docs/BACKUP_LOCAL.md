# Backup integral local do GTB 2.0

Esta rotina copia somente os dados **do projeto novo**: `data/gtb.duckdb`, `data/auth.sqlite3` e `data/raw/`. O sistema antigo e o Firebase não são acessados. O ZIP contém um manifesto com tamanho e SHA-256 de cada arquivo; a restauração confere tudo antes de alterar os dados.

1. Pare a API e qualquer programa que esteja usando `data/gtb.duckdb`.
2. Na pasta do projeto novo, execute `.venv\Scripts\python.exe scripts\backup-local.py`.
3. Guarde o ZIP de `data/backups/` em mídia local sob sua responsabilidade. Ele contém planilhas e dados de contas e **não é criptografado**. Não envie esse arquivo para Git, Sites ou serviços externos.
4. Para restaurar, mantenha a API parada e execute `.venv\Scripts\python.exe scripts\restore-all-local.py data\backups\<arquivo>.zip`.
5. A rotina confere os hashes e a estrutura dos bancos antes da troca, cria um novo ZIP do estado anterior quando há dados e substitui o banco, as contas e os arquivos brutos pelo conteúdo do backup. As contas são preservadas, mas as sessões restauradas são invalidadas: entre novamente com a senha. Ela mostra o caminho da cópia anterior.

É possível definir `GTB_DATA_DIR` para trabalhar em um diretório local de testes separado. O ZIP de restauração precisa estar dentro de `backups/` desse diretório. Cópias de um único DuckDB feitas antes de importações continuam compatíveis com `scripts/restore-local.py`, mas não incluem contas nem arquivos brutos.

No executável Windows, o diretório padrão é `%LOCALAPPDATA%\GTB2\data`. Os comandos `GTB2-Local.exe backup` e `GTB2-Local.exe restore <caminho-do-zip>` executam o mesmo backup integral sem exigir Python instalado. Feche a interface antes dos dois comandos. Veja [Empacotamento Windows](EMPACOTAMENTO_WINDOWS.md).
