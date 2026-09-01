import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../knowledge/knowledge_nav.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/envoy_url.dart';
import '../../services/library_read_cache.dart';
import '../../widgets/connection_indicator.dart';
import '../chat/chat_detail_screen.dart';

/// Phase 63 — Envoy Market (Browse via MarketCache + My Shop on home).
class MarketScreen extends ConsumerStatefulWidget {
  const MarketScreen({
    super.key,
    this.embedded = false,
    this.initialPane = MarketPane.browse,
  });

  /// When true, omit Scaffold AppBar (used inside Social tabs).
  final bool embedded;

  /// Prefer My Shop when opened from Me shortcut.
  final MarketPane initialPane;

  @override
  ConsumerState<MarketScreen> createState() => _MarketScreenState();
}

enum MarketPane { browse, shop }

class _MarketScreenState extends ConsumerState<MarketScreen> {
  late MarketPane _pane;
  bool _loading = false;
  String? _error;
  Map<String, dynamic>? _profile;
  List<Map<String, dynamic>> _listings = const [];
  Map<String, dynamic>? _selected;

  @override
  void initState() {
    super.initState();
    _pane = widget.initialPane;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_pane == MarketPane.shop) {
        unawaited(_refreshShop());
        if (ref.read(marketPreferShopProvider)) {
          ref.read(marketPreferShopProvider.notifier).state = false;
        }
      }
    });
  }

  Future<void> _refreshShop() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _error = AppLocalizations.of(context).marketNotConnected;
        _profile = null;
        _listings = const [];
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profileResult = await client.shopGetProfile();
      final listResult = await client.shopListListings();
      if (!mounted) return;
      final profile = profileResult['profile'];
      final raw = listResult['listings'];
      setState(() {
        _profile = profile is Map
            ? Map<String, dynamic>.from(profile)
            : null;
        _listings = raw is List
            ? raw
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList()
            : const [];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void _selectPane(MarketPane pane) {
    setState(() {
      _pane = pane;
      _selected = null;
    });
    if (pane == MarketPane.shop) {
      unawaited(_refreshShop());
    }
  }

  String _mimeFor(XFile file) {
    final declared = file.mimeType?.trim().toLowerCase();
    if (declared != null && declared.startsWith('image/')) {
      if (declared == 'image/jpg') return 'image/jpeg';
      return declared;
    }
    final probe = '${file.path} ${file.name}'.toLowerCase();
    if (probe.contains('.png')) return 'image/png';
    if (probe.contains('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  /// Phase 63E — camera/gallery → draft on home → publish.
  Future<void> _addFromPhoto() async {
    final l10n = AppLocalizations.of(context);
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.marketNotConnected)),
      );
      return;
    }

    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) {
        final sheetL10n = AppLocalizations.of(ctx);
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_camera),
                title: Text(sheetL10n.marketCaptureCamera),
                onTap: () => Navigator.pop(ctx, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library),
                title: Text(sheetL10n.marketCaptureGallery),
                onTap: () => Navigator.pop(ctx, ImageSource.gallery),
              ),
            ],
          ),
        );
      },
    );
    if (source == null || !mounted) return;

    final file = await ImagePicker().pickImage(
      source: source,
      maxWidth: 1920,
      imageQuality: 85,
    );
    if (file == null || !mounted) return;

    final notesCtrl = TextEditingController();
    final notes = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final dialogL10n = AppLocalizations.of(ctx);
        return AlertDialog(
          title: Text(dialogL10n.marketCaptureNotesTitle),
          content: TextField(
            controller: notesCtrl,
            maxLines: 4,
            decoration: InputDecoration(
              hintText: dialogL10n.marketCaptureNotesHint,
            ),
            autofocus: true,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text(dialogL10n.commonCancel),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, notesCtrl.text),
              child: Text(dialogL10n.marketCaptureContinue),
            ),
          ],
        );
      },
    );
    notesCtrl.dispose();
    if (notes == null || !mounted) return;

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final bytes = await file.readAsBytes();
      final media = await client.shopSaveListingMedia(
        filename: file.name.isNotEmpty ? file.name : 'photo.jpg',
        contentBase64: base64Encode(bytes),
        mimeType: _mimeFor(file),
      );
      final mediaPath = '${media['mediaPath'] ?? ''}'.trim();
      final draftResult = await client.shopDraftListing(
        notes: notes.trim().isEmpty ? null : notes.trim(),
        photoFileName: file.name.isNotEmpty ? file.name : 'photo.jpg',
      );
      if (draftResult['ok'] != true) {
        throw Exception(
          draftResult['reason']?.toString() ?? l10n.commonError,
        );
      }
      final draftRaw = draftResult['draft'];
      final draft = draftRaw is Map
          ? Map<String, dynamic>.from(draftRaw)
          : <String, dynamic>{};
      if (!mounted) return;
      setState(() => _loading = false);
      final published = await _showDraftEditor(
        draft: draft,
        mediaPath: mediaPath.isEmpty ? null : mediaPath,
      );
      if (published == true) {
        await _refreshShop();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.marketCapturePublished)),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<bool?> _showDraftEditor({
    required Map<String, dynamic> draft,
    String? mediaPath,
  }) async {
    final l10n = AppLocalizations.of(context);
    final titleCtrl = TextEditingController(
      text: draft['title']?.toString() ?? '',
    );
    final descCtrl = TextEditingController(
      text: draft['description']?.toString() ?? '',
    );
    final priceCtrl = TextEditingController(
      text: draft['priceAmount']?.toString() ?? '0.00',
    );
    final currencyCtrl = TextEditingController(
      text: draft['priceCurrency']?.toString() ?? 'CNY',
    );
    var visibility = draft['visibility']?.toString() == 'bonds'
        ? 'bonds'
        : 'public';
    final category = draft['category']?.toString() ?? 'other';
    final condition = draft['condition']?.toString() ?? 'good';
    final tags = (draft['tags'] is List)
        ? (draft['tags'] as List).map((e) => e.toString()).toList()
        : <String>[];

    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            final dialogL10n = AppLocalizations.of(ctx);
            return AlertDialog(
              title: Text(dialogL10n.marketCaptureReviewTitle),
              content: SizedBox(
                width: 400,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextField(
                        controller: titleCtrl,
                        decoration: InputDecoration(
                          labelText: dialogL10n.marketCaptureTitleLabel,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: descCtrl,
                        maxLines: 4,
                        decoration: InputDecoration(
                          labelText: dialogL10n.marketCaptureDescriptionLabel,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: priceCtrl,
                              keyboardType: const TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              decoration: InputDecoration(
                                labelText: dialogL10n.marketCapturePriceLabel,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          SizedBox(
                            width: 88,
                            child: TextField(
                              controller: currencyCtrl,
                              decoration: InputDecoration(
                                labelText: dialogL10n.marketCaptureCurrencyLabel,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          dialogL10n.marketCaptureVisibilityLabel,
                          style: Theme.of(ctx).textTheme.labelMedium,
                        ),
                      ),
                      RadioListTile<String>(
                        dense: true,
                        title: Text(dialogL10n.marketVisibilityPublicShort),
                        value: 'public',
                        groupValue: visibility,
                        onChanged: (v) {
                          if (v == null) return;
                          setLocal(() => visibility = v);
                        },
                      ),
                      RadioListTile<String>(
                        dense: true,
                        title: Text(dialogL10n.marketVisibilityBondsShort),
                        value: 'bonds',
                        groupValue: visibility,
                        onChanged: (v) {
                          if (v == null) return;
                          setLocal(() => visibility = v);
                        },
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: Text(dialogL10n.commonCancel),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: Text(dialogL10n.marketCapturePublish),
                ),
              ],
            );
          },
        );
      },
    );

    final title = titleCtrl.text.trim();
    final description = descCtrl.text.trim();
    final priceAmount = priceCtrl.text.trim();
    final priceCurrency = currencyCtrl.text.trim();
    titleCtrl.dispose();
    descCtrl.dispose();
    priceCtrl.dispose();
    currencyCtrl.dispose();

    if (result != true) return false;
    if (!mounted) return false;
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.marketCaptureTitleRequired)),
      );
      return false;
    }

    final client = ref.read(nodeServiceProvider);
    if (client == null) return false;
    await client.shopUpsertListing(
      title: title,
      description: description,
      category: category,
      tags: tags,
      condition: condition,
      status: 'active',
      visibility: visibility,
      priceAmount: priceAmount.isEmpty ? '0.00' : priceAmount,
      priceCurrency: priceCurrency.isEmpty ? 'CNY' : priceCurrency,
      mediaPaths: mediaPath == null ? null : [mediaPath],
    );
    return true;
  }

  Future<void> _setListingStatus(String listingId, String status) async {
    final id = listingId.trim();
    if (id.isEmpty) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final l10n = AppLocalizations.of(context);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await client.shopSetListingStatus(
        listingId: id,
        status: status,
      );
      final listingRaw = result['listing'];
      if (!mounted) return;
      if (listingRaw is Map) {
        setState(() {
          _selected = Map<String, dynamic>.from(listingRaw);
          _loading = false;
        });
      } else {
        setState(() => _loading = false);
      }
      await _refreshShop();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.marketStatusUpdated)),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: SegmentedButton<MarketPane>(
            segments: [
              ButtonSegment(
                value: MarketPane.browse,
                label: Text(l10n.marketPaneBrowse),
              ),
              ButtonSegment(
                value: MarketPane.shop,
                label: Text(l10n.marketPaneShop),
              ),
            ],
            selected: {_pane},
            onSelectionChanged: (next) {
              if (next.isEmpty) return;
              _selectPane(next.first);
            },
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        Expanded(
          child: _pane == MarketPane.browse
              ? _BrowseSearch(l10n: l10n)
                  : _selected != null
                  ? _ListingDetail(
                      listing: _selected!,
                      l10n: l10n,
                      onBack: () => setState(() => _selected = null),
                      onSetStatus: (status) => unawaited(_setListingStatus(
                        '${_selected!['listingId'] ?? ''}',
                        status,
                      )),
                    )
                  : _ShopList(
                      l10n: l10n,
                      loading: _loading,
                      profile: _profile,
                      listings: _listings,
                      onRefresh: _refreshShop,
                      onOpen: (listing) => setState(() => _selected = listing),
                      onAddFromPhoto: () => unawaited(_addFromPhoto()),
                    ),
        ),
      ],
    );

    if (widget.embedded) return body;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.marketTitle),
        actions: const [
          ConnectionIndicator(),
          SizedBox(width: 8),
        ],
      ),
      body: body,
    );
  }
}

