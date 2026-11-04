# Andamento da implantação — 04/11/2026

## Geração individual de relatórios — 0.1.73

A Central de Relatórios abre sem consultar o conjunto completo de dados. O clique em um modelo gera sua prévia e inicia a consulta somente se os dados ainda não estiverem disponíveis; o resumo CSV consulta os dados ao ser solicitado. Uma importação invalida o cache e fecha prévias antigas para que a geração seguinte use os dados atualizados. O carregamento mostra o relatório em andamento. A implementação funcional permanece 100% concluída; a validação operacional permanece 90% concluída e 10% restante para conferência oficial das bases.

## Informe MVI NEAC para o Comando — 0.1.72

A Central de Relatórios gera um informe MVI NEAC com síntese para o Comando, evolução mensal, distribuição por município, classificações, perfil, cobertura de horários, relação auditável e memória da fonte. O botão de impressão permite salvar o documento em PDF. A mesma prévia oferece um texto agregado para WhatsApp, com link de compartilhamento e opção de copiar, sem nomes de vítimas nem números de ocorrência. O recorte respeita os filtros do relatório e usa exclusivamente vítimas elegíveis NEAC; CAD não é somado. A implementação funcional permanece 100% concluída; a validação operacional permanece 90% concluída e 10% restante para conferência oficial das bases.

## Central de Acesso e saudação — 0.1.71

A administração local ganhou a Central de Acesso, mantendo os perfis Administrador, Analista e Consulta. Novas senhas podem ter 8 a 256 caracteres e devem incluir letra maiúscula, letra minúscula e caractere especial; as contas antigas continuam válidas, pois a verificação de login usa a hash já armazenada. A entrada e a área principal mostram Bom dia, Boa tarde ou Boa noite conforme o relógio local, junto à data. A implementação funcional permanece 100% concluída; a validação operacional permanece 90% concluída e 10% restante para as conferências oficiais das bases.

## Carregamento dos relatórios sob demanda — 0.1.70

A Central de Relatórios e seu conjunto completo de dados são carregados somente quando a área é aberta pelo menu ou pelo botão da própria seção. O relatório detalhado do painel e os relatórios especializados também têm módulos separados e só carregam após o comando de geração. A página inicial mantém os indicadores e a navegação, sem iniciar a consulta de dados dos relatórios. O teste no navegador confirmou zero módulos da Central na abertura e carregamento após o clique no menu; os 50 testes de interface passaram. O instalador 0.1.70 foi aplicado e a aplicação instalada respondeu na mesma versão, preservando os arquivos locais de banco e contas. A implementação funcional permanece 100% concluída; a validação operacional permanece 90% concluída e 10% restante para as conferências oficiais das bases.

## Última atualização sob cada indicador — 0.1.69

Os cartões da Visão Executiva mostram a data da última importação concluída da fonte usada no cálculo. MVI CAD e NEAC são independentes; CVP, tentativas, TCO, mandados, visitas, sossego e violência doméstica seguem a base de ocorrências. Armas e drogas usam suas bases específicas quando disponíveis e a base geral no modo alternativo. A data vem do histórico completo de lotes, sem depender da página atual da auditoria ou dos filtros do painel. Sem lote, o cartão indica ausência de importação. A suíte passou com 111 testes de backend e 50 de interface; o instalador 0.1.69 foi aplicado e respondeu com a versão 0.1.69, preservando os arquivos locais de banco e contas. A implementação funcional permanece 100% concluída; a validação operacional permanece 90% concluída e 10% restante para as conferências oficiais das bases.

## Barra de andamento da importação CAD — 0.1.68

A tela local mostra uma barra e o percentual das etapas confirmadas, da abertura do CAD à gravação do lote. Durante a seleção das colunas, o percentual acompanha a quantidade transferida. A gravação no banco mantém o progresso abaixo de 100% até ser confirmada. Testes sintéticos verificam o contrato de progresso, a monotonicidade e a atualização ao selecionar colunas. O instalador 0.1.68 foi aplicado; a aplicação instalada respondeu com a versão 0.1.68 e os arquivos locais de banco e contas foram preservados. Implementação funcional: 100%; validação operacional: 90% concluída e 10% restante para as conferências oficiais das bases.

