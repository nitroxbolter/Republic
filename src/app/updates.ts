/** Add published, player-facing changes here, newest first. Both start screens use this list. */
export interface UpdateEntry {
  readonly date: string;
  readonly title: string;
  readonly changes: readonly string[];
}

export const UPDATES: readonly UpdateEntry[] = [
  {
    date: '2026-11-13',
    title: 'Banco da cidade',
    changes: [
      'Aplique recursos de 1 a 12 meses e receba juros compostos no vencimento.',
      'Tome empréstimos para financiar obras e subsídios; as parcelas são debitadas a cada fechamento mensal.',
      'O orçamento mostra juros, resgates e amortizações separadamente.',
    ],
  },
];
