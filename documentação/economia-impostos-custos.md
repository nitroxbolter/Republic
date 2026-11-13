# Economia, impostos e custos

## Dinheiro inicial e construção

Uma cidade nova começa com **$ 40.000**. Construir vias, estruturas cívicas e limpar certos elementos do terreno consome esse saldo. Casas, lojas, escritórios e fábricas crescem em zonas marcadas e também consomem materiais na cidade de jogador.

O preço de cada estrutura aparece no menu de construção. Alguns exemplos do catálogo atual:

| Estrutura | Preço de construção | Custo-base mensal |
| --- | ---: | ---: |
| Parque | $ 100 | $ 1 |
| Delegacia | $ 750 | $ 60 |
| Quartel dos bombeiros | $ 750 | $ 60 |
| Clínica | $ 900 | $ 80 |
| Escola | $ 1.500 | $ 80 |
| Torre de água | $ 1.200 | $ 120 |
| Usina a carvão | $ 4.000 | $ 300 |
| Usina a gás | $ 6.500 | $ 480 |
| Turbina eólica | $ 900 | $ 25 |
| Usina solar | $ 3.200 | $ 45 |
| Banco de baterias | $ 2.500 | $ 35 |
| Subestação elétrica | $ 1.400 | $ 30 |
| Hospital | $ 14.000 | $ 320 |

O custo-base mensal é o ponto de partida; para estruturas com manutenção variável, a despesa real aumenta conforme a população atendida ou a população total.

## Como a manutenção mensal é calculada

No fechamento de cada mês, o jogo calcula manutenção das vias, trilhos e edifícios cívicos. Para um edifício, a fórmula implementada é:

> **Manutenção mensal = custo-base × (1 + moradores atendidos ÷ 1.000 × percentual da categoria)**

O resultado é arredondado para o inteiro mais próximo. Serviços com área de cobertura contam moradores residenciais dentro do raio; estruturas sem essa cobertura usam a população da cidade inteira.

| Tipo | Parcela variável para cada 1.000 moradores atendidos |
| --- | ---: |
| Hospital | 100% do custo-base |
| Polícia e bombeiros | 25% do custo-base |
| Clínica e escola | 50% do custo-base |
| Universidade | 75% do custo-base |
| Parques recreativos | 10% do custo-base |
| Outras estruturas cívicas sem serviço de cobertura | 100% do custo-base |

**Exemplos:** um hospital com custo-base de $ 320 que atende 1.000 moradores custa aproximadamente $ 640 por mês. Se atender 50.000, custa aproximadamente $ 16.320. Uma delegacia com base $ 60 que atende 1.000 moradores custa cerca de $ 75 mensais; com 50.000 moradores na área, cerca de $ 810. O parque de $ 1 tem custo variável pequeno e pode arredondar para o mesmo valor-base em cidades pequenas.

Vias e trilhos também são cobrados mensalmente por trecho. Construir mais conexões amplia o alcance da cidade, mas aumenta essa linha do orçamento. O painel **Orçamento** mostra uma previsão para o próximo mês, separada em vias, serviços, infraestrutura e parques/serviços públicos.

## Como os impostos funcionam