## Importação alternativa do CAD no sistema local — 0.1.67

O GTB 2.0 oferece uma segunda entrada para a base de ocorrências: consulta autorizada no CAD com intervalo escolhido, Polícia Militar e 10º BPM, seleção de todas as colunas, exportação XLS, validação e importação parcial auditável. A autenticação e o token são temporários; o arquivo fica no computador, fora do Git. O importador manual permanece disponível.

Os testes sintéticos cobrem a validação das datas, o controle de acesso e o contrato da API. A execução completa pela nova tela foi confirmada localmente, inclusive o download e o registro do lote, sem incluir dados reais neste repositório. O instalador 0.1.67 foi executado e a aplicação instalada respondeu com a versão 0.1.67; o banco local foi preservado. Implementação funcional: 100%; validação operacional: 90% concluída e 10% restante, incluindo a conferência oficial das bases.

## Comparativos em todos os indicadores — 0.1.66

Cada indicador oferece três modos: totais entre dois anos, dois intervalos personalizados e os doze meses de cada ano lado a lado. Seletores próprios permitem escolher os anos, a classificação e as medidas pertinentes. O município acompanha o filtro do painel; filtros das outras análises permanecem independentes e essa diferença aparece no quadro. Os comparativos incluem ocorrências, MVI CAD e NEAC separadamente, CVP, tentativas, TCO, mandados, visitas, sossego, violência doméstica, armas, drogas e guarnições.

Tabelas mostram diferença absoluta e percentual de B em relação a A; referência zero não gera infinito. A visão mensal também calcula a diferença e o percentual de cada mês em relação ao mês anterior na série de cada ano, incluindo dezembro do ano anterior como referência para janeiro quando importado. Ausência de registros da fonte é distinta de zero do indicador. Os totais são dos dados importados, com aviso de que meses e anos podem estar incompletos. O atalho de períodos equivalentes usa a última data registrada da fonte no ano B e ajusta 29/02; durações diferentes são explicitadas. Gráficos mensais se ajustam à largura e mantêm os valores completos na tabela. O CSV exporta medida, município, classificação, períodos e variações.

Armas somam unidades apreendidas. Drogas permitem registros ou kg reconhecidos, com cobertura do peso. Guarnições separam escala, força-tarefa e outros recursos e permitem vínculos ou pontos. A consulta autenticada usa uma projeção diária sem vítimas, ocorrências identificadas, relatos, policiais ou arquivos originais, disponível também ao perfil de consulta. Relatórios completos continuam exclusivos de administradores. A projeção é sincronizada no mesmo documento privado já autorizado; nenhuma base real é publicada no site público.

Validação da entrega: suíte de backend com 105 casos, 49 testes da interface, Ruff e as 102 verificações do projeto legado. Ensaio do executável com bases exclusivamente sintéticas de 2025 e 2026 confirmou os 13 destinos, totais e variações, doze meses, comparação com o mês anterior, intervalos inválidos, CSV, navegação por clique/teclado e larguras de 320, 390, 768 e 1440 px. As imagens do comparativo no computador e celular foram inspecionadas. A instalação preserva o banco e as contas, verificados por SHA-256.

Progresso funcional: 100% do escopo implementado. Validação operacional: 90% concluída e 10% restante, dependente da conferência oficial das bases. Firebase permanece Spark, sem novos serviços ou cobrança.

## Central de relatórios do legado — 0.1.65

O menu Relatórios e apresentações abre uma central com documentos executivos, folder, consolidado, institucional, painel geral, MVI CAD e NEAC, conferência entre fontes, CVP, tentativas, TCO, mandados, visitas, sossego, armas, drogas, violência doméstica, guarnições, horários críticos e planejamento. A prévia usa o recorte escolhido e permite imprimir/salvar PDF, exportar CSV e XLSX. O resumo CSV do painel também está disponível. Tabelas conservam todas as categorias; gráficos de ranking destacam oito categorias com indicação explícita, e séries temporais mantêm todos os períodos.

O editor temático de violência doméstica reaproveita os vetores, arte, paginação e exportação PowerPoint editável do legado. O tabuleiro original de planejamento foi isolado em sua própria página, com cenários privados no navegador, PDF e PNG esquemático. Bibliotecas e imagens são locais; mapas de ruas mantêm as camadas gratuitas já usadas no legado. Nenhuma base, conta ou cenário real é copiado para arquivos públicos.

