# Team jobs — Job input delivery (not vault sync)

> Status: **designed (Phase 59)** — implement **after Phase 58**.
>
> Related: [`agent-network-ux-team-jobs.md`](./agent-network-ux-team-jobs.md) ·
> [`agent-network-artifacts.md`](./agent-network-artifacts.md) ·
> [`p2p-file-sharing-plan.md`](./p2p-file-sharing-plan.md) ·
> [`implementation-plan.md`](./implementation-plan.md) Phase 59.

## Idea

Composer attachments stay on the Assigner home today. Remote workers often cannot open the real file.

**Do not** build vault sync. **Do** one-shot **job input delivery**:

1. On award (default), push attachment bytes via Data Transfer Voucher + `/envoymesh/data/0.1.0`.
2. Worker writes `imports/team-jobs/<chainId>/in/<safeName>`.
3. Verify `contentHash`; propose/`inputArtifacts` use the **local** path.
4. Show delivery status; GC workspace with the job.

## Non-goals

Bidirectional sync; copying the whole Library; replacing Phase 53 small text packs.

## Waves

59A schema/wire → 59B deliver-on-award → 59C executor path → 59D UI → 59E E2E + GC.

## Open questions (59A)

Auto-on-award vs toggle; all attachments vs referenced-only; GC timing; WAN failure UX.
