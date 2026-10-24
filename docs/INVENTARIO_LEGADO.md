# Inventário do legado (leitura de código e documentação)

Base observada: `../../../` na versão 4.6.256. Isto é um mapa inicial, não uma prova de paridade.

| Área | Evidência encontrada | Conferência pendente |
| --- | --- | --- |
| Acesso | Login e cadastro no `index.html`; Firebase Authentication, perfis e regras em `firestore.rules` | Matriz de permissões e sessões reais |
| Dados | Bases locais em IndexedDB e compartilhadas em Firestore; importação CSV/XLS/XLSX | Layouts, chaves estáveis e exemplos anonimizados |
| MVI | Abas CAD e NEAC distintas; `docs/METODOLOGIA-MVI.md` descreve exclusões e contagem por vítima | Regras oficiais, casos limite e paridade numérica |
| CVP | Aba própria e `docs/METODOLOGIA-CVP.md` | Regras e totais com fonte oficial |
| Outras análises | Ocorrências, tentativas, violência doméstica, armas, drogas, guarnições, mandados, visitas, TCO, sossego, planejamento | Filtros e cálculos completos por aba |
| Relatórios | Visão executiva, tabela consolidada, relatórios e apresentações, relatório temático | Exportações e diagrama de dependências |
| CAD | Importador local em `scripts/cad-assistente.mjs` e ponte P3 em `assets/js/cad-p3-bridge.mjs` | Documentação/permissão de integração |
| Offline | PWA com `sw.js` e dados locais | Políticas de atualização e recuperação |

As rotas do legado são principalmente abas `data-tab` em `index.html`, não endpoints HTTP. Os filtros e gráficos são implementados no navegador em `assets/js/app.js` e módulos adjacentes. O preparo de índices e caches consta em `docs/ARQUITETURA.md`; medir gargalos exige benchmark com amostras sintéticas equivalentes. Nenhum dado real foi lido para este inventário.

## Filtros observados no legado

Leitura estática dos controles em `index.html` da versão 4.6.256; a existência de um controle não comprova a regra aplicada nem a equivalência no sistema novo.

| Aba | Filtros e recortes visíveis | Lacuna principal na versão nova |
| --- | --- | --- |
| Visão executiva / Ocorrências | Município, tipo, ano, mês e busca na tabela | Conferir filtros mestres e tabela geral completa |
| MVI CAD | Período total, intervalo, ano, mês e mesmo período entre anos; ano, mês e datas inicial/final; seleção de município no mapa | Mesmo período entre anos, mapa e demais detalhamentos |
| MVI NEAC | Ano, município, datas inicial/final e nome da vítima, independentes do CAD | A relação possui esses filtros; análise numérica e gráficos ainda não acompanham todos os recortes |
| CVP | Ano, mês, município e datas inicial/final | Mês e intervalo de datas |
| Tentativas | Todo período, intervalo mestre, ano e mês; município e natureza | Períodos, mês e natureza |
| TCO | Todo período, intervalo mestre, ano e mês; município, natureza e busca por número | Períodos, mês, natureza e busca por número |
| Sossego | Todo período, intervalo personalizado, ano e mês; datas inicial/final, município e natureza | Recortes de período e natureza |
| Armas | Ano, mês, município, situação, tipo e datas inicial/final | Mês, situação, tipo e intervalo aplicados; controles independentes de ano e município e relatório especializado pendentes |
| Drogas | Ano, mês, datas inicial/final, município e tipo | Filtros locais de mês, tipo e intervalo implementados; faltam controles independentes de ano/município, relatórios especializados e paridade oficial |
| Guarnições | Datas inicial/final, tipo de ocorrência, policial, guarnição, município, ano e mês | Datas, natureza, policial, guarnição e mês |
| Tabela consolidada | Busca, indicador e origem | Conferir cobertura integral das seis fontes |
| Inteligência estatística | Janela móvel de 7/14/28/90 dias, territórios A/B e pesquisa textual | Módulo ainda não migrado |

As abas de planejamento operacional, território, análise avançada, soluções, relatórios, importações e controle de acesso também constam no menu. Seus fluxos completos, gráficos, exportações e dependências ainda precisam de inventário específico antes de equivalência funcional. A verificação exige amostras anonimizadas e totais de referência para medir cálculos e desempenho sob o mesmo cenário.

## Checklist de paridade

- [ ] Enumerar filtros, gráficos e exportações de cada aba.
- [ ] Obter layouts anonimizados das seis fontes.
- [ ] Identificar chave de negócio estável por fonte.
- [ ] Registrar casos de teste de contagem de vítimas e ocorrências.
- [ ] Comparar resultados e desempenho com o legado em ambiente isolado.
- [ ] Validar acesso, backup/restauração e operação offline antes da troca.