Os relatórios recebem uma projeção de campos processados e decisões de inclusão já armazenadas. Não há nova classificação automática de ocorrências nem soma entre CAD e NEAC. A projeção exclui relatos, telefones e endereços completos. Importações invalidam a consulta dos relatórios e alterações dos dados fecham prévias antigas, evitando exportar números diferentes da tela. A sincronização autenticada inclui a projeção; snapshots anteriores exibem orientação para atualizar o sistema local. Somente administradores geram relatórios, como no legado, e o encerramento da sessão fecha o editor temático.

Comparações usam períodos equivalentes, com ajuste de 29/02 para o ano anterior e indicação de data de corte. Unidades, registros, peso e pontos têm medidas distintas. Datas/horários e perfis ausentes permanecem identificados. Conferências exatas de MVI são sugestões para revisão; ambiguidades não recebem vínculo automático. A conferência não importa decisões manuais de vínculo do legado.

Validação automatizada: 103 testes de backend, 44 de interface, Ruff, compilação TypeScript/Vite e 102 verificações do legado aprovados. No executável, o navegador criou os 21 PDFs e baixou XLSX com quatro abas, PowerPoint com 22 slides editáveis e PNG do tabuleiro, usando exclusivamente dados sintéticos. Também foram verificados cadastro, saída, nova entrada, atualização após importação, navegação e larguras de 320, 390 e 768 px. Respostas iniciadas antes do commit de uma importação são canceladas antes da nova consulta; dados privados são limpos ao sair e consultas do painel usam a sessão na chave, preservando somente a verificação pública de saúde. O instalador registrou 0.1.65 e preservou os hashes do banco e das contas. A projeção dos dados existentes foi conferida em leitura, sem alterar o arquivo original.

Implementação funcional: 100% do escopo inicial. Validação operacional: 90% concluída e 10% restante; a paridade oficial dos números e a cobertura das bases ainda exigem conferência. [Inventário dos modelos](RELATORIOS_LEGADO.md).

## Ícones dos indicadores e menu — 0.1.64

Os quadros da Visão Executiva recebem figuras vetoriais próprias: caveira em MVI CAD/NEAC, cannabis em drogas, peso no total em kg, arma em apreensões, saco de valores em CVP, coração com pulso em tentativas, escudo com casa em violência doméstica, martelo em mandados, casa com pessoa em visitas, documento conferido em TCO e alto-falante em sossego. As figuras usam traços e preenchimentos discretos, com cores por assunto e nitidez em telas de qualquer densidade.

Todos os itens do menu lateral substituem as siglas por ícones, incluindo guarnições, municípios, planejamento, inteligência, relatórios, importação, perfil, acesso e sincronização. O menu recolhido mantém figuras e títulos; a navegação por clique e teclado permanece disponível. Os desenhos são locais, funcionam sem conexão e não acrescentam serviços ou cobranças. Rótulos acessíveis continuam nos botões e os SVGs são decorativos, evitando leitura duplicada.

Implementação funcional: 100% do escopo inicial; validação operacional: 90% concluída e 10% restante, com conferência oficial das bases ainda pendente. Validação desta entrega: 39 testes de interface, quatro testes de saúde/versão da API, Ruff e 102 verificações do legado aprovados; compilação TypeScript/Vite concluída. O executável foi conferido em navegador com importações sintéticas, ícones nos 13 quadros e em todos os itens do menu, navegação por clique e teclado e larguras de 320, 390, 768 e 1440 px. As imagens de computador e celular foram inspecionadas. A instalação real registrou a versão 0.1.64 e manteve os hashes do banco e das contas idênticos.

## Modelo NEAC/MDX — 0.1.63

Leitura de XLS, XLSX e CSV do modelo com Cidade, Bairro, colunas auxiliares, Dia/Mês/Ano, Data, Hora, Nome Vítima, Idade/Sexo, Instrumento e Subjetividade Complementar. A data pode estar na coluna auxiliar adjacente; quando não informada, só é composta com dia, mês e ano válidos. Dia isolado não é tratado como serial Excel. Divergência entre ano e data exige revisão. Colunas sem nome com conteúdo são preservadas por posição, incluindo o campo adjacente ao IML; IML não é usado como identificador da vítima.

