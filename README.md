# Bestiário de D&D

Aplicação web estática para consultar criaturas do SRD 5.1 de D&D 5e. Busca por nome, filtros por tipo, tamanho e Nível de Desafio, e ficha completa (stat block) na mesma página.

Sem framework, sem bundler, sem dependências. HTML, CSS e JavaScript com ES modules.

- Dados: [D&D 5e API](https://www.dnd5eapi.co/) (`/api/2014`)
- Conteúdo: System Reference Document 5.1, Wizards of the Coast, licença [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)
- Interface em português do Brasil; os dados das criaturas permanecem em inglês, como vêm da API

## Funcionalidades

- Busca por nome, sem distinção de maiúsculas e minúsculas e sem depender de acentos
- Filtros combináveis: tipo, tamanho e faixa de Nível de Desafio (0 a 1, 2 a 4, 5 a 10, 11 a 16, 17 ou mais)
- Ficha completa: classe de armadura, pontos de vida, deslocamento, atributos com modificadores, testes de resistência, perícias, vulnerabilidades, resistências, imunidades, sentidos, idiomas, ND, XP, bônus de proficiência, traços, ações, reações e ações lendárias
- Link direto por criatura via hash (`index.html#adult-red-dragon`)
- Botão **Sortear**: escolhe uma criatura aleatória dentro do resultado filtrado atual (ou de todas, se não houver filtro)
- Atalho `/` para focar a busca
- Layout responsivo; abaixo de 860 px a ficha aparece abaixo da lista, com botão **Voltar à lista**
- Contador de resultados, barra de progresso no carregamento e aviso quando alguma criatura falha

## Estrutura

```
.
├── index.html          Marcação da página e ponto de entrada (carrega ui.js)
├── style.css           Estilos
├── ui.js               DOM, renderização e eventos
├── bestiary.js         Carregamento, busca e filtros
├── api.js              Acesso à D&D 5e API e normalização dos dados
├── build-bestiary.mjs  Script Node que gera data/bestiary.json
├── data/
│   └── bestiary.json   Base local pré-gerada (opcional)
├── package.json
└── README.md
```

### Responsabilidade de cada módulo

| Arquivo | Faz | Não faz |
| --- | --- | --- |
| `api.js` | Requisições HTTP, retentativas, normalização | Mexer no DOM, guardar estado |
| `bestiary.js` | Carregar dados, buscar, filtrar, consultar por índice | Mexer no DOM; chamar a API se houver dados locais |
| `ui.js` | Renderizar, tratar eventos, rotas por hash | Fazer chamadas HTTP |

`api.js` não depende de nada do navegador além de `fetch`, então roda também no Node 18+. O `build-bestiary.mjs` reaproveita o mesmo arquivo.

## Como rodar

Os módulos ES não funcionam abrindo o `index.html` direto do disco (`file://`). Sirva a pasta por HTTP:

```bash
# Python
python -m http.server 8000

# ou Node
npx serve .
```

Depois abra `http://localhost:8000`.

## Origem dos dados

O carregamento segue esta ordem e para no primeiro que der resultado:

1. **`data/bestiary.json`**: base local gerada pelo script de build. Caminho mais rápido, zero requisições externas.
2. **Cache no `localStorage`** (chave `dnd-bestiary:v1`): gravado em uma carga anterior direto da API.
3. **D&D 5e API**: uma requisição de lista e uma por criatura, com no máximo 8 em paralelo. O resultado vai para o cache apenas se nenhuma criatura falhar.

Se `data/bestiary.json` estiver vazio (`[]`) ou ausente, o app cai para o cache e, depois, para a API. Na primeira visita isso significa centenas de requisições; por isso vale gerar a base local.

### Gerar a base local

Requer Node 18 ou superior.

```bash
npm run build:data
```

Equivale a `node build-bestiary.mjs` e grava `data/bestiary.json`. Rode de novo quando quiser atualizar os dados.

### Tratamento de falhas na API

- Até 2 retentativas por requisição, com espera crescente (400 ms, 800 ms)
- Erros 4xx (exceto 429) não são repetidos
- Erros de rede, 429 e 5xx são repetidos
- Criatura que falha não interrompe as demais; os índices com erro são devolvidos em `failed` e a interface mostra um aviso
- Se nenhuma criatura chegar, a interface mostra erro com botão **Tentar de novo**

## Formato dos dados

`normalizeMonster` em `api.js` converte o JSON cru da API em um formato compacto. Campos textuais já vêm formatados para exibição.

```jsonc
{
  "index": "goblin",
  "name": "Goblin",
  "size": "Small",
  "type": "humanoid",
  "subtype": "goblinoid",
  "category": "humanoid",        // tipo usado no filtro; "swarm" para enxames
  "alignment": "neutral evil",
  "ac": "15 (leather armor, shield)",
  "hp": 7,
  "hpRoll": "2d6",
  "speed": "30 ft.",
  "abilities": { "str": 8, "dex": 14, "con": 10, "int": 10, "wis": 8, "cha": 8 },
  "saves": "",
  "skills": "Stealth +6",
  "vulnerabilities": "",
  "resistances": "",
  "immunities": "",
  "conditionImmunities": "",
  "senses": "darkvision 60 ft., passive Perception 9",
  "languages": "Common, Goblin",
  "cr": 0.25,                    // numérico, usado no filtro
  "crLabel": "1/4",              // texto exibido
  "xp": 50,
  "prof": 2,
  "traits":    [{ "name": "", "usage": "", "desc": "" }],
  "actions":   [],
  "reactions": [],
  "legendary": []
}
```

Os exemplos acima são ilustrativos do formato; os valores reais vêm da API.

`usage` traz o texto de uso limitado quando existe: `3/Day`, `Recharge 5-6`, `Recharge after Short or Long Rest`, `At Will`.

## Rotas

Roteamento por hash, sem biblioteca:

| URL | Resultado |
| --- | --- |
| `#` (vazio) | Tela de boas-vindas |
| `#<index>` | Ficha da criatura com esse índice |
| `#<index inexistente>` | Mensagem de criatura não encontrada |

O `index` é o identificador da API em minúsculas com hífens (`ancient-blue-dragon`).

## Decisões de implementação

- **Sem `innerHTML`**: todo texto vindo dos dados entra no DOM como nó de texto (helper `el()` em `ui.js`), o que elimina injeção de HTML por dados externos.
- **Busca sem acentos**: o texto é normalizado com `NFD` e os marcadores diacríticos são removidos antes da comparação.
- **Ordenação**: por nome, com `localeCompare(..., 'en')`, já que os nomes estão em inglês.
- **Acessibilidade**: `aria-current` no item selecionado, `role="status"` no contador, `<label>` em todos os campos, foco visível, rolagem sem animação quando `prefers-reduced-motion` está ativo.
- **Estado mínimo**: filtros, lista visível e criatura selecionada ficam em um único objeto em `ui.js`; a seleção é derivada do hash da URL.

## Limitações

- Apenas o conteúdo do SRD 5.1 (versão 2014 da API)
- Fichas em inglês: nomes, ações, traços e descrições não são traduzidos
- Sem paginação; a lista completa é renderizada de uma vez
- O cache do `localStorage` não expira; para forçar atualização, apague a chave `dnd-bestiary:v1` ou gere um novo `data/bestiary.json`

## Créditos e licença do conteúdo

Este projeto usa conteúdo do System Reference Document 5.1 ("SRD 5.1") da Wizards of the Coast LLC, disponível em <https://dnd.wizards.com/resources/systems-reference-document>. O SRD 5.1 é licenciado sob a [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/legalcode).

Dados obtidos da [D&D 5e API](https://www.dnd5eapi.co/).
