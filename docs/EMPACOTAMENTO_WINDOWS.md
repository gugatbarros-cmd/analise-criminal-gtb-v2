# Executável local para Windows

## Instalador Windows completo — 0.1.60

Distribua `dist/GTB2-Instalador-0.1.60.exe`. O assistente NSIS instala o executável independente, inicializador e comando de encerramento no perfil do usuário, cria atalhos e registra versão, ícone e desinstalador em Aplicativos do Windows. Não requer Python, Node.js nem privilégios de administrador. O desinstalador remove o programa e seus atalhos e preserva `%LOCALAPPDATA%/GTB2/data`, incluindo contas e importações. Feche as importações antes de atualizar.

Para compilar, execute `scripts/build-installer.ps1 -BuildApplication -Compiler CAMINHO/MAKENSIS.EXE`. O compilador NSIS é gratuito e não faz parte da instalação do usuário final. A opção antiga `Instalar-GTB2.cmd` continua como alternativa para desenvolvedores; o instalador EXE é a distribuição principal.

Depois da instalação, abra **Administração → Sincronização online**, conecte a conta autorizada do sistema antigo e acompanhe o status do primeiro envio. A conta local e a conta online são independentes; a senha local não é enviada ao Firebase.

O script `scripts\build-windows.ps1` compila a interface local e cria `dist\GTB2-Local.exe` com PyInstaller. O código é aberto e o empacotamento não usa serviço cobrado. A compilação requer Python 3.12+, Node.js, as dependências do projeto e, na primeira execução, internet para instalar o empacotador.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

Depois da compilação, abra `GTB2-Local.exe`. Ele escuta somente em `127.0.0.1:8000`, espera a API responder antes de abrir a interface no navegador e permite criar a primeira conta administradora na própria tela. Se uma instância do GTB já estiver funcionando, um novo clique apenas reabre a interface. Falhas de inicialização aparecem em uma janela e são registradas em `%LOCALAPPDATA%\GTB2\logs\launcher.log`. Por padrão, o banco, as contas e os arquivos importados ficam em `%LOCALAPPDATA%\GTB2\data`, fora da pasta temporária do executável. `GTB_DATA_DIR` pode apontar para outra pasta local. O executável abre sem console e registra mensagens no log local. Para encerrar o servidor antes de atualizar ou restaurar, aguarde o fim das importações e use o atalho **Encerrar GTB 2.0** ou execute `scripts\encerrar-gtb.ps1`. Fechar somente a janela da interface mantém o servidor ativo.

Para criar ou reparar o ícone da Área de Trabalho depois da compilação, execute o comando abaixo. O atalho chama `scripts\iniciar-gtb.ps1`, que inicia o executável em processo separado, aguarda a resposta local e então solicita ao Windows que abra o navegador. Se a inicialização falhar, ele mostra o motivo em uma janela.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\criar-atalho.ps1
```

Com o sistema fechado, os comandos abaixo criam e restauram um backup integral dos dados **do sistema novo**. O ZIP fica em `%LOCALAPPDATA%\GTB2\data\backups` e inclui banco, contas e arquivos brutos. Ele não é criptografado; guarde-o em mídia local protegida. Para restaurar, o ZIP precisa estar na pasta `backups` do mesmo diretório de dados.

```powershell
.\GTB2-Local.exe backup
.\GTB2-Local.exe restore "$env:LOCALAPPDATA\GTB2\data\backups\NOME_DO_BACKUP.zip"
```

O executável está em `dist/`, fora do Git e da prévia privada no Sites. Esta etapa verifica a execução e o backup do sistema novo em Windows; não substitui o backup de dados do legado nem a validação paralela com planilhas anonimizadas e totais oficiais.

## Instalação no perfil do usuário

Após gerar o executável, dê dois cliques em `Instalar-GTB2.cmd` ou execute `scripts\instalar-windows.ps1`. A instalação não exige administrador: copia o programa para `%LOCALAPPDATA%\Programs\GTB2`, cria atalhos na Área de Trabalho e no Menu Iniciar e abre o sistema. Atualizações substituem apenas o programa; banco, contas, planilhas brutas, backups e logs continuam em `%LOCALAPPDATA%\GTB2`.

O desinstalador remove os atalhos, mas preserva as bases por segurança. Ele nunca apaga automaticamente `%LOCALAPPDATA%\GTB2\data`.
