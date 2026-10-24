# Benchmark local — 24/10/2026

O comando `.venv\Scripts\python.exe scripts\benchmark-local.py --rows N --batch-size B` gera ocorrências **sintéticas** únicas em lotes de até 100 mil linhas, importa os CSV em banco descartável dentro de `data/` e mede o resumo anual, a análise de mandados de Igaci em 2026 e a primeira página da relação de mandados. O script confirma o número importado, a ausência de quarentena e a contagem esperada antes de mostrar os tempos. Ele monitora a memória física do processo a cada 100 ms. Nenhum dado operacional foi usado ou enviado a serviços externos.

Ambiente desta medição: Windows 11 (`10.0.26200`), Python 3.12.10, 16 CPUs lógicas. Os tempos são de uma execução por tamanho, sem controle de carga do computador; não representam garantia de desempenho. O pico amostrado é do processo Python inteiro, incluindo DuckDB; picos inferiores a 100 ms podem escapar.

| Linhas | Lotes | CSV total | Banco | Importação | Pico de memória | Resumo anual | Análise filtrada | Página 1 | Mandados esperados |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10.000, gravação linha a linha | 1 | 616.714 B | 3.158.016 B | 157,3914 s | não medido | 0,0474 s | 0,0433 s | 0,0352 s | 2.500 |
| 10.000, gravação por lote | 1 | 616.714 B | 3.420.160 B | 8,5245 s | não medido | 0,0403 s | 0,0410 s | 0,0343 s | 2.500 |
| 100.000, gravação por lote | 1 | 6.166.714 B | 13.905.920 B | 83,2414 s | não medido | 0,0680 s | 0,0585 s | 0,0458 s | 25.000 |
| 100.000, gravação por lote | 2 × 50.000 | 6.166.769 B | 19.410.944 B | 102,2644 s | 205.549.568 B | 0,0502 s | 0,0526 s | 0,0413 s | 25.000 |

A gravação por lote reduziu o tempo da amostra de 10 mil linhas em cerca de **18 vezes**. O importador continua validando e normalizando cada registro, mas compara chaves e grava versões com operações SQL em conjunto. Os testes verificam idempotência, retificação, quarentena, separação de fontes, texto original com aspas e quebras de linha e limpeza dos arquivos temporários.

Ainda faltam avaliação de CSV/XLSX reais anonimizados, comparação com o legado sob o mesmo cenário e ensaio de 1 milhão de linhas. O limite atual de 30 MB por arquivo impede usar a amostra de 1 milhão em um único lote; o script agora divide a carga em lotes únicos. Estes tempos não comprovam paridade estatística.
