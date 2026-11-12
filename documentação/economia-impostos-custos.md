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

- A alíquota inicial e de referência é **9%**. O controle pode ser ajustado entre **5% e 100%**.
- A arrecadação-base considera **$ 3 por morador** e **$ 2 por trabalhador** por mês, antes dos multiplicadores.
- Moradores com padrão de vida Confortável pagam 1,5 vez o valor residencial-base; os Prósperos pagam 2,2 vezes. O padrão Básico usa o valor normal.
- A arrecadação de moradores e trabalhadores é multiplicada pela razão entre a alíquota atual e 9%. A 5%, por exemplo, essa parte da receita é cerca de 55,6% da receita a 9%; a 100%, cerca de 11,1 vezes a receita de referência.
- A alíquota também muda a economia doméstica. O poder de compra é estimado pela renda disponível após impostos, comparada ao nível de referência de 9%: 15% deixa as famílias com cerca de 93% do poder de compra-base; 5% chega a cerca de 104%; há um piso de 10% para compras essenciais mesmo no limite de 100%.
- A estimativa de faturamento considera $ 300 mensais de consumo comercial por morador no nível de referência, ajustados pelo poder de compra e pela capacidade comercial disponível. É um indicador da economia privada, não uma entrada de impostos.
- O comércio vende menos quando o poder de compra cai. O faturamento comercial estimado aparece no menu **Mais** e não entra no caixa público. A atividade das lojas reduz os empregos que oferecem; a indústria acompanha parte dessa procura por produtos. Menos vagas elevam o desemprego, o que pode reduzir a felicidade e a ocupação das moradias. As necessidades das famílias também consideram o poder de compra. Ao baixar os impostos, consumo, atividade e emprego se recuperam gradualmente.
- Centros de reciclagem também geram receita pela venda dos materiais recuperados; essa parcela não depende da alíquota.
- Não existe mais uma penalidade direta da alíquota em todas as barras de zoneamento. A procura por zonas comerciais acompanha o poder de compra; as zonas residenciais, comerciais e industriais sentem os efeitos seguintes por meio de vagas efetivas, consumo e equilíbrio entre moradias e empregos.

### Recebimento dos impostos

Na cidade de jogador, os impostos mensais ficam no cofre da Prefeitura, em vez de entrarem automaticamente no saldo disponível. É preciso construir uma Prefeitura funcional, conectada à via, e usar **Recolher impostos** no painel de orçamento. O cofre comporta até seis meses de receita; valores acima da capacidade se perdem. Enquanto isso, as despesas mensais continuam sendo debitadas do caixa. A previsão do painel não deve ser confundida com o dinheiro já disponível.

## Orçamento e outras despesas

Os idosos recebem aposentadoria mensal paga pela cidade: inicialmente **10% do salário mínimo por idoso**. Com salário mínimo inicial de $ 100, são $ 10 por idoso a cada mês. No painel **Orçamento e políticas**, acessível pelo saldo no topo ou pelo menu **Mais**, é possível ajustar o salário mínimo e o percentual da aposentadoria entre 5% e 30%. O painel mostra quantos idosos há e a despesa prevista em **Aposentadorias**. Salários maiores elevam o poder de compra, mas acima de certo ponto pressionam as contratações.

O resultado mensal é a receita de impostos e reciclagem menos manutenção. Um resultado negativo reduz o caixa. Na cidade de jogador, quando a arrecadação está guardada na Prefeitura, o custo mensal ainda é debitado imediatamente.

Além das despesas mensais:

- **Vias:** a construção custa por trecho: rua $ 200, avenida $ 350, boulevard $ 500, alça $ 400, rodovia $ 650, via expressa $ 800 e rua de pedestres $ 200. Vias duplas, como boulevard e via expressa, cobram cada trecho dos dois lados. Pontes custam de $ 250 a $ 800 por trecho sobre a água, conforme o tipo. A manutenção mensal por trecho em terra é de $ 100 na rua, $ 400 na avenida, $ 800 no boulevard, $ 300 na alça, $ 1.200 na rodovia, $ 2.000 na via expressa e $ 100 na rua de pedestres. Pontes têm valores próprios de manutenção, também conforme o tipo.

- **Materiais de construção:** indústrias produzem materiais. Novos edifícios zonados usam materiais; se faltar estoque, o jogo pode importar até 6 toneladas por dia a $ 25 por tonelada. A construção pode aguardar se não houver material nem capacidade diária de importação.
- **Armazenamento:** o pátio inicial comporta 300 toneladas; cada armazém ativo acrescenta 400 toneladas.
- **Exportação:** excedentes acima da capacidade são vendidos por $ 6 por tonelada.
- **Pesquisa:** construção moderna reduz em 30% os materiais exigidos; pesquisa de coleta aumenta a capacidade dos veículos de resíduos em 30%.
- **Reparos:** usinas sobrecarregadas podem se desgastar e parar; restaurá-las tem o preço informado na definição de cada usina.
- **Parques e atrações:** todos têm custo-base; parques recreativos usam a parcela populacional menor de 10%. Outras estruturas cívicas podem usar a parcela geral.

Antes de expandir, consulte a previsão do próximo mês e deixe uma reserva para manutenção, construção e materiais importados.
