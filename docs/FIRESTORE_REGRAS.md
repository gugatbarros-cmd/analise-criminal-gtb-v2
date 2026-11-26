# Regras do Firestore usadas pela consulta online

## Onde ficam

As regras de segurança do Firestore são publicadas a partir do repositório legado arquivado (`PROJETO TAVARES`), arquivo `firestore.rules`, referenciado pelo `firebase.json` desse repositório. O GTB 2.0 não mantém uma cópia própria para evitar duas versões divergentes. Qualquer mudança de regra exige autorização específica do responsável, conforme o `AGENTS.md` deste projeto, e continua no plano Spark.

## O que protege `sharedBases/gtb2-online`

| Operação | Quem pode |
| --- | --- |
| Ler o manifesto e os blocos | Administrador ou conta com perfil `active` em `users/{uid}` |
| Criar ou atualizar o manifesto | Administrador ou analista ativo, com campos validados (`chunkCount` de 1 a 1000, `generation`, `updatedAt == request.time`) |
| Criar ou atualizar blocos | Administrador ou analista ativo, com bloco de até 450.000 caracteres |
| Apagar | Administrador ou analista ativo |
| Qualquer outro caminho | Negado |

O administrador é identificado pelo e-mail fixo nas regras; os demais perfis vêm do documento `users/{uid}`.

## Risco conhecido

As regras de `sharedBases/{baseId}` valem para **qualquer** `baseId`. Um analista ativo pode, portanto, gravar ou apagar também as bases históricas do sistema anterior, que o projeto determina preservar. A aplicação do GTB 2.0 escreve somente em `gtb2-online`, mas a regra não impõe isso.

Proposta, ainda **não publicada**, para restringir a escrita de analistas ao documento do GTB 2.0:

```
match /sharedBases/{baseId} {
  allow read: if isAdministrator() || activeUser();
  allow create, update: if (isAdministrator() || (isAnalyst() && baseId == 'gtb2-online')) && validBaseMetadata();
  allow delete: if isAdministrator() || (isAnalyst() && baseId == 'gtb2-online');

  match /chunks/{chunkId} {
    allow read: if isAdministrator() || activeUser();
    allow create, update: if (isAdministrator() || (isAnalyst() && baseId == 'gtb2-online')) && validBaseChunk();
    allow delete: if isAdministrator() || (isAnalyst() && baseId == 'gtb2-online');
  }
}
```

Antes de publicar: confirmar que nenhum fluxo ainda ativo grava bases históricas com conta de analista e testar a regra no emulador ou no simulador de regras do console, que não geram cobrança.