O adaptador NEAC 0.1.19 reconhece Subjetividade Complementar como classificação e o bairro auxiliar no contexto de identificação. Mantém CAD e NEAC separados e preserva as regras atuais de elegibilidade. Vítimas sem identidade confiável ficam em quarentena; naturezas fora da regra permanecem armazenadas sem compor o indicador.

Uma atualização com backup e transação corrige datas, classificação e chaves derivadas dos registros desse modelo já importados. Todas as versões e valores brutos são preservados. Colisões de identidade canônica são unificadas como versões, sem duplicar a vítima corrente. Outros layouts e fontes são preservados. Arquivos processados por adaptador anterior podem ser reimportados, e a nova leitura continua idempotente.

O modelo fornecido foi validado localmente, sem importá-lo em produção nem publicá-lo. Uma cópia privada do banco confirmou a recuperação dos anos corretos, com dados brutos e outras fontes idênticos. Arquivos e resultados reais permanecem locais; os testes versionados usam apenas exemplos sintéticos. Implementação funcional permanece em 100%; validação operacional em 90% concluída e 10% restante.

Validação: 101 testes do backend, 39 testes da interface, Ruff e 102 verificações do legado aprovados. Os testes do modelo cobrem XLS, XLSX e CSV, anos coexistentes, quarentena, conflito de datas, reimportação e migração com preservação de histórico e fontes independentes. O executável compilado passou por importações sintéticas e navegação dos 13 destinos, com responsividade em 320, 390, 768 e 1440 px. O instalador foi executado e preservou os hashes do banco e das contas; a migração posterior confirmou backup e igualdade dos originais e das outras fontes na instalação local. A conta online já está conectada; esta atualização solicita automaticamente uma nova sincronização.

## Brasão do sistema na distribuição Windows — 0.1.62

O brasão existente é convertido em ICO com sete resoluções (16 a 256 px), preservando sua imagem e transparência. O build incorpora esse ícone ao executável; o instalador e desinstalador recebem o mesmo brasão, e os atalhos usam o ICO instalado. O navegador também usa o brasão como favicon. A geração usa bibliotecas do próprio Windows, sem novo serviço ou dependência paga.

A configuração local foi inspecionada: não existe credencial Firebase conectada. A sincronização automática continua disponível, mas o envio real ainda depende de login em Administração → Sincronização online. Nenhum dado real foi colocado no Git ou na demonstração pública. Implementação funcional: 100% do escopo inicial; validação operacional: 90% concluída e 10% restante, sem novas fases declaradas concluídas.

Validação: 39 testes de interface, 11 testes de saúde/sincronização e 102 verificações do legado aprovados. O Windows reconheceu o ICO; os ícones foram extraídos dos executáveis do programa e do instalador e conferidos visualmente. O instalador foi executado e os atalhos e o registro de Aplicativos apontam para o brasão. Banco e contas mantiveram hashes idênticos após a instalação.

## Gráficos navegáveis e responsivos — 0.1.61

Gráficos de barras, linhas e anéis abrem a análise do indicador, mantendo filtros, foco e menu ativo. No gráfico mensal comparativo, barras e legendas de CAD/NEAC selecionam explicitamente a fonte; botões equivalentes oferecem acesso pelo teclado. Tabelas de conferência ficam fora dos botões dos gráficos. Relatórios sem destino de navegação continuam somente para consulta/impressão.

As grades se ajustam à largura disponível, as linhas medem o contêiner e distribuem rótulos para evitar sobreposição em telas pequenas; anéis, legendas e barras respeitam o contêiner. O gráfico ECharts acompanha o redimensionamento e contém seu tooltip. Implementação funcional permanece em 100%; validação operacional em 90% concluída e 10% restante, sem declarar novas fases concluídas.

Validação: 39 testes de interface, quatro testes de saúde/versão da API e 102 verificações do legado aprovados. No executável, o navegador real importou seis fontes sintéticas e confirmou os 13 destinos dos gráficos, clique físico na barra CAD, teclado, filtros e ajuste dos contêineres/escala em 320, 390, 768 e 1440 px. A imagem do gráfico CVP no celular foi conferida. O site compilado aprovou o clique de gráfico com autenticação Firebase simulada, atualização e logout sem erros de redimensionamento.

