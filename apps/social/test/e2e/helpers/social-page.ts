/**
 * Social UI page object for Phase 38 WebRTC E2E smoke tests.
 *
 * Provides high-level actions the Playwright test uses to simulate
 * a human↔human call flow through the EnvoyMesh Social UI.
 *
 * Each browser context represents one peer (caller or callee).
 * The test opens two pages, bonds the peers, and exercises the
 * full call lifecycle.
 */

import type { Page, BrowserContext } from "@playwright/test";

export class SocialPage {
  constructor(
    public readonly page: Page,
    private readonly label: string,
  ) {}

  /** Navigate to the Social UI and wait for it to load. */
  async open(): Promise<void> {
    await this.page.goto("/");
    // Wait for the main layout to render
    await this.page.waitForSelector("[data-testid='chat-layout']", { timeout: 15_000 }).catch(() => {
      // Fallback: wait for any content that indicates the app loaded
      return this.page.waitForSelector("text=EnvoyMesh", { timeout: 10_000 });
    });
    console.log(`[social-page] ${this.label} loaded`);
  }

  /**
   * Open a chat with a specific contact by clicking their name in the sidebar.
   * Assumes bonds already exist between the two nodes.
   */
  async openChatWith(peerDisplayName: string): Promise<void> {
    // Click the contact in the sidebar
    const contact = this.page.locator(`[data-testid='contact-item']`, { hasText: peerDisplayName });
    if (await contact.count() === 0) {
      // Fallback: try clicking any text matching the peer name
      await this.page.click(`text=${peerDisplayName}`);
    } else {
      await contact.first().click();
    }
    // Wait for the chat panel to appear
    await this.page.waitForSelector("[data-testid='chat-messages']", { timeout: 5_000 }).catch(() => {});
    console.log(`[social-page] ${this.label} opened chat with ${peerDisplayName}`);
  }

  /** Click the phone icon to initiate a call. */
  async initiateCall(): Promise<void> {
    const phoneBtn = this.page.locator("[data-testid='call-button']");
    await phoneBtn.click();
    console.log(`[social-page] ${this.label} initiated call`);
  }

  /** Verify the calling-state banner is visible. */
  async expectCallingBanner(peerDisplayName: string): Promise<void> {
    const banner = this.page.locator(".calling-banner");
    await banner.waitFor({ state: "visible", timeout: 5_000 });
    await this.page.waitForFunction(
      (name) => document.querySelector(".calling-banner")?.textContent?.includes(name),
      peerDisplayName,
    );
    console.log(`[social-page] ${this.label} sees calling banner for ${peerDisplayName}`);
  }

  /** Click Cancel on the calling-state banner. */
  async cancelCall(): Promise<void> {
    await this.page.click(".calling-banner-cancel");
    console.log(`[social-page] ${this.label} cancelled call`);
  }

  /** Verify the IncomingCallModal is visible and shows the expected caller name. */
  async expectIncomingModal(callerName: string): Promise<void> {
    const modal = this.page.locator("[data-testid='incoming-call-modal']");
    await modal.waitFor({ state: "visible", timeout: 5_000 });
    // Verify caller name is shown
    await this.page.waitForFunction(
      (name) => document.querySelector("[data-testid='incoming-call-modal']")?.textContent?.includes(name),
      callerName,
    );
    console.log(`[social-page] ${this.label} sees incoming call from ${callerName}`);
  }

  /** Click Accept on the incoming call modal. */
  async acceptCall(): Promise<void> {
    await this.page.click("[data-testid='incoming-call-accept']");
    console.log(`[social-page] ${this.label} accepted call`);
  }

  /** Click Decline on the incoming call modal. */
  async declineCall(): Promise<void> {
    await this.page.click("[data-testid='incoming-call-decline']");
    console.log(`[social-page] ${this.label} declined call`);
  }

  /** Verify the ActiveCallPanel is visible. */
  async expectActiveCallPanel(): Promise<void> {
    const panel = this.page.locator("[data-testid='active-call-panel']");
    await panel.waitFor({ state: "visible", timeout: 5_000 });
    console.log(`[social-page] ${this.label} sees active call panel`);
  }

  /** Click the mute toggle button. */
  async toggleMute(): Promise<void> {
    await this.page.click("[data-testid='call-mute-toggle']");
    console.log(`[social-page] ${this.label} toggled mute`);
  }

  /** Verify the mute icon reflects the muted state. */
  async expectMuted(expected: boolean): Promise<void> {
    const btn = this.page.locator("[data-testid='call-mute-toggle']");
    const title = await btn.getAttribute("title");
    if (expected) {
      if (!title?.toLowerCase().includes("unmute")) {
        throw new Error(`Expected mute button to show "Unmute" but got "${title}"`);
      }
    } else {
      if (!title?.toLowerCase().includes("mute") || title?.toLowerCase().includes("unmute")) {
        throw new Error(`Expected mute button to show "Mute" but got "${title}"`);
      }
    }
    console.log(`[social-page] ${this.label} mute state confirmed: ${expected}`);
  }

  /** Click the end call button. */
  async endCall(): Promise<void> {
    await this.page.click("[data-testid='call-end-button']");
    console.log(`[social-page] ${this.label} ended call`);
  }

  /** Verify both panels are gone (call fully ended). */
  async expectCallEnded(): Promise<void> {
    await this.page.waitForFunction(() => {
      const active = document.querySelector("[data-testid='active-call-panel']");
      const incoming = document.querySelector("[data-testid='incoming-call-modal']");
      const banner = document.querySelector(".calling-banner");
      return !active && !incoming && !banner;
    }, { timeout: 5_000 });
    console.log(`[social-page] ${this.label} call ended`);
  }

  /**
   * Evaluate WebRTC connection state in the browser.
   * Returns the `connectionState` from any active RTCPeerConnection.
   */
  async getConnectionState(): Promise<string> {
    return this.page.evaluate(() => {
      // Access the global RTCPeerConnection (stored on window for test purposes)
      const pc = (window as any).__testRtcPeerConnection as RTCPeerConnection | undefined;
      return pc?.connectionState ?? "unknown";
    });
  }
}
