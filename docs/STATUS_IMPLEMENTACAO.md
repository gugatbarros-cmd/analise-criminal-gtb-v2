# Andamento da implantação — 29/10/2026

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