## Instalador completo e consulta online autenticada — 0.1.60

Instalador EXE com assistente em português, instalação no perfil do Windows, atalhos, registro em Aplicativos e desinstalação que preserva dados. A interface online passa a exigir conta autorizada no Firebase existente; a demonstração fictícia continua em `?demo=1`.

Sincronização configurável pela administração local. Mudanças de versão e importações enviam uma cópia consistente e comprimida de tabelas processadas, análises e histórico MVI; originais, contas, quarentena e divergências ficam locais. Publicação atômica com verificação de concorrência, hashes, credencial protegida por DPAPI, retomada após falha e cotas gratuitas sem upgrade. A página visível consulta o manifesto a cada minuto. A interface continua publicada automaticamente pelo GitHub Actions ao atualizar `main`.

Implementação funcional: 100% do escopo inicial. Validação operacional: 90% concluída e 10% restante. O primeiro envio real depende da conexão da conta Firebase pela interface local; não declarar a sincronização operacional concluída antes de validá-la.

Validações da entrega: suíte backend aprovada e sete testes específicos de sincronização/DPAPI/atomicidade/transporte aprovados; 38 testes de interface aprovados. O executável passou pelo navegador real com cadastro, login, importação e navegação dos 13 quadros. O site compilado passou por login, autorização, troca de geração, recarga e logout com Firebase simulado. Instalação, desinstalação e reinstalação reais verificaram o registro em Aplicativos do Windows e hashes idênticos para banco e contas. Uma cópia local das bases atuais confirmou os totais dos recortes e o limite de tamanho, sem envio remoto. A validação do legado concluiu 102 verificações sem erro.

## Navegação pelos quadros indicadores — 0.1.59

Os 13 quadros da Visão Executiva são botões acessíveis: clique, Enter ou Espaço levam à análise correspondente, com foco no destino, item do menu ativo e endereço identificando o indicador. Os quadros de MVI CAD e NEAC selecionam explicitamente sua própria fonte. Ocorrências abre os gráficos gerais; os dois quadros de drogas abrem a análise de drogas. Os filtros existentes são preservados e o botão Voltar do navegador restaura a análise anterior. A implementação funcional permanece em 100% do escopo inicial e a validação operacional em 90% concluída e 10% restante; nenhuma fase adicional foi declarada concluída.

Validação: 35 testes de interface e 4 testes do serviço de saúde aprovados. Ensaio do executável com navegador real e dados sintéticos aprovou os 13 destinos, seleção CAD/NEAC, preservação do ano, Enter, Espaço, Voltar e apresentação no celular. A instalação preservou os hashes do banco local e das contas de acesso.

## Aproximação visual e numérica do legado — 0.1.58

O painel inicia em 2026, usa os 11 municípios do 10º BPM e apresenta ocorrências, armas apreendidas em unidades, quantidade de registros de drogas e peso convertido separadamente. A fiscalização isolada de medida protetiva permanece registrada e auditável, mas fica fora dos totais operacionais da Visão Executiva. A cobertura informa quantos registros estão importados em cada fonte, para distinguir base ausente de ausência de casos no período.

Foram acrescentados gráficos gerais por mês, município e natureza; gráficos CVP e tentativas; linhas temporais, distribuições territoriais e anéis de classificação nas análises MVI, TCO, mandados, visitas, sossego, doméstica, armas, drogas e guarnições que utilizavam apenas rankings. Os gráficos preservam os valores de origem e oferecem tabela para conferência. CAD e NEAC continuam independentes. A demonstração usa somente dados sintéticos.

Os testes verificam igualdade entre soma dos gráficos e cartões no mesmo recorte, municípios, ano, observação excluída, unidades de armas, pesos sem unidade conhecida e independência entre fontes MVI. Esta entrega não declara identidade total com o legado: filtros detalhados, mapas, relatórios completos e conferência dos totais sobre as mesmas bases ainda exigem validação. A implementação funcional permanece em 100% do escopo inicial; a validação operacional continua em 90% concluída e 10% restante, sem novas fases aceitas como concluídas.

