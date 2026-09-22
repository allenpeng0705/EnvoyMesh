/**
 * Catalog ACP `session/user_question` — same reply shape as EnvoyCoder /
 * Envoy Harness `ask_user` (single pick / multi / free text).
 */

export type CatalogUserQuestion = {
  prompt: string;
  options?: readonly string[];
  recommendedIndex?: number;
  multiline?: boolean;
  multiple?: boolean;
  questionId?: string;
};

export type CatalogUserQuestionAnswer = {
  value: string;
  optionIndex?: number;
  optionIndexes?: readonly number[];
  cancelled?: boolean;
};

/** Parse ACP `session/user_question` params into a stable shape. */
export function extractCatalogUserQuestion(
  params: Record<string, unknown>,
): CatalogUserQuestion {
  const optionsRaw = params.options;
  const options = Array.isArray(optionsRaw)
    ? optionsRaw.map((item) => String(item ?? ""))
    : undefined;
  const recommended = params.recommendedIndex;
  return {
    prompt: typeof params.prompt === "string" ? params.prompt : "",
    ...(options !== undefined ? { options } : {}),
    ...(typeof recommended === "number" && Number.isInteger(recommended)
      ? { recommendedIndex: recommended }
      : {}),
    ...(params.multiline === true ? { multiline: true } : {}),
    ...(params.multiple === true ? { multiple: true } : {}),
    ...(typeof params.questionId === "string" && params.questionId.trim()
      ? { questionId: params.questionId.trim() }
      : {}),
  };
}

/**
 * Reply body for one user question.
 *
 * Single pick → `{ value, optionIndex }`. Several → `{ value, optionIndexes }`.
 * Typed → `{ value }`. Skip → `{ value: "", cancelled: true }`.
 */
export function catalogUserQuestionReply(
  request: CatalogUserQuestion,
  answer: CatalogUserQuestionAnswer | null,
): unknown {
  if (answer === null || answer.cancelled === true) {
    return { value: "", cancelled: true };
  }
  const options = request.options ?? [];
  if (options.length === 0) {
    const value = answer.value.trim();
    if (value === "") return { value: "", cancelled: true };
    return { value, cancelled: false };
  }
  const indexes = (
    answer.optionIndexes && answer.optionIndexes.length > 0
      ? [...answer.optionIndexes]
      : answer.optionIndex !== undefined
        ? [answer.optionIndex]
        : []
  ).filter(
    (index) =>
      Number.isInteger(index) && index >= 0 && index < options.length,
  );
  if (indexes.length === 0) return { value: "", cancelled: true };
  const labels = indexes.map((index) => options[index] ?? "");
  if (request.multiple === true || indexes.length > 1) {
    return {
      value: labels.join(", "),
      optionIndexes: indexes,
      cancelled: false,
    };
  }
  return {
    value: labels[0] ?? "",
    optionIndex: indexes[0],
    cancelled: false,
  };
}
