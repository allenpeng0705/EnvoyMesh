import 'package:flutter/material.dart';

import '../ext_agent/agent_attachments.dart';

/// Compact attach badge matching Social (`📎 3` / filename).
/// Details open in a floating popover above the badge — composer width stays free.
class AgentAttachmentBar extends StatefulWidget {
  final List<AgentDraftAttachment> attachments;
  final void Function(String id)? onRemove;
  final VoidCallback? onClearAll;
  final bool readOnly;

  const AgentAttachmentBar({
    super.key,
    required this.attachments,
    this.onRemove,
    this.onClearAll,
    this.readOnly = false,
  });

  @override
  State<AgentAttachmentBar> createState() => _AgentAttachmentBarState();
}

class _AgentAttachmentBarState extends State<AgentAttachmentBar> {
  final LayerLink _link = LayerLink();
  OverlayEntry? _entry;

  @override
  void dispose() {
    _removeOverlay();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant AgentAttachmentBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.attachments.isEmpty) {
      _removeOverlay();
      return;
    }
    if (_entry != null) {
      // Refresh open popover when list changes (remove / clear).
      _entry!.markNeedsBuild();
    }
  }

  void _removeOverlay() {
    _entry?.remove();
    _entry = null;
  }

  void _toggleOverlay() {
    if (_entry != null) {
      _removeOverlay();
      setState(() {});
      return;
    }
    final overlay = Overlay.of(context);
    _entry = OverlayEntry(
      builder: (ctx) => _AttachmentPopoverOverlay(
        link: _link,
        attachments: widget.attachments,
        readOnly: widget.readOnly,
        onDismiss: () {
          _removeOverlay();
          if (mounted) setState(() {});
        },
        onRemove: widget.onRemove == null
            ? null
            : (id) {
                final wasLast = widget.attachments.length <= 1;
                widget.onRemove!(id);
                if (wasLast) {
                  _removeOverlay();
                } else {
                  _entry?.markNeedsBuild();
                }
                if (mounted) setState(() {});
              },
        onClearAll: widget.onClearAll == null
            ? null
            : () {
                _removeOverlay();
                widget.onClearAll!();
                if (mounted) setState(() {});
              },
      ),
    );
    overlay.insert(_entry!);
    setState(() {});
  }

  String get _badgeLabel {
    final atts = widget.attachments;
    if (atts.isEmpty) return '';
    if (atts.length == 1) {
      return atts.first.name ?? attachmentBasename(atts.first.path);
    }
    return '${atts.length}';
  }

  @override
  Widget build(BuildContext context) {
    if (widget.attachments.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final open = _entry != null;

    return CompositedTransformTarget(
      link: _link,
      child: Material(
        color: scheme.surfaceContainerHighest,
        shape: StadiumBorder(
          side: BorderSide(color: scheme.outlineVariant),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: _toggleOverlay,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: 36,
              maxWidth: 88,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '📎',
                    style: TextStyle(
                      fontSize: 13,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      _badgeLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.1,
                        color: scheme.onSurface,
                        fontWeight: FontWeight.w600,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                  const SizedBox(width: 2),
                  Icon(
                    open ? Icons.expand_more : Icons.expand_less,
                    size: 16,
                    color: scheme.onSurfaceVariant,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AttachmentPopoverOverlay extends StatelessWidget {
  final LayerLink link;
  final List<AgentDraftAttachment> attachments;
  final bool readOnly;
  final VoidCallback onDismiss;
  final void Function(String id)? onRemove;
  final VoidCallback? onClearAll;

  const _AttachmentPopoverOverlay({
    required this.link,
    required this.attachments,
    required this.readOnly,
    required this.onDismiss,
    this.onRemove,
    this.onClearAll,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final count = attachments.length;

    return Stack(
      children: [
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onDismiss,
            child: const ColoredBox(color: Color(0x00000000)),
          ),
        ),
        CompositedTransformFollower(
          link: link,
          showWhenUnlinked: false,
          targetAnchor: Alignment.topLeft,
          followerAnchor: Alignment.bottomLeft,
          offset: const Offset(0, -6),
          child: Material(
            elevation: 8,
            color: scheme.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                minWidth: 220,
                maxWidth: 280,
                maxHeight: 220,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 4, 6),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            '$count file${count == 1 ? '' : 's'}',
                            style: Theme.of(context).textTheme.labelLarge,
                          ),
                        ),
                        if (!readOnly && onClearAll != null)
                          TextButton(
                            onPressed: onClearAll,
                            child: const Text('Clear all'),
                          ),
                      ],
                    ),
                  ),
                  const Divider(height: 1),
                  Flexible(
                    child: ListView.builder(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      shrinkWrap: true,
                      itemCount: attachments.length,
                      itemBuilder: (context, index) {
                        final att = attachments[index];
                        final name =
                            att.name ?? attachmentBasename(att.path);
                        return ListTile(
                          dense: true,
                          visualDensity: VisualDensity.compact,
                          leading: Icon(
                            (att.mimeType ?? '').startsWith('image/')
                                ? Icons.image_outlined
                                : Icons.attach_file,
                            size: 20,
                          ),
                          title: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            att.path,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11,
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                          trailing: (!readOnly && onRemove != null)
                              ? IconButton(
                                  icon: const Icon(Icons.close, size: 18),
                                  tooltip: 'Remove',
                                  onPressed: () => onRemove!(att.id),
                                )
                              : null,
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
