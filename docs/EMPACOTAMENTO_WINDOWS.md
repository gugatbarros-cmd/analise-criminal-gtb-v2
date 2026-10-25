# Executável local para Windows

O script `scripts\build-windows.ps1` compila a interface local e cria `dist\GTB2-Local.exe` com PyInstaller. O código é aberto e o empacotamento não usa serviço cobrado. A compilação requer Python 3.12+, Node.js, as dependências do projeto e, na primeira execução, internet para instalar o empacotador.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

Depois da compilação, abra `GTB2-Local.exe`. Ele escuta somente em `127.0.0.1:8000`, espera a API responder antes de abrir a interface no navegador e permite criar a primeira conta administradora na própria tela. Se uma instância do GTB já estiver funcionando, um novo clique apenas reabre a interface. Falhas de inicialização aparecem em uma janela e são registradas em `%LOCALAPPDATA%\GTB2\logs\launcher.log`. Por padrão, o banco, as contas e os arquivos importados ficam em `%LOCALAPPDATA%\GTB2\data`, fora da pasta temporária do executável. `GTB_DATA_DIR` pode apontar para outra pasta local. Feche o console ou pressione Ctrl+C para encerrar.

Para criar ou reparar o ícone da Área de Trabalho depois da compilação, execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\criar-atalho.ps1
```

Com o sistema fechado, os comandos abaixo criam e restauram um backup integral dos dados **do sistema novo**. O ZIP fica em `%LOCALAPPDATA%\GTB2\data\backups` e inclui banco, contas e arquivos brutos. Ele não é criptografado; guarde-o em mídia local protegida. Para restaurar, o ZIP precisa estar na pasta `backups` do mesmo diretório de dados.

```powershell
.\GTB2-Local.exe backup
.\GTB2-Local.exe restore "$env:LOCALAPPDATA\GTB2\data\backups\NOME_DO_BACKUP.zip"
```

O executável está em `dist/`, fora do Git e da prévia privada no Sites. Esta etapa verifica a execução e o backup do sistema novo em Windows; não substitui o backup de dados do legado nem a validação paralela com planilhas anonimizadas e totais oficiais.