As colunas narrativas próprias do CAD, como Texto do Despachante, Texto para Divulgação, Boletim Resumido e Tipo do Despacho no Geral, participam das regras de tentativas e ações. A triagem doméstica foi alinhada à regra 4 do classificador do legado, inclusive negativas no relato, conflitos de perfil e identificação do sexo vinculada ao papel de vítima. A revisão dos dados derivados é transacional, em lote e precedida de backup; os registros originais e suas versões permanecem intactos.

Sem base específica de armas ou drogas, o painel reproduz a pesquisa textual na base geral, identificada como **ocorrências com menção**. Esse número não é apresentado como unidades apreendidas ou peso conhecido. Nomes e contatos isolados não confirmam uma visita; por isso uma correspondência antiga apenas no solicitante pode divergir. A auditoria de comparação operacional fica somente no computador, fora do Git e da demonstração.

## Correção do executável 0.1.57

A API rejeitava a origem da própria interface embutida, `http://127.0.0.1:8000`, inclusive nos pedidos dos arquivos JavaScript e CSS. O navegador recebia HTTP 403 antes de renderizar a tela, deixando a janela vazia. Cadastro, login e importação também eram rejeitados. O teste de disponibilidade da versão anterior não exercitava esse fluxo. A versão 0.1.57 aceita somente as origens locais previstas, nas portas 8000 e 5173, e mantém bloqueadas as origens externas. A logomarca da tela de login também pode ser carregada antes da autenticação. Novos testes exercitam os recursos estáticos, cadastro, login, importação sintética, indicador e encerramento da sessão com a origem real do executável.

Validação: 83 testes do backend, 31 testes da interface, Ruff e TypeScript/Vite aprovados. O teste `node scripts/test-desktop-browser.mjs` abre o executável compilado e o Chrome com perfil e banco isolados; passou por cadastro, saída, novo login, logomarca, pré-validação, importação e CVP. A repetição desse teste com o executável 0.1.56 instalado reproduziu os HTTP 403 do JavaScript e CSS e a tela vazia. O backup das bases locais do usuário foi criado antes da atualização.

A implementação funcional permanece em 100%. O progresso operacional permanece em 90% concluído e 10% restante; as bases restantes serão adicionadas posteriormente, sem impedir esta correção nem marcar conferências oficiais como concluídas.

**90% concluído · 10% restante na validação operacional.** A implementação funcional foi finalizada nas **Fases 0 e 1**. A versão 0.1.56 lê as exportações XLS antigas do CAD e mantém a fila local bloqueada até autorização de sincronização. As bases restantes poderão ser adicionadas depois pelo fluxo normal de importação; o backend novo permanece local e o sistema antigo segue em produção durante a conferência.

A prévia estática privada anterior, versão 0.1.55, está em `https://gtb-analise-criminal-v2-demo.gugatbarros628864.chatgpt.site`. A distribuição atual usa Releases e GitHub Pages. As demonstrações contêm apenas registros sintéticos, sem backend, banco DuckDB ou dados operacionais.

A interface 0.1.56 usa a moldura institucional do legado 4.6.256: logomarca do 10º BPM, cabeçalho operacional, menu lateral recolhível, busca de funções e os mesmos grupos e nomes de menus. Todos os itens do menu possuem destino funcional. O item Uso do Firebase apresenta o estado real da arquitetura local e confirma que o sistema novo não envia dados ao Firebase.

A importação local 0.1.56 está liberada para bases reais no executável. Antes de habilitar a gravação, o sistema exige uma pré-validação que lê CSV/XLS/XLSX sem guardar o arquivo e apresenta linhas aceitas, fora da regra e em quarentena com os principais motivos. A importação confirmada preserva o arquivo bruto apenas no computador, cria backup automático do banco anterior ao lote e mantém histórico e auditoria. As prévias online continuam somente leitura e nunca recebem bases reais.

O pacote Windows 0.1.56 inclui instalação sem privilégios administrativos em `%LOCALAPPDATA%\Programs\GTB2`, atalhos na Área de Trabalho e no Menu Iniciar e atualização segura do programa sem remover banco, contas, arquivos brutos, backups ou logs.

