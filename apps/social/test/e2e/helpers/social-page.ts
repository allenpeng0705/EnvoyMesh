/**
 * Social UI page object for Phase 38 WebRTC E2E smoke tests.
 *
 * Uses real CSS class selectors from the actual Social UI components:
 *   .chat-header-call-btn   — phone icon in chat header (ContactChatPanel)
 *   .calling-banner         — outbound calling state banner
 *   .calling-banner-cancel  — cancel button in calling banner
 *   .incoming-call-modal    — IncomingCallModal container
 *   .incoming-call-accept   — Accept button
 *   .incoming-call-decline  — Decline button
 *   .active-call-panel      — ActiveCallPanel container
 *   button[title="Mute"] / button[title="Unmute"] — mute toggle
 *   button[title="End call"] — end call button
 */

import type { Page } from "@playwright/test";

export class SocialPage {
  constructor(
    public readonly page: Page,
    private readonly label: string,
  ) {}

  /** Navigate to the Social UI and wait for it to load. */
  async open(): Promise<void> {
    await this.page.goto("/");
    // Wait for the app shell to render (the Social UI always shows
    // at minimum the sidebar with "EnvoyMesh" branding).
    await this.page.waitForLoadState("networkidle").catch(() => {});
    // Accept that the page loaded — even without contacts, the
    // sidebar should be visible.
    await this.page.waitForTimeout(2000);
    console.log(`[social-page] ${this.label} loaded`);
  }

  /**
   * Check if any bonded contacts are visible in the sidebar.
   * Returns true if at least one contact item is present.
   */
  async hasContacts(): Promise<boolean> {
    // The sidebar uses .contact-list or similar; look for any
    // element that looks like a contact entry.
    const contacts = this.page.locator(".contact-item, .chat-contact, [class*='contact']");
    return (await contacts.count()) > 0;
  }

  /**
   * Open a chat with a specific contact by clicking their name.
   * Falls back to clicking any visible text matching the name.
   */
  async openChatWith(peerDisplayName: string): Promise<void> {
    // Try clicking text matching the peer name
    await this.page.click(`text=${peerDisplayName}`);
    await this.page.waitForTimeout(500);
    console.log(`[social-page] ${this.label} opened chat with ${peerDisplayName}`);
  }

  /** Click the phone icon to initiate a call. */
  async initiateCall(): Promise<void> {
    await this.page.click(".chat-header-call-btn");
    console.log(`[social-page] ${this.label} initiated call`);
  }

  /** Verify the calling-state banner is visible. */
  async expectCallingBanner(peerDisplayName: string): Promise<void> {
    const banner = this.page.locator(".calling-banner");
    await banner.waitFor({ state: "visible", timeout: 8_000 });
    // Verify the banner contains the peer's name
    const text = await banner.textContent();
    if (!text?.includes(peerDisplayName)) {
      throw new Error(`Calling banner should contain "${peerDisplayName}" but got "${text}"`);
    }
    console.log(`[social-page] ${this.label} sees calling banner for ${peerDisplayName}`);
  }

  /** Click Cancel on the calling-state banner. */
  async cancelCall(): Promise<void> {
    await this.page.click(".calling-banner-cancel");
    console.log(`[social-page] ${this.label} cancelled call`);
  }

  /** Verify the IncomingCallModal is visible. */
  async expectIncomingModal(callerName: string): Promise<void> {
    const modal = this.page.locator(".incoming-call-modal");
    await modal.waitFor({ state: "visible", timeout: 8_000 });
    const text = await modal.textContent();
    if (!text?.includes(callerName)) {
      throw new Error(`Incoming modal should contain "${callerName}" but got "${text}"`);
    }
    console.log(`[social-page] ${this.label} sees incoming call from ${callerName}`);
  }

  /** Click Accept on the incoming call modal. */
  async acceptCall(): Promise<void> {
    await this.page.click(".incoming-call-accept");
    console.log(`[social-page] ${this.label} accepted call`);
  }

  /** Click Decline on the incoming call modal. */
  async declineCall(): Promise<void> {
    await this.page.click(".incoming-call-decline");
    console.log(`[social-page] ${this.label} declined call`);
  }

  /** Verify the ActiveCallPanel is visible. */
  async expectActiveCallPanel(): Promise<void> {
    await this.page.locator(".active-call-panel").waitFor({ state: "visible", timeout: 8_000 });
    console.log(`[social-page] ${this.label} sees active call panel`);
  }

  /** Click the mute toggle button. */
  async toggleMute(): Promise<void> {
    // The mute button has title="Mute" or title="Unmute"
    const btn = this.page.locator(".active-call-panel button[title]").first();
    await btn.click();
    console.log(`[social-page] ${this.label} toggled mute`);
  }

  /** Click the end call button. */
  async endCall(): Promise<void> {
    await this.page.click("button[title='End call']");
    console.log(`[social-page] ${this.label} ended call`);
  }

  /** Verify all call panels are gone (call fully ended). */
  async expectCallEnded(): Promise<void> {
    await this.page.waitForFunction(() => {
      const active = document.querySelector(".active-call-panel");
      const incoming = document.querySelector(".incoming-call-modal");
      const banner = document.querySelector(".calling-banner");
      return !active && !incoming && !banner;
    }, { timeout: 5_000 });
    console.log(`[social-page] ${this.label} call ended`);
  }

  /** Evaluate WebRTC connection state in the browser (if available). */
  async getConnectionState(): Promise<string> {
    return this.page.evaluate(() => {
      const pc = (window as any).__testRtcPeerConnection as RTCPeerConnection | undefined;
      return pc?.connectionState ?? "unknown";
    });
  }
}
