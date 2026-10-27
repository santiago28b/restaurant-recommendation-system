/**
 * Monthly spending cap for Places calls.
 *
 * Tracks estimated spend in memory and refuses calls that would go over the
 * cap. It is per server instance, so it is a safety net, not the only guard:
 * also set a daily request quota on the Places API in Google Cloud Console.
 */
export class BudgetExceededError extends Error {
  constructor(
    public spentUsd: number,
    public capUsd: number,
  ) {
    super(
      `Places monthly budget reached: $${spentUsd.toFixed(2)} of $${capUsd.toFixed(2)} used`,
    );
    this.name = "BudgetExceededError";
  }
}

export interface BudgetStatus {
  month: string;
  spentUsd: number;
  capUsd: number;
  requests: number;
}

const monthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export class SpendTracker {
  private month: string;
  private spentUsd = 0;
  private requests = 0;

  constructor(
    private capUsd: number,
    private costPerRequestUsd: number,
    private now: () => Date = () => new Date(),
  ) {
    this.month = monthKey(this.now());
  }

  private rollMonth() {
    const m = monthKey(this.now());
    if (m !== this.month) {
      this.month = m;
      this.spentUsd = 0;
      this.requests = 0;
    }
  }

  /** Throws BudgetExceededError if one more call would go over the cap. */
  assertCanSpend(): void {
    this.rollMonth();
    if (this.spentUsd + this.costPerRequestUsd > this.capUsd) {
      throw new BudgetExceededError(this.spentUsd, this.capUsd);
    }
  }

  /** Record one billed call. */
  record(): void {
    this.rollMonth();
    this.spentUsd += this.costPerRequestUsd;
    this.requests += 1;
  }

  status(): BudgetStatus {
    this.rollMonth();
    return {
      month: this.month,
      spentUsd: Math.round(this.spentUsd * 1000) / 1000,
      capUsd: this.capUsd,
      requests: this.requests,
    };
  }
}
