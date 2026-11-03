# Relatórios do legado na versão 0.1.65

Acesse **Relatórios e apresentações** no menu lateral. A central oferece filtros próprios de ano, município do 10º BPM, mês, intervalo de datas, natureza, tipo, situação de arma e guarnição. Dados e filtros da prévia determinam a exportação. Alterar o recorte exige preparar novamente o documento.

| Modelo anterior / origem | Opção na central nova | Saída |
| --- | --- | --- |
| Relatório executivo (`executiveReportButton`) | Relatório executivo | PDF, CSV, XLSX |
| Folder (`presentationFolderButton`) | Folder executivo | PDF horizontal, CSV, XLSX |
| Consolidado (`completeReportButton`) | Consolidado de todos os indicadores | PDF, CSV, XLSX |
| Institucional (`dashboardPdfButton`) | Relatório institucional | PDF, CSV, XLSX |
| Painel geral (`generalPdfButton`) | Painel geral | PDF, CSV, XLSX |
| MVI (`mviPdfButton`) | MVI CAD | PDF, CSV, XLSX |
| Análise NEAC (`mviNeacTab`) | MVI NEAC | PDF, CSV, XLSX |
| Exportação da consolidação NEAC (`exportMviNeacConsolidation`) | Conferência CAD × NEAC | PDF, XLSX com fontes e revisão separadas |
| CVP (`cvpPdfButton`) | Crimes Violentos contra o Patrimônio | PDF, CSV, XLSX |
| Tentativas (`attemptPdfButton`, atalho central) | Tentativas de homicídio | PDF, CSV, XLSX |
| TCO (`tcoPdfButton`) | Relatório individual de TCO | PDF em cinco partes, CSV, XLSX |
| Mandados (`warrantsPdfButton`) | Cumprimento de mandados | PDF, CSV, XLSX |
| Visitas (`visitsPdfButton`) | Visitas orientativas | PDF, CSV, XLSX |
| Sossego (`disturbancePdfButton`, atalho central) | Perturbação do sossego | PDF, CSV, XLSX |
| Armas (`armsPdfButton`, atalho central) | Apreensões de armas | PDF, CSV, XLSX |
| Drogas (`drugsPdfButton`) | Estimativa de drogas | PDF, CSV, XLSX |
| Violência doméstica (`domesticPdfButton`) | Violência doméstica | PDF, CSV, XLSX |
| Editor temático (`DomesticReport`) | Apresentação temática de violência doméstica | PDF ilustrado e PowerPoint editável |
| Guarnições (`teamsTab`) | Produtividade das guarnições | PDF, CSV, XLSX |
| Horários críticos (`timeReportTable`, `cityTimeReportTable`) | Horários críticos e municípios | PDF, CSV, XLSX |
| Planejamento (`operationPdf`, `operationExport`) | Planejamento operacional | Tabuleiro original, PDF e PNG |
| Resumo CSV (`exportSummary`) | Exportar resumo CSV do recorte | CSV |

## Conteúdo e cuidados de leitura

- CAD e NEAC permanecem independentes. A conferência usa nome completo, data e município para sugerir pares; múltiplas correspondências ficam ambíguas. Não equivale a confirmação nem migra decisões manuais do sistema anterior.
- MVI inclui histórico anual, perfil, meio empregado, faixas de horário, dias sem registro por município e relação de vítimas elegíveis. Dias sem MVI usam o histórico conhecido até a data de referência escolhida, sem tratar ausência de histórico como zero.
- TCO mantém as cinco partes do modelo individual: comparação, meses, municípios, naturezas e perfil municipal. O ano selecionado substitui os anos fixos do modelo anterior; compara-se com o ano anterior no mesmo intervalo.
- Armas distingue registros, unidades, unidades apreendidas e uso restrito. Drogas distingue registros, peso conhecido em g/kg e registros sem peso. Guarnições distingue vínculos, pontos, escala, força-tarefa e recursos não listados.
- O tema doméstico usa a triagem já processada. Perfis só usam campos explicitamente vinculados à vítima; informações ausentes não são inferidas do solicitante ou do autor. Condutas adicionais sem campos estruturados aparecem sem dados específicos.
- A apresentação temática usa o mesmo editor e biblioteca do legado, com título, subtítulo, responsável, observações, encaminhamentos, seleção de seções e navegação dos slides. O PowerPoint contém textos e elementos editáveis.
- Os cenários do planejamento ficam neste navegador. O tabuleiro não recupera cenários guardados em outra origem/site. O mapa de ruas precisa de conexão; a prancha PNG é esquemática e não depende de baixar os mapas.
- A impressão abre um documento separado e permite salvar em PDF pelo navegador. As fontes, filtros, atualização da base e emissão acompanham os documentos. Cabeçalhos e rodapés automáticos do navegador podem ser desativados na impressão.
- Gerar documentos é restrito ao administrador. A demonstração usa somente bases sintéticas. Dados reais ficam no armazenamento local e na consulta autenticada autorizada, sem envio ao Git ou ao site público.

## Origem técnica

O inventário foi conferido em `assets/js/app.js`, `assets/js/domestic-report.js`, `assets/js/operational-planning.js` e `index.html` do projeto anterior. O script `scripts/sync-legacy-report-assets.py` copia apenas modelos, bibliotecas e imagens estáticas selecionadas. A central usa `ReportCenter.tsx`; a projeção processada está em `backend/src/gtb/reports.py`. O sistema anterior permanece sem alterações nesta entrega.