class _BrowseSearch extends ConsumerStatefulWidget {
  const _BrowseSearch({required this.l10n});

  final AppLocalizations l10n;

  @override
  ConsumerState<_BrowseSearch> createState() => _BrowseSearchState();
}

class _BrowseSearchState extends ConsumerState<_BrowseSearch> {
  final _controller = TextEditingController();
  final _minPriceController = TextEditingController();
  final _maxPriceController = TextEditingController();
  final _currencyController = TextEditingController();
  String? _submitted;
  bool _loading = false;
  String? _error;
  List<Map<String, dynamic>> _cards = const [];
  List<_BrowseChip> _chips = const [];
  String? _category;
  /// Session-scoped: payment honesty tip shown once until dismissed.
  static bool _paymentHintDismissed = false;
  bool _showPaymentHint = !_paymentHintDismissed;

  static const _fallbackChips = <_BrowseChip>[
    _BrowseChip(id: 'books', query: 'books'),
    _BrowseChip(id: 'electronics', query: 'electronics'),
    _BrowseChip(id: 'clothing', query: 'clothing'),
    _BrowseChip(id: 'home', query: 'home'),
    _BrowseChip(id: 'digital', query: 'digital'),
  ];

  static const _categories = <String>[
    'books',
    'electronics',
    'clothing',
    'home',
    'digital',
    'other',
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_bootstrap());
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _minPriceController.dispose();
    _maxPriceController.dispose();
    _currencyController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final defaultQuery = await _loadSuggestions();
    if (!mounted) return;
    final q = defaultQuery?.trim() ?? '';
    if (q.isNotEmpty) {
      _controller.text = q;
      _controller.selection = TextSelection.collapsed(offset: q.length);
    }
    await _runSearch(q, markSubmitted: false);
  }

  Future<String?> _loadSuggestions() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() => _chips = _fallbackChips);
      return 'books';
    }
    try {
      final result = await client.marketBrowseSuggestions();
      if (!mounted) return null;
      final raw = result['chips'];
      final chips = <_BrowseChip>[];
      if (raw is List) {
        for (final item in raw) {
          if (item is! Map) continue;
          final query = '${item['query'] ?? ''}'.trim();
          if (query.isEmpty) continue;
          final id = '${item['id'] ?? query}'.trim();
          final source = '${item['source'] ?? ''}'.trim();
          chips.add(_BrowseChip(
            id: id.isEmpty ? query : id,
            query: query,
            source: source.isEmpty ? null : source,
          ));
        }
      }
      setState(() => _chips = chips.isEmpty ? _fallbackChips : chips);
      final defaultQuery = '${result['defaultQuery'] ?? ''}'.trim();
      return defaultQuery.isEmpty ? null : defaultQuery;
    } catch (_) {
      if (!mounted) return null;
      setState(() => _chips = _fallbackChips);
      return 'books';
    }
  }

  Future<void> _runSearch(String raw, {bool markSubmitted = true}) async {
    final q = raw.trim();
    setState(() {
      _controller.text = q;
      _controller.selection = TextSelection.collapsed(offset: q.length);
      _submitted = markSubmitted ? (q.isEmpty ? null : q) : null;
      _loading = true;
      _error = null;
    });
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _loading = false;
        _error = widget.l10n.marketNotConnected;
        _cards = const [];
      });
      return;
    }
    final minPrice = _minPriceController.text.trim();
    final maxPrice = _maxPriceController.text.trim();
    final currency = _currencyController.text.trim();
    try {
      final result = await client.marketSearch(
        query: q.isEmpty ? null : q,
        category: _category,
        minPrice: minPrice.isEmpty ? null : minPrice,
        maxPrice: maxPrice.isEmpty ? null : maxPrice,
        currency: currency.isEmpty ? null : currency,
      );
      if (!mounted) return;
      final rawCards = result['cards'];
      setState(() {
        _cards = rawCards is List
            ? rawCards
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList()
            : const [];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _clearSearchHistory() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() => _error = widget.l10n.marketNotConnected);
      return;
    }
    try {
      await client.marketClearSearchHistory();
      if (!mounted) return;
      await _loadSuggestions();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(widget.l10n.marketHistoryCleared)),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  Future<void> _messageSeller(Map<String, dynamic> card) async {
    final client = ref.read(nodeServiceProvider);
    final l10n = widget.l10n;
    if (client == null) {
      setState(() => _error = l10n.marketNotConnected);
      return;
    }
    final sellerId = '${card['sellerOwnerId'] ?? ''}'.trim();
    final listingId = '${card['listingId'] ?? ''}'.trim();
    final title = '${card['title'] ?? l10n.marketUntitled}'.trim();
    if (sellerId.isEmpty || listingId.isEmpty) return;
    final text = l10n.marketInquireDefault(title);
    try {
      await client.sendChat(sellerId, text, listingId: listingId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.marketInquireSent)),
      );
      final display = '${card['shopDisplayName'] ?? ''}'.trim().isNotEmpty
          ? '${card['shopDisplayName']}'.trim()
          : sellerId;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatDetailScreen(
            threadId: sellerId,
            displayName: display,
            contactOwnerId: sellerId,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  Future<bool> _confirm(String message) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final dialogL10n = AppLocalizations.of(ctx);
        return AlertDialog(
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(dialogL10n.commonCancel),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(dialogL10n.commonConfirm),
            ),
          ],
        );
      },
    );
    return ok == true;
  }

  Future<void> _blockSeller(Map<String, dynamic> card) async {
    final l10n = widget.l10n;
    final sellerId = '${card['sellerOwnerId'] ?? ''}'.trim();
    if (sellerId.isEmpty) return;
    if (!await _confirm(l10n.marketConfirmBlock)) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() => _error = l10n.marketNotConnected);
      return;
    }
    try {
      await client.blockPeer(sellerId);
      if (!mounted) return;
      setState(() {
        _cards = _cards
            .where((c) => '${c['sellerOwnerId'] ?? ''}'.trim() != sellerId)
            .toList();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  Future<void> _reportSeller(Map<String, dynamic> card) async {
    final l10n = widget.l10n;
    final sellerId = '${card['sellerOwnerId'] ?? ''}'.trim();
    final listingId = '${card['listingId'] ?? ''}'.trim();
    if (sellerId.isEmpty) return;
    if (!await _confirm(l10n.marketConfirmReport)) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() => _error = l10n.marketNotConnected);
      return;
    }
    try {
      await client.marketReportSeller(
        sellerOwnerId: sellerId,
        listingId: listingId.isEmpty ? null : listingId,
      );
      if (!mounted) return;
      setState(() {
        _cards = _cards
            .where((c) => '${c['sellerOwnerId'] ?? ''}'.trim() != sellerId)
            .toList();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  String _chipLabel(AppLocalizations l10n, String query) {
    switch (query.toLowerCase()) {
      case 'books':
        return l10n.marketChipBooks;
      case 'electronics':
        return l10n.marketChipElectronics;
      case 'clothing':
        return l10n.marketChipClothing;
      case 'home':
        return l10n.marketChipHome;
      case 'digital':
        return l10n.marketChipDigital;
      default:
        return query;
    }
  }

  String _categoryLabel(AppLocalizations l10n, String category) {
    switch (category) {
      case 'books':
        return l10n.marketChipBooks;
      case 'electronics':
        return l10n.marketChipElectronics;
      case 'clothing':
        return l10n.marketChipClothing;
      case 'home':
        return l10n.marketChipHome;
      case 'digital':
        return l10n.marketChipDigital;
      default:
        return category;
    }
  }

  String _price(Map<String, dynamic> card) {
    final price = card['price'];
    if (price is Map) {
      return '${price['amount'] ?? ''} ${price['currency'] ?? ''}'.trim();
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = widget.l10n;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        if (_showPaymentHint) ...[
          Material(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.info_outline,
                    size: 20,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      l10n.marketPaymentHint,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  IconButton(
                    tooltip: l10n.commonClose,
                    onPressed: () {
                      _paymentHintDismissed = true;
                      setState(() => _showPaymentHint = false);
                    },
                    icon: const Icon(Icons.close, size: 18),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
        TextField(
          controller: _controller,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: l10n.marketSearchPlaceholder,
            prefixIcon: const Icon(Icons.search),
            suffixIcon: IconButton(
              tooltip: l10n.marketSearchSubmit,
              onPressed: () => unawaited(_runSearch(_controller.text)),
              icon: const Icon(Icons.arrow_forward),
            ),
            border: const OutlineInputBorder(),
          ),
          onSubmitted: (v) => unawaited(_runSearch(v)),
        ),
        const SizedBox(height: 12),
        InputDecorator(
          decoration: InputDecoration(
            labelText: l10n.marketFilterCategory,
            border: const OutlineInputBorder(),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String?>(
              isExpanded: true,
              value: _category,
              hint: Text(l10n.marketFilterAnyCategory),
              items: [
                DropdownMenuItem<String?>(
                  value: null,
                  child: Text(l10n.marketFilterAnyCategory),
                ),
                for (final c in _categories)
                  DropdownMenuItem<String?>(
                    value: c,
                    child: Text(_categoryLabel(l10n, c)),
                  ),
              ],
              onChanged: (v) => setState(() => _category = v),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _minPriceController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: l10n.marketFilterMinPrice,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _maxPriceController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: l10n.marketFilterMaxPrice,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 88,
              child: TextField(
                controller: _currencyController,
                decoration: InputDecoration(
                  labelText: l10n.marketFilterCurrency,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final chip in _chips)
              ActionChip(
                label: Text(_chipLabel(l10n, chip.query)),
                onPressed: () => unawaited(_runSearch(chip.query)),
              ),
            if (_chips.any((c) => c.source == 'history'))
              ActionChip(
                label: Text(l10n.marketClearHistory),
                onPressed: () => unawaited(_clearSearchHistory()),
              ),
          ],
        ),
        const SizedBox(height: 20),
        if (_error != null)
          Text(
            _error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (!_loading && _cards.isNotEmpty)
          for (final card in _cards) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _MarketCardThumb(
                      thumbnailContentBase64:
                          '${card['thumbnailContentBase64'] ?? ''}',
                      thumbnailMimeType: '${card['thumbnailMimeType'] ?? ''}',
                      thumbnailRef: '${card['thumbnailRef'] ?? ''}',
                    ),
                    Text(
                      '${card['title'] ?? l10n.marketUntitled}',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(_price(card)),
                    Text(
                      '${l10n.marketSellerLabel}: ${'${card['shopDisplayName'] ?? card['sellerOwnerId'] ?? ''}'}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton(
                          onPressed: () => unawaited(_messageSeller(card)),
                          child: Text(l10n.marketMessageSeller),
                        ),
                        OutlinedButton(
                          onPressed: () => unawaited(_blockSeller(card)),
                          child: Text(l10n.marketBlockSeller),
                        ),
                        OutlinedButton(
                          onPressed: () => unawaited(_reportSeller(card)),
                          child: Text(l10n.marketReportSeller),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        if (!_loading && _cards.isEmpty) ...[
          if (_submitted != null) ...[
            Text(
              l10n.marketSearchNoResults(_submitted!),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              l10n.marketBrowseEmptyDesc,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ] else ...[
            Text(
              l10n.marketBrowseEmptyTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              l10n.marketBrowseEmptyDesc,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              l10n.marketSearchIdleHint,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ],
        ],
      ],
    );
  }
}

class _BrowseChip {
  const _BrowseChip({required this.id, required this.query, this.source});

  final String id;
  final String query;
  final String? source;
}

/// Browse card thumb: inline base64, else resolve `envoy://` via libraryRead cache.
class _MarketCardThumb extends ConsumerStatefulWidget {
  const _MarketCardThumb({
    required this.thumbnailContentBase64,
    required this.thumbnailMimeType,
    required this.thumbnailRef,
  });

  final String thumbnailContentBase64;
  final String thumbnailMimeType;
  final String thumbnailRef;

  @override
  ConsumerState<_MarketCardThumb> createState() => _MarketCardThumbState();
}

class _MarketCardThumbState extends ConsumerState<_MarketCardThumb> {
  Uint8List? _bytes;
  String? _loadingRef;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadRef());
  }

  @override
  void didUpdateWidget(covariant _MarketCardThumb oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.thumbnailContentBase64 != widget.thumbnailContentBase64 ||
        oldWidget.thumbnailRef != widget.thumbnailRef) {
      _bytes = null;
      _loadingRef = null;
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadRef());
    }
  }

  Future<void> _loadRef() async {
    final b64 = widget.thumbnailContentBase64.trim();
    if (b64.isNotEmpty) return;
    final thumbRef = widget.thumbnailRef.trim();
    if (thumbRef.isEmpty || !isEnvoyContentUrl(thumbRef)) return;
    if (_loadingRef == thumbRef && _bytes != null) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    _loadingRef = thumbRef;
    try {
      final parsed = parseEnvoyContentUrl(thumbRef);
      final peek = await LibraryReadCache.instance
          .peekBytes(parsed.targetOwnerId, parsed.path);
      if (peek != null && mounted) {
        setState(() => _bytes = peek);
      }
      final result = await LibraryReadCache.instance.fetch(
        client.libraryRead,
        targetOwnerId: parsed.targetOwnerId,
        path: parsed.path,
      );
      if (!mounted) return;
      if (result.status == 'ok' &&
          (result.contentType?.startsWith('image/') ?? false)) {
        final bytes = result.bytes ??
            (result.body != null ? base64Decode(result.body!) : null);
        if (bytes != null) {
          setState(() => _bytes = bytes);
        }
      }
    } catch (_) {
      /* ignore — leave thumb empty */
    }
  }

  Widget _image(Uint8List bytes) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.memory(
          bytes,
          height: 140,
          width: double.infinity,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => const SizedBox.shrink(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final b64 = widget.thumbnailContentBase64.trim();
    final mime = widget.thumbnailMimeType.trim().toLowerCase();
    if (b64.isNotEmpty && mime.startsWith('image/')) {
      try {
        return _image(base64Decode(b64));
      } catch (_) {
        /* fall through to ref */
      }
    }
    final bytes = _bytes;
    if (bytes != null) return _image(bytes);
    return const SizedBox.shrink();
  }
}

class _ShopList extends StatelessWidget {
  const _ShopList({
    required this.l10n,
    required this.loading,
    required this.profile,
    required this.listings,
    required this.onRefresh,
    required this.onOpen,
    required this.onAddFromPhoto,
  });

  final AppLocalizations l10n;
  final bool loading;
  final Map<String, dynamic>? profile;
  final List<Map<String, dynamic>> listings;
  final Future<void> Function() onRefresh;
  final void Function(Map<String, dynamic> listing) onOpen;
  final VoidCallback onAddFromPhoto;

  @override
  Widget build(BuildContext context) {
    final shopName = (profile?['displayName'] as String?)?.trim();
    final bio = (profile?['bio'] as String?)?.trim();
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          if (shopName != null && shopName.isNotEmpty) ...[
            Text(shopName, style: Theme.of(context).textTheme.titleMedium),
            if (bio != null && bio.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                bio,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
            ],
            const SizedBox(height: 12),
          ],
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.icon(
              onPressed: onAddFromPhoto,
              icon: const Icon(Icons.add_a_photo_outlined),
              label: Text(l10n.marketCaptureAddFromPhoto),
            ),
          ),
          const SizedBox(height: 12),
          if (loading)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (listings.isEmpty)
            Text(
              l10n.marketNoListings,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            )
          else
            ...listings.map((listing) {
              final title = (listing['title'] as String?)?.trim() ?? l10n.marketUntitled;
              final price = listing['price'];
              String priceLabel = '';
              if (price is Map) {
                final amount = price['amount']?.toString() ?? '';
                final currency = price['currency']?.toString() ?? '';
                priceLabel = '$amount $currency'.trim();
              }
              final status = listing['status']?.toString() ?? '';
              final visibility = listing['visibility']?.toString() ?? '';
              return Card(
                child: ListTile(
                  title: Text(title),
                  subtitle: Text(
                    [
                      if (priceLabel.isNotEmpty) priceLabel,
                      if (status.isNotEmpty) _statusLabel(l10n, status),
                      if (visibility == 'bonds')
                        l10n.marketVisibilityBondsShort
                      else if (visibility == 'public')
                        l10n.marketVisibilityPublicShort,
                    ].where((s) => s.isNotEmpty).join(' · '),
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => onOpen(listing),
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _ListingDetail extends StatelessWidget {
  const _ListingDetail({
    required this.listing,
    required this.l10n,
    required this.onBack,
    required this.onSetStatus,
  });

  final Map<String, dynamic> listing;
  final AppLocalizations l10n;
  final VoidCallback onBack;
  final void Function(String status) onSetStatus;

  @override
  Widget build(BuildContext context) {
    final title = (listing['title'] as String?)?.trim() ?? l10n.marketUntitled;
    final description = (listing['description'] as String?)?.trim() ?? '';
    final category = listing['category']?.toString() ?? '';
    final condition = listing['condition']?.toString() ?? '';
    final status = listing['status']?.toString() ?? '';
    final visibility = listing['visibility']?.toString() ?? '';
    final price = listing['price'];
    String priceLabel = '';
    if (price is Map) {
      final amount = price['amount']?.toString() ?? '';
      final currency = price['currency']?.toString() ?? '';
      priceLabel = '$amount $currency'.trim();
    }
    final tags = listing['tags'];
    final tagLabel = tags is List
        ? tags.map((e) => e.toString()).where((e) => e.isNotEmpty).join(', ')
        : '';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back),
            label: Text(l10n.commonBack),
          ),
        ),
        Text(title, style: Theme.of(context).textTheme.headlineSmall),
        if (priceLabel.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(priceLabel, style: Theme.of(context).textTheme.titleMedium),
        ],
        const SizedBox(height: 8),
        Text(
          [
            if (status.isNotEmpty) _statusLabel(l10n, status),
            if (visibility == 'bonds')
              l10n.marketVisibilityBondsShort
            else if (visibility == 'public')
              l10n.marketVisibilityPublicShort,
            if (category.isNotEmpty) category,
            if (condition.isNotEmpty) condition,
          ].where((s) => s.isNotEmpty).join(' · '),
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        if (description.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(description),
        ],
        if (tagLabel.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('${l10n.marketTagsLabel}: $tagLabel'),
        ],
        const SizedBox(height: 16),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (status == 'active') ...[
              OutlinedButton(
                onPressed: () => onSetStatus('reserved'),
                child: Text(l10n.marketMarkReserved),
              ),
              FilledButton(
                onPressed: () => onSetStatus('sold'),
                child: Text(l10n.marketMarkSold),
              ),
            ],
            if (status == 'reserved') ...[
              OutlinedButton(
                onPressed: () => onSetStatus('active'),
                child: Text(l10n.marketMarkAvailable),
              ),
              FilledButton(
                onPressed: () => onSetStatus('sold'),
                child: Text(l10n.marketMarkSold),
              ),
            ],
            if (status == 'sold')
              OutlinedButton(
                onPressed: () => onSetStatus('active'),
                child: Text(l10n.marketRelist),
              ),
          ],
        ),
        const SizedBox(height: 24),
        Text(
          l10n.marketEditOnSocialHint,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}

String _statusLabel(AppLocalizations l10n, String status) {
  switch (status) {
    case 'active':
      return l10n.marketStatusActive;
    case 'reserved':
      return l10n.marketStatusReserved;
    case 'sold':
      return l10n.marketStatusSold;
    case 'withdrawn':
      return l10n.marketStatusWithdrawn;
    default:
      return status;
  }
}