- A alíquota geral inicial é **9%**. O controle vai de **0% a 100%** e incide sobre o faturamento das empresas comerciais e industriais, nunca sobre salários ou aposentadorias.
- A arrecadação geral usa a renda mensal dos trabalhadores (87% da população) e idosos (13%).
- Trabalhadores de moradias Confortáveis e Prósperas recebem mais que o mínimo (respectivamente 1,5 e 2,2 vezes). A alíquota empresarial não é descontada dessa renda.
- Energia $ 80, água $ 60, aluguel $ 450 e transporte $ 200 por pessoa e mês têm alíquotas independentes de 0% a 100%, inicialmente 0%. Alimentação importada custa $ 200 fixos e não tem alíquota.
- As contas de energia e água pagas por moradores abastecidos entram no orçamento público; a manutenção das instalações sai como despesa. Alimentação, aluguel e transporte são despesas privadas; o governo recebe a alíquota aplicada a cada um.
- O salário mínimo inicial é $ 1.200 e a aposentadoria inicial é $ 1.100 por mês. O custo base é $ 990 por pessoa. As quatro despesas tributáveis e a alimentação fixa são descontadas da renda; a previsão mostra o que sobra e eventual insuficiência. A cobrança pública é limitada ao dinheiro que resta após alimentação, aluguel e transporte.
- O poder de compra considera a renda disponível de trabalhadores e idosos, comparada ao cenário inicial. O imposto empresarial reduz a atividade, os empregos e o poder de compra de forma indireta, sem ser debitado na folha salarial. A estimativa de faturamento considera $ 300 mensais de consumo comercial por morador, ajustados pelo poder de compra e pela capacidade comercial disponível.
- O comércio vende menos quando o poder de compra cai. O faturamento comercial estimado aparece no menu **Mais** e não entra no caixa público. A atividade das lojas reduz os empregos que oferecem; a indústria acompanha parte dessa procura por produtos. Menos vagas elevam o desemprego, o que pode reduzir a felicidade e a ocupação das moradias. As necessidades das famílias também consideram o poder de compra. Ao baixar os impostos, consumo, atividade e emprego se recuperam gradualmente.
- Centros de reciclagem também geram receita pela venda dos materiais recuperados; essa parcela não depende da alíquota.
- Não existe mais uma penalidade direta da alíquota em todas as barras de zoneamento. A procura por zonas comerciais acompanha o poder de compra; as zonas residenciais, comerciais e industriais sentem os efeitos seguintes por meio de vagas efetivas, consumo e equilíbrio entre moradias e empregos.

### Recebimento dos impostos

Na cidade de jogador, os impostos, as contas de energia e água e a reciclagem ficam no cofre da Prefeitura, em vez de entrarem automaticamente no saldo disponível. É preciso construir uma Prefeitura funcional, conectada à via, e usar **Recolher receitas** no painel de orçamento. O cofre comporta até seis meses de receita; valores acima da capacidade se perdem. Enquanto isso, as despesas mensais continuam sendo debitadas do caixa. A previsão do painel não deve ser confundida com o dinheiro já disponível.

## Orçamento e outras despesas

Os idosos recebem aposentadoria mensal paga pela cidade: inicialmente **$ 1.100 por idoso**. No painel **Orçamento e políticas**, acessível pelo saldo no topo ou pelo menu **Mais**, é possível ajustar esse benefício de $ 0 a $ 3.000 por idoso. O salário mínimo vai de $ 500 a $ 3.000. Ambos alteram a renda disponível, os impostos e o poder de compra. O painel mostra a despesa prevista em **Aposentadorias**.

O resultado mensal é a receita de impostos, contas de energia e água e reciclagem menos manutenção e aposentadorias. Um resultado negativo reduz o caixa. Na cidade de jogador, quando a arrecadação está guardada na Prefeitura, o custo mensal ainda é debitado imediatamente.

Além das despesas mensais:

- **Vias:** a construção custa por trecho de $ 20 (rua e rua de pedestres) a $ 100 (via expressa). Vias duplas cobram os dois lados. Pontes e alças custam de $ 40 a $ 100 por trecho. A manutenção mensal em terra vai de $ 1 a $ 8 por trecho; pontes, de $ 3 a $ 10.

- **Materiais de construção:** indústrias produzem materiais. Novos edifícios zonados usam materiais; se faltar estoque, o jogo pode importar até 6 toneladas por dia a $ 25 por tonelada. A construção pode aguardar se não houver material nem capacidade diária de importação.
- **Armazenamento:** o pátio inicial comporta 300 toneladas; cada armazém ativo acrescenta 400 toneladas.
- **Exportação:** excedentes acima da capacidade são vendidos por $ 6 por tonelada.
- **Pesquisa:** construção moderna reduz em 30% os materiais exigidos; pesquisa de coleta aumenta a capacidade dos veículos de resíduos em 30%.
- **Reparos:** usinas sobrecarregadas podem se desgastar e parar; restaurá-las tem o preço informado na definição de cada usina.
- **Parques e atrações:** todos têm custo-base; parques recreativos usam a parcela populacional menor de 10%. Outras estruturas cívicas podem usar a parcela geral.

Antes de expandir, consulte a previsão do próximo mês e deixe uma reserva para manutenção, construção e materiais importados.
