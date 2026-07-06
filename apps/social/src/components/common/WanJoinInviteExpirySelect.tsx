import {
  WAN_JOIN_INVITE_EXPIRY_PRESETS,
  type WanJoinInviteExpiryPresetId,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";

const PRESET_ORDER: WanJoinInviteExpiryPresetId[] = ["days7", "days30", "year1"];

export function expiresInHoursForPreset(preset: WanJoinInviteExpiryPresetId): number {
  return WAN_JOIN_INVITE_EXPIRY_PRESETS[preset];
}

type Props = {
  id?: string;
  value: WanJoinInviteExpiryPresetId;
  onChange: (preset: WanJoinInviteExpiryPresetId) => void;
  disabled?: boolean;
  /** When set, use settings.network.agentBridge.expiry.* keys instead of discover.share.expiry.* */
  messageScope?: "discover" | "settings";
};

export function WanJoinInviteExpirySelect({
  id,
  value,
  onChange,
  disabled,
  messageScope = "discover",
}: Props) {
  const t = useT();
  const prefix =
    messageScope === "settings"
      ? "settings.network.agentBridge.expiry"
      : "discover.share.expiry";

  return (
    <div className="form-group" style={{ marginBottom: 8 }}>
      <label htmlFor={id}>{t(`${prefix}.label`)}</label>
      <select
        id={id}
        className="settings-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as WanJoinInviteExpiryPresetId)}
      >
        {PRESET_ORDER.map((preset) => (
          <option key={preset} value={preset}>
            {t(`${prefix}.${preset}`)}
          </option>
        ))}
      </select>
      {value === "year1" ? (
        <small className="settings-hint">{t(`${prefix}.year1Hint`)}</small>
      ) : null}
    </div>
  );
}
