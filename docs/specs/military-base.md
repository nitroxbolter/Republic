# Base militar e quartel

Este documento registra os edifícios públicos já entregues e as etapas futuras do sistema militar.

## Primeira entrega (2026-11-13)

O catálogo agora inclui cinco edifícios cívicos na categoria **Defesa**: Quartel, Garagem
militar, Paiol, Base militar e Centro de treinamento. Cada um tem arte procedural baseada no kit
visual existente, custo de construção, vagas de trabalho, manutenção mensal e estágio de
desbloqueio. O orçamento mostra a manutenção militar separada.

Essas estruturas são instalações municipais visuais e econômicas. Ainda não recrutam soldados,
guardam equipamentos, treinam unidades, despacham missões ou iniciam guerras. A interface deixa
essa limitação explícita; o uso funcional de tropas depende da etapa seguinte descrita abaixo.

## O que já existe e pode ser aproveitado

- **Construções cívicas:** `BuildingCategory` já tem `civic`, e o catálogo `BUILDINGS` define tamanho, custo inicial, capacidade, descrição, grupo de menu e manutenção mensal. Uma instalação militar pode começar como edifício cívico, sem mudar o sistema de colocação ou construção.
- **Desbloqueios:** estágios de cidade já controlam quando edifícios aparecem. O quartel pode exigir um estágio e requisitos de cidade, com regra no catálogo/progressão existente.
- **Orçamento:** prédios cívicos já pagam manutenção mensal, que aparece no relatório da cidade. O quartel pode usar esse fluxo.
- **Acesso e deslocamento:** edifícios podem depender de acesso viário. Agentes visuais seguem rotas da malha viária; tráfego já desenha pedestres, carros, caminhões e veículos de emergência.
- **Despacho de resposta:** `incidents.ts` já escolhe estações, cria despachantes, calcula rotas, move veículos e encerra ocorrências. Esse desenho serve como referência para despachar unidades.
- **Salvamento e determinismo:** estado da simulação fica em `City`, é serializado em `save.ts` e usa fluxos aleatórios salvos. Unidades, missões e resultados militares teriam de seguir esse padrão.
- **Arte:** edifícios cívicos têm receitas próprias em `src/render/atlas/civic/`; estruturas comuns usam volumes isométricos, fachadas, iluminação e detalhes procedurais. Dá para compor uma base com pátio, alojamento, garagem, portão e torre sem importar arte externa.

## O que não existe

- Quartel, base militar, soldados, equipamentos, esquadrões ou um grupo militar no menu cívico.
- Pessoal disponível, recrutamento, treinamento, cadeia de comando, moral e capacidade por base.
- Veículos militares ou agentes de soldados a pé. A união de veículos atual cobre apenas bombeiros, polícia e ambulâncias.
- Missões, patrulhas militares, mobilização e efeitos de defesa. Os incidentes atuais são incêndio, furto, doença e ferimento; não há combate.
- Exércitos de outras cidades, países, facções, fronteiras, diplomacia, guerra ou tratados. Esses sistemas aparecem somente como direção futura no plano mestre.
- Indicadores próprios de defesa, painel militar, avisos, balanço de forças e salvamento de operações.

## Implementação possível por etapas

### 1. Quartel municipal, sem guerra

Adicionar uma construção cívica `military_base` numa nova categoria visual do menu, **Defesa**, mantendo internamente as regras básicas de edifício cívico. Definir tamanho maior que os serviços de bairro, custo e manutenção relevantes, estágio de desbloqueio, acesso por via e arte dedicada. A capacidade representa vagas de pessoal, não moradores nem empregos civis.

O primeiro uso jogável pode ser **defesa civil**: unidades treinadas ajudam em incêndios grandes, enchentes e outros desastres que vierem a existir. Para começar, o quartel pode apenas exibir capacidade e efetivo, sem prometer proteção contra ameaças ainda ausentes. Isso permite entregar a construção e interface sem inventar uma guerra local antes de haver mundo ou facções.

### 2. Pessoal e missões

Criar estado militar persistido na cidade, com efetivo recrutado, limite, treinamento, unidades disponíveis e missões ativas. Definir operações como estados explícitos (na base, em deslocamento, em missão, retornando), usando ticks fixos e rotas determinísticas. Reaproveitar o caminho visual dos agentes, mas modelar soldados separadamente de veículos de emergência.

O painel do quartel deve mostrar capacidade, efetivo, manutenção, unidades prontas, duração de treinamento e missões. Recrutar ou treinar precisa ter custo financeiro e prazo claros; desmobilizar libera manutenção e efetivo.

### 3. Defesa entre cidades

Só depois de existirem cidades/facções conectadas, criar alvos, fronteiras, diplomacia e regras de conflito. Uma base isolada numa cidade não tem contra quem guerrear. Definir primeiro se o jogador ordena missões diretamente, se conflitos são eventos automáticos ou se ambos existem.

As regras devem definir aviso e duração de mobilização, perdas, proteção de civis, condições de vitória/retirada, reparação e efeitos econômicos antes de produzir combate no mapa. Simulação deve ser previsível, salvável e legível; não deve reduzir segurança, cobertura de polícia ou bombeiros sem uma consequência explicada.

## Sistemas e arquivos que provavelmente mudariam

| Área | Reaproveitar | Criar ou ampliar |
|---|---|---|
| Catálogo e colocação | `src/sim/buildings/catalog.ts`, construção cívica e estágios | Definição de base, grupo de menu Defesa, capacidade militar e regras de desbloqueio |
| Simulação | `City`, `SimSystem`, relógio de ticks e determinismo | estado militar, sistema de treinamento/missões, comandos e balanço |
| Resposta | caminhos de `incidents.ts` e agentes visuais | tipos militares, unidades a pé, despacho e regras de missão; não misturar soldados com polícia |
| Visual | receitas cívicas, peças isométricas e animação de agentes | arte da base, uniformes, veículos e indicadores específicos |
| Interface | painel de construção, orçamento, avisos e inspeção | categoria Defesa, painel do quartel, efetivo, ordens, progresso e alertas |
| Save | `src/sim/save.ts`, migração compatível e estados determinísticos | persistência/validação de unidades, treinamento, missões e resultados |
| Mundo e multiplayer | mapa, tráfego e saves existentes | facções, relações entre cidades, fronteiras, diplomacia, conflito e sincronização no servidor |

## Decisões necessárias antes de implementar

1. O quartel será apenas municipal e de defesa civil no primeiro lançamento, ou já deve fazer parte de um sistema de países/facções?
2. O jogador recruta e comanda unidades, ou elas são abstraídas como capacidade de resposta?
3. A primeira entrega deve incluir só construção e efetivo, defesa de desastres, ou combate visível?
4. Qual estágio libera a base e qual custo mensal é aceitável frente a polícia, bombeiros, hospital e universidade?

**Recomendação técnica:** começar com a base cívica e defesa civil, deixando combate entre cidades para a fase de facções e diplomacia. Isso reutiliza construção, orçamento, rotas, agentes e salvamento presentes, enquanto mantém as regras de guerra fora do escopo até existirem atores e objetivos para elas.
