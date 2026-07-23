/**
 * Phase 45D — Per-item web content visibility selector.
 */
import type { PublishWebContentVisibility } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";

export interface VisibilitySelectorProps {
  value: PublishWebContentVisibility;
  onChange: (value: PublishWebContentVisibility) => void;
  disabled?: boolean;
  id?: string;
  "data-testid"?: string;
}

const OPTION_VALUES: PublishWebContentVisibility[] = [
  "public",
  "bonded",
  "contacts",
  "private",
];

export function VisibilitySelector({
  value,
  onChange,
  disabled,
  id = "web-content-visibility",
  "data-testid": testId = "visibility-selector",
}: VisibilitySelectorProps) {
  const t = useT();
  const labels: Record<PublishWebContentVisibility, string> = {
    public: t("browser.author.visibilityPublic", "Public"),
    bonded: t("browser.author.visibilityBonded", "Bonded contacts"),
    contacts: t("browser.author.visibilityContacts", "Selected contacts"),
    private: t("browser.author.visibilityPrivate", "Private (owner only)"),
  };

  return (
    <select
      id={id}
      className="visibility-selector"
      data-testid={testId}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PublishWebContentVisibility)}
    >
      {OPTION_VALUES.map((opt) => (
        <option key={opt} value={opt}>
          {labels[opt]}
        </option>
      ))}
    </select>
  );
}
