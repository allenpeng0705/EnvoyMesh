/** Insert `text` into a text control at the current selection (or end). */
export function insertTextAtCaret(
  element: HTMLTextAreaElement | HTMLInputElement,
  text: string,
): { value: string; caret: number } {
  const current = element.value;
  const start = element.selectionStart ?? current.length;
  const end = element.selectionEnd ?? start;
  const next = current.slice(0, start) + text + current.slice(end);
  const caret = start + text.length;
  return { value: next, caret };
}