A implementação funcional está 100% concluída e foi empacotada para distribuição. O pacote `GTB2-0.1.56.zip` inclui o executável, o instalador e os scripts de inicialização e desinstalação. A validação operacional permanece em 90%; os 10% restantes dependem somente das bases, totais oficiais e operação paralela que serão fornecidos depois.

A versão 0.1.56 acrescenta a tabela geral consolidada e paginada das seis fontes, preservando a identificação de origem em vez de fundir casos; pesquisa por ocorrência, vítima, natureza ou classificação; painel de municípios com contagens separadas por fonte; e perfil local acessível a todos os papéis. Esses módulos funcionam tanto no executável quanto na demonstração sintética.

Soluções IA e Stiven agora abrem um assistente guiado inteiramente local. Ele responde sobre resumo, disponibilidade das seis bases, municípios, MVI, CVP, TCO e violência doméstica usando apenas agregados já calculados, bloqueia consultas individuais e não envia perguntas ou dados para serviços externos.

| Fase | Situação | Entregas | Progresso da fase | Peso no projeto |
| --- | --- | ---: | ---: | ---: |
| 0 — Inventário do legado | Concluída | 4/4 | 100% | 5% |
| 1 — Base local | Concluída | 4/4 | 100% | 10% |
| 2 — Importação e histórico | Em andamento | 4/5 | 80% | 20% |
| 3 — MVI CAD e NEAC | Em andamento | 9/10 | 90% | 25% |
| 4 — Demais módulos | Em andamento | 19/20 | 95% | 30% |
| 5 — Preparação para troca | Em andamento | 4/5 | 80% | 10% |

O cálculo soma `peso × entregas concluídas ÷ entregas planejadas` e arredonda o resultado total ao inteiro mais próximo: **90%**. O restante é `100 − 90 = 10%`. Os pesos refletem uma estimativa de esforço, não uma previsão de prazo. Uma fase só aparece como concluída quando todas as suas entregas foram implementadas e verificadas. O arquivo usado pela tela é [`frontend/src/project-progress.json`](../frontend/src/project-progress.json).

## Critérios restantes

O código da versão 0.1.56 possui publicação separada no GitHub. O GitHub Pages entrega apenas a demonstração estática com dados sintéticos e custo zero; bancos, planilhas, credenciais, logs e executáveis continuam excluídos do repositório.

O executável 0.1.56 usa um inicializador supervisionado no atalho da Área de Trabalho: inicia o processo separadamente, aguarda a API ficar pronta, solicita ao Windows a abertura do navegador, reabre uma instância existente e mostra erros numa janela com registro local. O atalho pode ser recriado pelo script versionado.

Na versão 0.1.56, a abertura visível foi reforçada nos dois caminhos de uso: o atalho instalado e o clique direto no executável solicitam explicitamente ao Windows a abertura de `http://127.0.0.1:8000`, com alternativa pelo navegador padrão e registro em `%LOCALAPPDATA%\GTB2\logs\launcher.log`.

A versão 0.1.56 abre a interface local prioritariamente em uma janela própria do Microsoft Edge (`--app`), evitando redirecionamentos, restauração de abas e associações defeituosas do navegador padrão. Se o Edge não estiver disponível, permanecem as alternativas do Windows e do navegador padrão.

Em 25/10/2026, quatro layouts fornecidos foram importados numa base local isolada: armas, drogas, envolvidos CAD e ocorrências. Os arquivos e seus dados não entraram no Git nem na prévia web. A leitura estrutural passou; a planilha de envolvidos manteve 13 linhas em quarentena para revisão conservadora. Faltam as duas fontes restantes e totais oficiais para comprovar paridade.

