/**
 * SettingsIdentityTab — DID Registration panel.
 * Register a human-readable did:envoy:<name> to make your identity
 * portable and shareable. The underlying envoy:owner:<hash> always
 * remains the cryptographic source of truth.
 */
import { useEffect, useState } from "react";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useT } from "../../context/I18nContext.js";

export function SettingsIdentityTab() {
  const t = useT();
  const nodeService = useNodeService();
  const [didName, setDidName] = useState("");
  const [status, setStatus] = useState<"idle" | "registering" | "registered" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [ownerId, setOwnerId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const profile = await nodeService.getProfile();
        if (!cancelled && profile?.owner?.ownerId) {
          setOwnerId(profile.owner.ownerId);
        }
      } catch { /* ignore */ }
    }
    void load();
    return () => { cancelled = true; };
  }, [nodeService]);

  const handleRegister = async () => {
    const name = didName.toLowerCase().trim();
    if (name.length < 3) {
      setErrorMsg(t("settings.identity.nameTooShort", "Name must be at least 3 characters"));
      setStatus("error");
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(name)) {
      setErrorMsg(t("settings.identity.nameInvalid", "Only lowercase letters, numbers, and hyphens"));
      setStatus("error");
      return;
    }

    setStatus("registering");
    setErrorMsg("");

    try {
      // Call the DID registration via the existing RPC surface
      // (uses the same provideCapabilityTopic DHT infrastructure)
      await nodeService.advertiseTopic(`did:envoy:${name}`);
      setStatus("registered");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  return (
    <div className="settings-section">
      <h3>{t("settings.identity.heading", "Identity")}</h3>
      <p className="section-desc">
        {t("settings.identity.sectionDesc", "Register a human-readable name that others can use to find you on the mesh.")}
      </p>

      {ownerId && (
        <div className="settings-info-box">
          <label className="settings-info-label">
            {t("settings.identity.ownerId", "Owner ID")}
          </label>
          <code className="settings-info-code">{ownerId}</code>
          <p className="field-desc" style={{ marginTop: "4px" }}>
            {t("settings.identity.ownerIdDesc", "Your cryptographic identity — always works, even without a DID name.")}
          </p>
        </div>
      )}

      <div className="settings-form-row" style={{ marginTop: "16px" }}>
        <label htmlFor="did-name-input">
          <strong>{t("settings.identity.didNameLabel", "DID Name")}</strong>
        </label>
        <div className="did-input-row" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>did:envoy:</span>
          <input
            id="did-name-input"
            type="text"
            className="settings-input"
            placeholder={t("settings.identity.didPlaceholder", "your-name")}
            value={didName}
            onChange={(e) => {
              setDidName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              if (status === "error" || status === "registered") setStatus("idle");
            }}
            maxLength={32}
            disabled={status === "registering" || status === "registered"}
          />
          <button
            type="button"
            className="primary"
            onClick={() => void handleRegister()}
            disabled={status === "registering" || status === "registered" || didName.trim().length < 3}
          >
            {status === "registering"
              ? t("settings.identity.registering", "Registering...")
              : status === "registered"
                ? t("settings.identity.registered", "Registered ✓")
                : t("settings.identity.register", "Register")}
          </button>
        </div>

        {status === "registered" && (
          <p className="success-message" style={{ marginTop: "8px", color: "var(--color-success)" }}>
            {t("settings.identity.registeredDesc", "Your DID is now did:envoy:{name}. Others can find you by typing this name in search.", { name: didName })}
          </p>
        )}

        {status === "error" && (
          <p className="error-message" style={{ marginTop: "8px", color: "var(--color-error)" }}>
            {errorMsg}
          </p>
        )}

        <p className="field-desc" style={{ marginTop: "8px" }}>
          {t("settings.identity.didNameHint", "3-32 characters. Lowercase letters, numbers, and hyphens only. First to register wins.")}
        </p>
      </div>
    </div>
  );
}

export { SettingsIdentityTab as default };
