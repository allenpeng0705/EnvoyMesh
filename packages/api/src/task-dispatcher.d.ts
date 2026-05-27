import { type EnvoyEnvelope, type EnvoyIntent, type ReportCreatePayload, type TaskAcceptPayload, type TaskCancelPayload, type TaskHeartbeatPayload, type TaskJournalEntry, type TaskLifecycleState, type TaskMandatePayload, type TaskNegotiatePayload, type TaskProposePayload, type TaskRejectPayload, type TaskResultPayload } from "@envoymesh/protocol";
export type A2ATaskIntent = "task.mandate" | "task.propose" | "task.negotiate" | "task.accept" | "task.reject" | "task.cancel" | "task.heartbeat" | "task.result" | "report.create";
export type A2ATaskPayloadByIntent = {
    "task.mandate": TaskMandatePayload;
    "task.propose": TaskProposePayload;
    "task.negotiate": TaskNegotiatePayload;
    "task.accept": TaskAcceptPayload;
    "task.reject": TaskRejectPayload;
    "task.cancel": TaskCancelPayload;
    "task.heartbeat": TaskHeartbeatPayload;
    "task.result": TaskResultPayload;
    "report.create": ReportCreatePayload;
};
export type DispatcherDecision = {
    action: "handled";
    intent: A2ATaskIntent;
    taskId: string;
    mandateId?: string;
    state: TaskLifecycleState;
    journalEntry: TaskJournalEntry;
} | {
    action: "ignored";
    intent: EnvoyIntent;
    reason: string;
} | {
    action: "rejected";
    intent: EnvoyIntent;
    reason: string;
};
export type TaskHandler<TIntent extends A2ATaskIntent> = (input: {
    envelope: EnvoyEnvelope<A2ATaskPayloadByIntent[TIntent]>;
    payload: A2ATaskPayloadByIntent[TIntent];
    defaultDecision: Extract<DispatcherDecision, {
        action: "handled";
    }>;
}) => DispatcherDecision | Promise<DispatcherDecision>;
export type TaskDispatcherHandlers = {
    [TIntent in A2ATaskIntent]?: TaskHandler<TIntent>;
};
export interface TaskDispatcher {
    dispatch(envelope: EnvoyEnvelope): Promise<DispatcherDecision>;
}
export declare function createTaskDispatcher(handlers?: TaskDispatcherHandlers): TaskDispatcher;
export declare function isA2ATaskIntent(intent: EnvoyIntent): intent is A2ATaskIntent;
export declare function parseA2APayload<TIntent extends A2ATaskIntent>(intent: TIntent, payload: unknown): A2ATaskPayloadByIntent[TIntent];
//# sourceMappingURL=task-dispatcher.d.ts.map