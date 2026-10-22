# Análise Criminal GTB 2.0

Projeto novo, local e independente do sistema legado em produção. Esta primeira fase oferece uma API de saúde e uma interface inicial. Não lê bases reais, não acessa CAD/Firebase e não publica dados.

## Requisitos

- Python 3.12 ou superior
- Node.js 20 ou superior

## Iniciar no Windows

Na pasta deste projeto, execute `scripts\iniciar-backend.cmd` e `scripts\iniciar-frontend.cmd` em dois terminais. Na primeira execução, os scripts criam o ambiente Python e instalam dependências gratuitas do PyPI/npm. A API fica em `http://127.0.0.1:8000/health`; a interface em `http://127.0.0.1:5173`.

Para conferir, execute `scripts\testar.cmd`. Se a instalação de pacotes estiver bloqueada, consulte `docs/ARQUITETURA.md` e rode ao menos `python -m compileall backend/src`. A verificação TypeScript depende da instalação das dependências do frontend.

## Estado

Fase 1: base local. Importadores, banco, indicadores, autenticação multiusuário, sincronização e publicação não estão implementados. Nenhum número da nova interface deve ser interpretado como dado oficial. As decisões e os dados de exemplo necessários estão em `docs/DECISOES_PENDENTES.md`.

O código antigo continua dois diretórios acima e na URL de produção. Seu backup de código está em `../legacy-v4.6.256-2026-10-22.bundle`. O bundle não contém dados privados do navegador nem exportação atual do Firestore.