- **Fase 0:** os filtros principais de 12 áreas estão registrados no inventário e o contrato de indicadores do legado foi identificado. Faltam fluxos completos, gráficos, exportações, dependências de todas as abas e desempenho de referência do legado.
- **Fase 2:** ensaios sintéticos de 10 mil, 100 mil e um milhão de linhas passaram. A carga de um milhão em dez lotes levou 1.090,7001 segundos, com pico de memória amostrado de 420.069.376 bytes; as consultas finais ficaram abaixo de 0,09 segundo neste computador. O histórico permite localizar lotes antigos, e cada lote pode mostrar todas as páginas de linhas em quarentena e ausências de arquivo completo na interface, preservando registros originais. As ausências são calculadas por consulta no DuckDB. O comparador local importa as seis fontes em diretório temporário, confere SHA-256 e aponta diferenças de totais por filtro; passou em 13 verificações sintéticas. Falta executar esse comparador com layouts anonimizados e totais oficiais e comparar desempenho com o legado; não há paridade comprovada.
- **Fase 3:** perfis anuais, mensais, de dia da semana, municípios, classificações, meio declarado ou inferido do relato e faixas de horário são independentes para CAD e NEAC. As relações de vítimas agora filtram datas inicial/final além de ano, município e nome, sem cruzar fontes. A cobertura de horário e a concentração por município identificam dados faltantes sem imputação. A ficha individual abre os campos originais da versão atual ou de uma versão histórica na própria fonte. O comparativo aponta pares exatos potenciais e registra casos sem par ou ambíguos; não soma nem funde fontes. Ainda é preciso provar paridade MVI com casos oficiais, revisar inferências da narrativa com casos oficiais e completar os demais campos derivados.
- **Fase 4:** CVP e tentativas têm classificação e relação inicial de casos. TCO, mandados cumpridos, visitas realizadas e perturbação do sossego têm relação, evolução mensal e rankings, podendo coexistir com outros indicadores na mesma ocorrência. A triagem doméstica separa reconhecidas, pendentes, não configuradas no atendimento e fora do recorte feminino com evidências; ainda exige conferir versões conflitantes e revisão humana. O relatório geral oferece impressão/PDF dos perfis MVI e dos módulos principais no recorte selecionado, somente após carregar todas as consultas. Armas possui contagem provisória por unidade e item, apreensões, relação individual e filtros de mês, datas, tipo e situação; ainda faltam marcas/fabricantes. Drogas possui contagem inicial de registros, peso convertido quando a unidade é reconhecida, cobertura, relação individual e filtros de mês, datas e tipo. Guarnições possui pontuação inicial, ranking, separação de recursos fora da escala e filtros de mês, datas, equipe, policial por matrícula e natureza. As três áreas aceitam ano e município próprios e agora têm relatórios focados imprimíveis do recorte ativo. Ainda faltam detalhes operacionais do legado e paridade oficial em todas as áreas.
- **Fase 5:** contas locais, senhas derivadas, sessão temporária, perfis e restrição de importação para consulta estão implementados. O backup integral verificável reúne DuckDB, contas e arquivos brutos do projeto novo; a restauração verifica hashes e estrutura dos bancos antes de alterar dados, guarda cópia prévia e descarta sessões restauradas. Os testes cobrem bancos inválidos com manifesto e hash coerentes. O executável Windows com interface, importação sintética e backup/restauração foi testado em execução real. O bundle de código do legado foi verificado, mas não contém as bases operacionais nem os dados dos navegadores. As prévias sintéticas local e estática não equivalem à validação paralela. Ainda faltam backup operacional do legado, validação paralela, revisão do ambiente real e aprovação do plano de troca.

Cada entrega futura deve atualizar o arquivo de progresso, este registro e a versão no mesmo trabalho. A conclusão da implantação exige validação de paridade, segurança e dados, além do código pronto.

## Fechamento técnico 0.1.56 — 28/10/2026

A entrega conclui as alterações pendentes do executável sem console, direciona os logs do servidor para o arquivo local e impede que backup/restauração sejam ignorados quando outra instância está aberta. O instalador oferece o atalho **Encerrar GTB 2.0** para parar o servidor antes de atualizar ou restaurar; fechar apenas a janela do navegador mantém o servidor local ativo. Os dados operacionais não são publicados. O progresso operacional permanece em 90% concluído e 10% restante; nenhuma fase foi marcada como concluída sem as conferências oficiais.

Validação da entrega: 77 testes do backend, 31 testes da interface, Ruff e compilação TypeScript/Vite aprovados. O executável Windows gerado respondeu com a versão 0.1.56, serviu a interface embutida, recusou backup com o servidor aberto e criou o ZIP de backup depois de encerrado. O ensaio usou diretório isolado sem bases operacionais.
