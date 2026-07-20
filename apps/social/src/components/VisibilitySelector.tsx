/**
 * Phase 45D — Per-item web content visibility selector.
 */
import type { PublishWebContentVisibility } from "@envoymesh/api";

export interface VisibilitySelectorProps {
  value: PublishWebContentVisibility;
  onChange: (value: PublishWebContentVisibility) => void;
  disabled?: boolean;
  id?: string;
  "data-testid"?: string;
}

const OPTIONS: { value: PublishWebContentVisibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "bonded", label: "Bonded contacts" },
  { value: "contacts", label: "Selected contacts" },
  { value: "private", label: "Private (owner only)" },
];

export function VisibilitySelector({
  value,
  onChange,
  disabled,
  id = "web-content-visibility",
  "data-testid": testId = "visibility-selector",
}: VisibilitySelectorProps) {
  return (
    <select
      id={id}
      className="visibility-selector"
      data-testid={testId}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PublishWebContentVisibility)}
    >
      {OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
