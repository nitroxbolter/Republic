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
| Torre de água | $ 1.200 | $ 80 |
| Usina a carvão | $ 4.000 | $ 150 |
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
- Centros de reciclagem também geram receita pela venda dos materiais recuperados; essa parcela não depende da alíquota.
- A alíquota afeta o crescimento: cada ponto percentual acima dos 9% de referência reduz a demanda de zoneamento; abaixo da referência, a pressão tributária sobre a demanda é menor.

### Recebimento dos impostos

Na cidade de jogador, os impostos mensais ficam no cofre da Prefeitura, em vez de entrarem automaticamente no saldo disponível. É preciso construir uma Prefeitura funcional, conectada à via, e usar **Recolher impostos** no painel de orçamento. O cofre comporta até seis meses de receita; valores acima da capacidade se perdem. Enquanto isso, as despesas mensais continuam sendo debitadas do caixa. A previsão do painel não deve ser confundida com o dinheiro já disponível.

## Orçamento e outras despesas

O resultado mensal é a receita de impostos e reciclagem menos manutenção. Um resultado negativo reduz o caixa. Na cidade de jogador, quando a arrecadação está guardada na Prefeitura, o custo mensal ainda é debitado imediatamente.

Além das despesas mensais:

- **Materiais de construção:** indústrias produzem materiais. Novos edifícios zonados usam materiais; se faltar estoque, o jogo pode importar até 6 toneladas por dia a $ 25 por tonelada. A construção pode aguardar se não houver material nem capacidade diária de importação.
- **Armazenamento:** o pátio inicial comporta 300 toneladas; cada armazém ativo acrescenta 400 toneladas.
- **Exportação:** excedentes acima da capacidade são vendidos por $ 6 por tonelada.
- **Pesquisa:** construção moderna reduz em 30% os materiais exigidos; pesquisa de coleta aumenta a capacidade dos veículos de resíduos em 30%.
- **Reparos:** usinas sobrecarregadas podem se desgastar e parar; restaurá-las tem o preço informado na definição de cada usina.
- **Parques e atrações:** todos têm custo-base; parques recreativos usam a parcela populacional menor de 10%. Outras estruturas cívicas podem usar a parcela geral.

Antes de expandir, consulte a previsão do próximo mês e deixe uma reserva para manutenção, construção e materiais importados.
