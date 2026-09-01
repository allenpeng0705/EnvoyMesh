/**
 * Phase 63 — Envoy Market: Browse (MarketCache / bonds announce) + My Shop CRUD.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  MarketBrowseCard,
  MarketBrowseSuggestionChip,
  ShopListing,
  ShopListingCategory,
  ShopListingCondition,
  ShopListingStatus,
  ShopListingVisibility,
  ShopProfile,
} from "@envoymesh/api";
import {
  SHOP_LISTING_CATEGORIES,
  SHOP_LISTING_CONDITIONS,
  SHOP_LISTING_STATUSES,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { openChatWithPeer } from "../../lib/open-chat-nav.js";
import { MarketCardThumb } from "../MarketCardThumb.js";

type MarketPane = "browse" | "shop";

const CHIP_LABEL_KEYS: Record<string, string> = {
  books: "market.chipBooks",
  electronics: "market.chipElectronics",
  clothing: "market.chipClothing",
  home: "market.chipHome",
  digital: "market.chipDigital",
};

const EMPTY_FORM = {
  listingId: undefined as string | undefined,
  title: "",
  description: "",
  category: "other" as ShopListingCategory,
  tags: "",
  condition: "good" as ShopListingCondition,
  status: "active" as ShopListingStatus,
  visibility: "public" as ShopListingVisibility,
  priceAmount: "",
  priceCurrency: "CNY",
};

function formatPrice(listing: { price: { amount: string; currency: string } }): string {
  return `${listing.price.amount} ${listing.price.currency}`;
}

function statusLabelKey(status: ShopListingStatus): string {
  switch (status) {
    case "active":
      return "market.statusActive";
    case "reserved":
      return "market.statusReserved";
    case "sold":
      return "market.statusSold";
    case "withdrawn":
      return "market.statusWithdrawn";
    default:
      return "market.statusActive";
  }
}

function categoryLabelKey(category: ShopListingCategory): string {
  switch (category) {
    case "books":
      return "market.categoryBooks";
    case "electronics":
      return "market.categoryElectronics";
    case "clothing":
      return "market.categoryClothing";
    case "home":
      return "market.categoryHome";
    case "digital":
      return "market.categoryDigital";
    default:
      return "market.categoryOther";
  }
}

function conditionLabelKey(condition: ShopListingCondition): string {
  switch (condition) {
    case "new":
      return "market.conditionNew";
    case "like_new":
      return "market.conditionLikeNew";
    case "good":
      return "market.conditionGood";
    case "fair":
      return "market.conditionFair";
    case "digital":
      return "market.conditionDigital";
    default:
      return "market.conditionGood";
  }
}

function shortOwner(ownerId: string): string {
  if (ownerId.length <= 18) return ownerId;
  return `${ownerId.slice(0, 10)}…${ownerId.slice(-6)}`;
}

export function MarketView() {
  const t = useT();
  const nodeService = useNodeService();
  const { bonds, humanProfile, sendHello } = useNodeState();
  const statusLabel = (status: ShopListingStatus) => t(statusLabelKey(status));
  const categoryLabel = (category: ShopListingCategory) => t(categoryLabelKey(category));
  const conditionLabel = (condition: ShopListingCondition) => t(conditionLabelKey(condition));
  const [pane, setPane] = useState<MarketPane>("browse");
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [listings, setListings] = useState<ShopListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [shopName, setShopName] = useState("");
  const [shopBio, setShopBio] = useState("");
  const [shopVisibility, setShopVisibility] = useState<ShopListingVisibility>("public");
  const [browseQuery, setBrowseQuery] = useState("");
  const [browseSubmitted, setBrowseSubmitted] = useState<string | null>(null);
  const [browseSuggested, setBrowseSuggested] = useState(false);
  const [browseCards, setBrowseCards] = useState<MarketBrowseCard[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoaded, setBrowseLoaded] = useState(false);
  const [chips, setChips] = useState<MarketBrowseSuggestionChip[]>([]);
  const [inquiringId, setInquiringId] = useState<string | null>(null);
  const [addBondOwnerId, setAddBondOwnerId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [browseCategory, setBrowseCategory] = useState<ShopListingCategory | "">("");
  const [browseMinPrice, setBrowseMinPrice] = useState("");
  const [browseMaxPrice, setBrowseMaxPrice] = useState("");
  const [browseCurrency, setBrowseCurrency] = useState("CNY");
  const [paymentHintDismissed, setPaymentHintDismissed] = useState(false);
  const [pendingMediaPath, setPendingMediaPath] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);

  const refreshBrowse = useCallback(
    async (query?: string, opts?: { suggested?: boolean }) => {
      setBrowseLoading(true);
      setError(null);
      try {
        const result = await nodeService.marketSearch({
          query: query?.trim() || undefined,
          limit: 40,
          category: browseCategory || undefined,
          minPrice: browseMinPrice.trim() || undefined,
          maxPrice: browseMaxPrice.trim() || undefined,
          currency: browseCurrency.trim() || undefined,
        });
        setBrowseCards(result.cards);
        setBrowseLoaded(true);
        setBrowseSuggested(Boolean(opts?.suggested));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBrowseLoading(false);
      }
    },
    [nodeService, browseCategory, browseMinPrice, browseMaxPrice, browseCurrency],
  );

  const loadSuggestions = useCallback(async () => {
    try {
      const result = await nodeService.marketBrowseSuggestions();
      setChips(result.chips);
      return result.defaultQuery;
    } catch {
      setChips([
        { id: "books", query: "books", source: "builtin" },
        { id: "electronics", query: "electronics", source: "builtin" },
        { id: "clothing", query: "clothing", source: "builtin" },
        { id: "home", query: "home", source: "builtin" },
        { id: "digital", query: "digital", source: "builtin" },
      ]);
      return "books";
    }
  }, [nodeService]);

  const runBrowseSearch = (raw: string) => {
    const q = raw.trim();
    setBrowseQuery(q);
    setBrowseSubmitted(q || null);
    setBrowseSuggested(false);
    void refreshBrowse(q);
  };

  const openBrowseDefault = useCallback(async () => {
    const defaultQuery = await loadSuggestions();
    if (!browseSubmitted) {
      const q = defaultQuery?.trim() || "";
      setBrowseQuery(q);
      setBrowseSubmitted(null);
      await refreshBrowse(q || undefined, { suggested: true });
    } else {
      await refreshBrowse(browseSubmitted);
    }
  }, [browseSubmitted, loadSuggestions, refreshBrowse]);

  const refreshShop = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileResult, listResult] = await Promise.all([
        nodeService.shopGetProfile(),
        nodeService.shopListListings(),
      ]);
      setProfile(profileResult.profile);
      setShopName(profileResult.profile?.displayName ?? "");
      setShopBio(profileResult.profile?.bio ?? "");
      setShopVisibility(profileResult.profile?.defaultVisibility ?? "public");
      setListings(listResult.listings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [nodeService]);

  useEffect(() => {
    if (pane === "shop") void refreshShop();
    if (pane === "browse") void openBrowseDefault();
  }, [pane, refreshShop, openBrowseDefault]);

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await nodeService.shopUpdateProfile({
        displayName: shopName,
        bio: shopBio,
        defaultVisibility: shopVisibility,
      });
      setProfile(result.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      visibility: profile?.defaultVisibility ?? "public",
    });
    setPendingMediaPath(null);
    setShowForm(true);
  };

  const fileToBase64 = async (file: File): Promise<string> => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  };

  /** Phase 63 polish — camera/gallery → draft fields → form (same RPCs as EnvoyGo). */
  const captureFromPhoto = async (file: File) => {
    setCaptureBusy(true);
    setError(null);
    setNotice(null);
    try {
      const contentBase64 = await fileToBase64(file);
      const media = await nodeService.shopSaveListingMedia({
        filename: file.name || "photo.jpg",
        contentBase64,
        mimeType: file.type || "image/jpeg",
      });
      const draftResult = await nodeService.shopDraftListing({
        photoFileName: file.name || "photo.jpg",
      });
      if (!draftResult.ok) {
        throw new Error(draftResult.reason);
      }
      const d = draftResult.draft;
      setPendingMediaPath(media.mediaPath);
      setForm({
        ...EMPTY_FORM,
        title: d.title,
        description: d.description,
        category: d.category,
        tags: d.tags.join(", "),
        condition: d.condition,
        visibility: d.visibility,
        priceAmount: d.priceAmount,
        priceCurrency: d.priceCurrency,
        status: "active",
      });
      setShowForm(true);
      setPane("shop");
      setNotice(
        t(
          "market.captureDraftReady",
          "Draft filled from your photo — review price and details, then save.",
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCaptureBusy(false);
    }
  };

  const clearSearchHistory = async () => {
    setError(null);
    try {
      await nodeService.marketClearSearchHistory();
      await loadSuggestions();
      setNotice(t("market.historyCleared", "Search history cleared."));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openEdit = (listing: ShopListing) => {
    setForm({
      listingId: listing.listingId,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      tags: listing.tags.join(", "),
      condition: listing.condition,
      status: listing.status,
      visibility: listing.visibility,
      priceAmount: listing.price.amount,
      priceCurrency: listing.price.currency,
    });
    setShowForm(true);
  };

  const saveListing = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await nodeService.shopUpsertListing({
        listingId: form.listingId,
        title: form.title,
        description: form.description,
        category: form.category,
        tags: form.tags
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
        condition: form.condition,
        status: form.status,
        visibility: form.visibility,
        priceAmount: form.priceAmount,
        priceCurrency: form.priceCurrency,
        mediaPaths: pendingMediaPath ? [pendingMediaPath] : undefined,
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      setPendingMediaPath(null);
      setNotice(
        t(
          "market.publishedHint",
          "Saved. Your bonded contacts get an update when they are reachable.",
        ),
      );
      await refreshShop();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (listingId: string, status: ShopListingStatus) => {
    setError(null);
    try {
      await nodeService.shopSetListingStatus({ listingId, status });
      await refreshShop();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeListing = async (listingId: string) => {
    if (!window.confirm(t("market.confirmDelete", "Delete this listing?"))) return;
    setError(null);
    try {
      await nodeService.shopDeleteListing({ listingId });
      await refreshShop();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const messageSeller = async (card: MarketBrowseCard) => {
    setInquiringId(card.listingId);
    setError(null);
    setNotice(null);
    try {
      const text = t("market.inquireDefault", 'Hi — interested in "{title}". Is it still available?', {
        title: card.title,
      });
      await nodeService.sendChat(card.sellerOwnerId, text, undefined, card.listingId);
      const bonded = bonds.some(
        (b) =>
          b.peerOwnerId === card.sellerOwnerId &&
          (b.level === "direct" || b.level === "referred"),
      );
      if (!bonded) setAddBondOwnerId(card.sellerOwnerId);
      setNotice(t("market.inquireSent", "Message sent. Opening chat…"));
      openChatWithPeer(card.sellerOwnerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInquiringId(null);
    }
  };

  const blockSeller = async (card: MarketBrowseCard) => {
    if (
      !window.confirm(
        t(
          "market.confirmBlock",
          "Block this seller? Their listings will hide from your Browse.",
        ),
      )
    ) {
      return;
    }
    setError(null);
    try {
      await nodeService.blockPeer(card.sellerOwnerId);
      setBrowseCards((prev) => prev.filter((c) => c.sellerOwnerId !== card.sellerOwnerId));
      setNotice(t("market.blockedSeller", "Seller blocked."));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const reportSeller = async (card: MarketBrowseCard) => {
    if (
      !window.confirm(
        t(
          "market.confirmReport",
          "Report and block this seller? This stays on your node (no central review yet).",
        ),
      )
    ) {
      return;
    }
    setError(null);
    try {
      await nodeService.marketReportSeller({
        sellerOwnerId: card.sellerOwnerId,
        listingId: card.listingId,
      });
      setBrowseCards((prev) => prev.filter((c) => c.sellerOwnerId !== card.sellerOwnerId));
      setNotice(t("market.reportedSeller", "Reported and blocked."));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const addBondWithSeller = async (ownerId: string) => {
    setError(null);
    try {
      await sendHello(
        ownerId,
        {
          displayName: humanProfile?.displayName ?? "Envoy User",
          bio: humanProfile?.bio ?? "",
          interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
          whatShares: [],
        },
        t("market.addBondHello", "Hi — we chatted about a listing. Want to stay in contact?"),
      );
      setAddBondOwnerId(null);
      setNotice(t("market.addBondSent", "Contact request sent."));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const copyShareUri = async (uri: string) => {
    setNotice(null);
    try {
      await navigator.clipboard.writeText(uri);
      setNotice(t("market.shareCopied", "Share link copied."));
    } catch {
      setNotice(uri);
    }
  };

  const shareOwnListing = async (listingId: string) => {
    setError(null);
    try {
      const result = await nodeService.marketShareListing({ listingId });
      await copyShareUri(result.shareUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const shareListingToFeed = async (listing: ShopListing) => {
    setError(null);
    setNotice(null);
    try {
      const share = await nodeService.marketShareListing({ listingId: listing.listingId });
      const body = [
        `${listing.title} — ${formatPrice(listing)}`,
        listing.description?.trim() || "",
        share.shareUri,
        t(
          "market.paymentHint",
          "Agree payment with the seller outside EnvoyMesh — Envoy doesn’t hold money.",
        ),
      ]
        .filter(Boolean)
        .join("\n\n");
      await nodeService.publishWebContentEntry({
        template: "feed-post",
        title: listing.title.slice(0, 48) || t("market.untitled", "Untitled listing"),
        body,
        visibility: "bonded",
      });
      setNotice(
        t(
          "market.feedTeaserPosted",
          "Shared on Feed for bonded contacts. They can open the listing link.",
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="market-view" data-testid="market-view">
      <header className="market-view__header">
        <h2>{t("market.title", "Market")}</h2>
        <p className="market-view__lede">
          {t(
            "market.lede",
            "Browse listings from friends and the mesh, or manage your shop. Saving a listing updates your bonds; public listings answer stranger search.",
          )}
        </p>
      </header>

      <div className="market-view__panes" role="tablist" aria-label={t("market.panes", "Market")}>
        <button
          type="button"
          role="tab"
          aria-selected={pane === "browse"}
          className={`market-view__pane${pane === "browse" ? " market-view__pane--active" : ""}`}
          onClick={() => setPane("browse")}
          data-testid="market-pane-browse"
        >
          {t("market.paneBrowse", "Browse")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === "shop"}
          className={`market-view__pane${pane === "shop" ? " market-view__pane--active" : ""}`}
          onClick={() => setPane("shop")}
          data-testid="market-pane-shop"
        >
          {t("market.paneShop", "My Shop")}
        </button>
      </div>

      {error ? (
        <p className="market-view__error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="market-view__notice" role="status">
          {notice}
        </p>
      ) : null}

      {pane === "browse" ? (
        <div className="market-view__browse" data-testid="market-browse">
          <form
            className="market-view__search"
            onSubmit={(e) => {
              e.preventDefault();
              runBrowseSearch(browseQuery);
            }}
          >
            <label className="visually-hidden" htmlFor="market-browse-q">
              {t("market.searchAria", "Search the market")}
            </label>
            <input
              id="market-browse-q"
              type="search"
              value={browseQuery}
              onChange={(e) => setBrowseQuery(e.target.value)}
              placeholder={t("market.searchPlaceholder", "Search books, electronics, tags…")}
              autoComplete="off"
              data-testid="market-browse-search"
            />
            <button type="submit" className="btn-primary">
              {t("market.searchSubmit", "Search")}
            </button>
          </form>

          <div className="market-view__filters" data-testid="market-browse-filters">
            <label>
              <span className="visually-hidden">{t("market.filterCategory", "Category")}</span>
              <select
                value={browseCategory}
                onChange={(e) =>
                  setBrowseCategory((e.target.value || "") as ShopListingCategory | "")
                }
                data-testid="market-filter-category"
              >
                <option value="">{t("market.filterAnyCategory", "Any category")}</option>
                {SHOP_LISTING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={t("market.filterMinPrice", "Min price")}
              value={browseMinPrice}
              onChange={(e) => setBrowseMinPrice(e.target.value)}
              data-testid="market-filter-min-price"
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder={t("market.filterMaxPrice", "Max price")}
              value={browseMaxPrice}
              onChange={(e) => setBrowseMaxPrice(e.target.value)}
              data-testid="market-filter-max-price"
            />
            <input
              type="text"
              placeholder={t("market.filterCurrency", "Currency")}
              value={browseCurrency}
              onChange={(e) => setBrowseCurrency(e.target.value.toUpperCase())}
              maxLength={8}
              data-testid="market-filter-currency"
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runBrowseSearch(browseQuery)}
            >
              {t("market.applyFilters", "Apply filters")}
            </button>
          </div>

          {!paymentHintDismissed ? (
            <p className="market-view__notice" role="note" data-testid="market-payment-hint">
              {t(
                "market.paymentHint",
                "Agree payment with the seller outside EnvoyMesh — Envoy doesn’t hold money.",
              )}{" "}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPaymentHintDismissed(true)}
              >
                {t("common.dismiss", "Dismiss")}
              </button>
            </p>
          ) : null}

          <div className="market-view__chips" aria-label={t("market.chipsLabel", "Suggestions")}>
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="market-view__chip"
                onClick={() => runBrowseSearch(chip.query)}
              >
                {t(CHIP_LABEL_KEYS[chip.query.toLowerCase()] ?? "", chip.query)}
              </button>
            ))}
            {chips.some((c) => c.source === "history") ? (
              <button
                type="button"
                className="market-view__chip market-view__chip--danger"
                onClick={() => void clearSearchHistory()}
                data-testid="market-clear-history"
              >
                {t("market.clearHistory", "Clear history")}
              </button>
            ) : null}
          </div>

          {addBondOwnerId ? (
            <div className="market-view__notice" role="status">
              <span>{t("market.addBondPrompt", "Want to stay in contact with this seller?")}</span>{" "}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void addBondWithSeller(addBondOwnerId)}
                data-testid="market-add-bond"
              >
                {t("market.addBond", "Add as contact")}
              </button>
            </div>
          ) : null}

          <div className="market-view__browse-results">
            {browseLoading ? (
              <p className="market-view__muted">{t("market.loading", "Loading…")}</p>
            ) : null}

            {!browseLoading && browseCards.length > 0 ? (
              <>
                <p className="market-view__muted" data-testid="market-results-label">
                  {browseSuggested
                    ? t("market.suggestedForYou", "Suggested for you")
                    : browseSubmitted
                      ? t("market.resultsFor", 'Results for “{query}”', {
                          query: browseSubmitted,
                        })
                      : t("market.suggestedForYou", "Suggested for you")}
                </p>
              <ul className="market-view__list" data-testid="market-browse-results">
                {browseCards.map((card) => (
                  <li key={card.listingId} className="market-view__card">
                    <div className="market-view__card-main">
                      {card.thumbnailContentBase64 || card.thumbnailRef ? (
                        <MarketCardThumb
                          className="market-view__thumb"
                          thumbnailContentBase64={card.thumbnailContentBase64}
                          thumbnailMimeType={card.thumbnailMimeType}
                          thumbnailRef={card.thumbnailRef}
                          libraryRead={(params) => nodeService.libraryRead(params)}
                        />
                      ) : null}
                      <strong>{card.title}</strong>
                      <span className="market-view__price">{formatPrice(card)}</span>
                      <span className="market-view__meta">
                        {t("market.sellerLabel", "Seller")}:{" "}
                        {card.shopDisplayName?.trim() || shortOwner(card.sellerOwnerId)}
                        {card.category ? ` · ${card.category}` : ""}
                      </span>
                      {card.description ? (
                        <p className="market-view__desc">{card.description}</p>
                      ) : null}
                    </div>
                    <div className="market-view__card-actions">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={inquiringId === card.listingId}
                        onClick={() => void messageSeller(card)}
                        data-testid={`market-message-${card.listingId}`}
                      >
                        {t("market.messageSeller", "Message seller")}
                      </button>
                      {card.shareUri ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void copyShareUri(card.shareUri!)}
                        >
                          {t("market.shareLink", "Copy link")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void blockSeller(card)}
                        data-testid={`market-block-${card.listingId}`}
                      >
                        {t("market.blockSeller", "Block")}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void reportSeller(card)}
                        data-testid={`market-report-${card.listingId}`}
                      >
                        {t("market.reportSeller", "Report")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              </>
            ) : null}

            {!browseLoading && browseLoaded && browseCards.length === 0 ? (
              <div role="status">
                {browseSubmitted ? (
                  <>
                    <p className="market-view__muted">
                      {t("market.searchNoResults", 'No listings matched "{query}".', {
                        query: browseSubmitted,
                      })}
                    </p>
                    <p className="empty-state-desc">
                      {t(
                        "market.browseEmptyDesc",
                        "Listings from friends and strangers appear when peers answer your search, or after bonded friends publish. Try a keyword, or open My Shop.",
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="empty-state-title">
                      {t("market.browseEmptyTitle", "No peer listings yet")}
                    </p>
                    <p className="empty-state-desc">
                      {t(
                        "market.browseEmptyDesc",
                        "Listings from friends and strangers appear when peers answer your search, or after bonded friends publish. Try a keyword, or open My Shop.",
                      )}
                    </p>
                    <p className="market-view__muted">
                      {t("market.searchIdleHint", "Try a keyword, or tap a suggestion below.")}
                    </p>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="market-view__shop" data-testid="market-shop">
          <section className="market-view__profile">
            <h3>{t("market.shopProfile", "Shop profile")}</h3>
            <div className="form-group">
              <label htmlFor="market-shop-name">{t("market.shopName", "Shop name")}</label>
              <input
                id="market-shop-name"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="form-group">
              <label htmlFor="market-shop-bio">{t("market.shopBio", "About")}</label>
              <textarea
                id="market-shop-bio"
                value={shopBio}
                onChange={(e) => setShopBio(e.target.value)}
                rows={2}
                maxLength={2000}
              />
            </div>
            <div className="form-group">
              <label htmlFor="market-shop-visibility">
                {t("market.defaultVisibility", "Default listing visibility")}
              </label>
              <select
                id="market-shop-visibility"
                value={shopVisibility}
                onChange={(e) => setShopVisibility(e.target.value as ShopListingVisibility)}
              >
                <option value="public">
                  {t(
                    "market.visibilityPublic",
                    "Public — findable by people on the mesh (including strangers)",
                  )}
                </option>
                <option value="bonds">
                  {t("market.visibilityBonds", "Bonds only — contacts you already trust")}
                </option>
              </select>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => void saveProfile()}
              >
                {t("market.saveProfile", "Save shop")}
              </button>
            </div>
          </section>

          <section className="market-view__listings">
            <div className="market-view__listings-head">
              <h3>{t("market.listings", "Listings")}</h3>
              <div className="market-view__listings-actions">
                <label className="btn-secondary market-view__capture-label">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    disabled={captureBusy || saving}
                    data-testid="market-capture-photo"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void captureFromPhoto(file);
                    }}
                  />
                  {captureBusy
                    ? t("market.captureWorking", "Preparing draft…")
                    : t("market.captureFromPhoto", "Add from photo")}
                </label>
                <button type="button" className="btn-primary" onClick={openCreate}>
                  {t("market.addListing", "Add listing")}
                </button>
              </div>
            </div>

            {loading ? (
              <p className="market-view__muted">{t("market.loading", "Loading…")}</p>
            ) : null}

            {showForm ? (
              <div className="market-view__form" data-testid="market-listing-form">
                <h4>
                  {form.listingId
                    ? t("market.editListing", "Edit listing")
                    : t("market.newListing", "New listing")}
                </h4>
                <div className="form-group">
                  <label htmlFor="market-title">{t("market.fieldTitle", "Title")}</label>
                  <input
                    id="market-title"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    maxLength={200}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="market-desc">{t("market.fieldDescription", "Description")}</label>
                  <textarea
                    id="market-desc"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    maxLength={4000}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="market-price">{t("market.fieldPrice", "Price")}</label>
                    <input
                      id="market-price"
                      value={form.priceAmount}
                      onChange={(e) => setForm((f) => ({ ...f, priceAmount: e.target.value }))}
                      placeholder="68.00"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="market-currency">{t("market.fieldCurrency", "Currency")}</label>
                    <input
                      id="market-currency"
                      value={form.priceCurrency}
                      onChange={(e) => setForm((f) => ({ ...f, priceCurrency: e.target.value }))}
                      maxLength={8}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="market-category">{t("market.fieldCategory", "Category")}</label>
                    <select
                      id="market-category"
                      value={form.category}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          category: e.target.value as ShopListingCategory,
                        }))
                      }
                    >
                      {SHOP_LISTING_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {categoryLabel(c)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="market-condition">{t("market.fieldCondition", "Condition")}</label>
                    <select
                      id="market-condition"
                      value={form.condition}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          condition: e.target.value as ShopListingCondition,
                        }))
                      }
                    >
                      {SHOP_LISTING_CONDITIONS.map((c) => (
                        <option key={c} value={c}>
                          {conditionLabel(c)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="market-status">{t("market.fieldStatus", "Status")}</label>
                    <select
                      id="market-status"
                      value={form.status}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, status: e.target.value as ShopListingStatus }))
                      }
                    >
                      {SHOP_LISTING_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="market-visibility">
                      {t("market.fieldVisibility", "Who can see this")}
                    </label>
                    <select
                      id="market-visibility"
                      value={form.visibility}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          visibility: e.target.value as ShopListingVisibility,
                        }))
                      }
                    >
                      <option value="public">{t("market.visibilityPublicShort", "Public")}</option>
                      <option value="bonds">{t("market.visibilityBondsShort", "Bonds only")}</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="market-tags">{t("market.fieldTags", "Tags (comma-separated)")}</label>
                  <input
                    id="market-tags"
                    value={form.tags}
                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                    placeholder="textbook, calculus"
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowForm(false);
                      setForm(EMPTY_FORM);
                    }}
                  >
                    {t("common.cancel", "Cancel")}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={saving || !form.title.trim() || !form.priceAmount.trim()}
                    onClick={() => void saveListing()}
                  >
                    {t("market.saveListing", "Save listing")}
                  </button>
                </div>
              </div>
            ) : null}

            {!loading && listings.length === 0 && !showForm ? (
              <p className="market-view__muted">
                {t("market.noListings", "No listings yet. Add one to start your shop.")}
              </p>
            ) : null}

            <ul className="market-view__list">
              {listings.map((listing) => (
                <li key={listing.listingId} className="market-view__card">
                  <div className="market-view__card-main">
                    <strong>{listing.title}</strong>
                    <span className="market-view__price">{formatPrice(listing)}</span>
                    <span className="market-view__meta">
                      {statusLabel(listing.status)} ·{" "}
                      {listing.visibility === "public"
                        ? t("market.visibilityPublicShort", "Public")
                        : t("market.visibilityBondsShort", "Bonds only")}{" "}
                      · {categoryLabel(listing.category)}
                    </span>
                    {listing.description ? (
                      <p className="market-view__desc">{listing.description}</p>
                    ) : null}
                  </div>
                  <div className="market-view__card-actions">
                    <button type="button" className="btn-secondary" onClick={() => openEdit(listing)}>
                      {t("common.edit", "Edit")}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void shareOwnListing(listing.listingId)}
                    >
                      {t("market.shareLink", "Copy link")}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void shareListingToFeed(listing)}
                      data-testid={`market-feed-teaser-${listing.listingId}`}
                    >
                      {t("market.shareToFeed", "Share on Feed")}
                    </button>
                    {listing.status === "active" ? (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void setStatus(listing.listingId, "reserved")}
                        >
                          {t("market.markReserved", "Mark reserved")}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void setStatus(listing.listingId, "sold")}
                        >
                          {t("market.markSold", "Mark sold")}
                        </button>
                      </>
                    ) : null}
                    {listing.status === "reserved" ? (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void setStatus(listing.listingId, "active")}
                        >
                          {t("market.markAvailable", "Mark available")}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void setStatus(listing.listingId, "sold")}
                        >
                          {t("market.markSold", "Mark sold")}
                        </button>
                      </>
                    ) : null}
                    {listing.status === "sold" ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void setStatus(listing.listingId, "active")}
                      >
                        {t("market.relist", "Relist")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void removeListing(listing.listingId)}
                    >
                      {t("common.delete", "Delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
