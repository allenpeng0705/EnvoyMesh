export interface LabEnvelope {
  intent: string;
  from: string;
  to: string;
  payload?: unknown;
}

/** Deterministic fault controller used in front of real-node delivery seams. */
export class AgentNetworkLabTransport {
  private readonly partitions = new Set<string>();
  private readonly dropRules: Array<{ intent: string; from?: string; to?: string }> = [];
  readonly delivered: LabEnvelope[] = [];

  partition(a: string, b: string): void {
    this.partitions.add(this.edge(a, b));
  }

  heal(a: string, b: string): void {
    this.partitions.delete(this.edge(a, b));
  }

  dropNext(intent: string, filter?: { from?: string; to?: string }): void {
    this.dropRules.push({ intent, ...filter });
  }

  send(envelope: LabEnvelope): boolean {
    if (this.partitions.has(this.edge(envelope.from, envelope.to))) return false;
    const ruleIndex = this.dropRules.findIndex(
      (rule) =>
        rule.intent === envelope.intent &&
        (!rule.from || rule.from === envelope.from) &&
        (!rule.to || rule.to === envelope.to),
    );
    if (ruleIndex >= 0) {
      this.dropRules.splice(ruleIndex, 1);
      return false;
    }
    this.delivered.push(envelope);
    return true;
  }

  private edge(a: string, b: string): string {
    return [a, b].sort().join("::");
  }
}
