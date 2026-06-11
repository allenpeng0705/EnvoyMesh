/// A single cell in the terminal grid.
///
/// Each cell stores the character (or grapheme cluster) it displays
/// plus its styling. The default cell is a space with no styling —
/// we expose [empty] as a const so the grid can be initialized
/// without per-cell allocations.
class Cell {
  /// The grapheme cluster to display. For now we store a single
  /// `String` (length 0 or 1 for narrow cells, length 1+ for wide
  /// CJK). Future: switch to a grapheme-cluster representation if
  /// we need to support combining marks.
  final String char;

  /// Foreground color. Stored as an ARGB int so we can pass it
  /// directly to `TextSpan` / `TextPainter`. 0 means "use default
  /// foreground" — see [CellPalette].
  final int fg;

  /// Background color. Same encoding as [fg]. 0 means default.
  final int bg;

  /// Bold.
  final bool bold;

  /// Underline.
  final bool underline;

  /// Reverse video (swap fg/bg at paint time).
  final bool reverse;

  /// Display width in columns. 0 means "narrow" (1 column); 1 means
  /// "wide" (2 columns, used for CJK). This is a single bit at
  /// the cell level — for a 2-column wide character, the cell at
  /// the start position has `wide = true` and the cell to its
  /// right is the "continuation" cell with [char] = '' and
  /// `wide = false` and is rendered as a space.
  final bool wide;

  const Cell({
    this.char = ' ',
    this.fg = 0,
    this.bg = 0,
    this.bold = false,
    this.underline = false,
    this.reverse = false,
    this.wide = false,
  });

  /// The "blank" cell used to initialize the grid. Same as the
  /// default constructor but named for readability.
  static const empty = Cell();

  /// Returns a copy of this cell with the given fields replaced.
  Cell copyWith({
    String? char,
    int? fg,
    int? bg,
    bool? bold,
    bool? underline,
    bool? reverse,
    bool? wide,
  }) {
    return Cell(
      char: char ?? this.char,
      fg: fg ?? this.fg,
      bg: bg ?? this.bg,
      bold: bold ?? this.bold,
      underline: underline ?? this.underline,
      reverse: reverse ?? this.reverse,
      wide: wide ?? this.wide,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Cell &&
        other.char == char &&
        other.fg == fg &&
        other.bg == bg &&
        other.bold == bold &&
        other.underline == underline &&
        other.reverse == reverse &&
        other.wide == wide;
  }

  @override
  int get hashCode => Object.hash(
        char,
        fg,
        bg,
        bold,
        underline,
        reverse,
        wide,
      );

  @override
  String toString() =>
      'Cell(char: $char, fg: $fg, bg: $bg, bold: $bold, ul: $underline, rev: $reverse, wide: $wide)';
}

/// Named color indices for the 8 standard ANSI colors and their
/// bright counterparts. The actual ARGB values are resolved at
/// paint time via [resolve] so we can theme them.
class CellPalette {
  /// Index for "default fg" / "default bg". Sentinel value
  /// meaning "use the terminal's default", not a real color.
  static const int defaultColor = -1;

  /// 8 standard colors, indices 0–7 (black, red, green, yellow,
  /// blue, magenta, cyan, white). Matches the SGR 30–37 range.
  static const List<int> standard = [
    0xFF000000, // 0 black
    0xFFE53935, // 1 red
    0xFF43A047, // 2 green
    0xFFFDD835, // 3 yellow
    0xFF1E88E5, // 4 blue
    0xFFD81B60, // 5 magenta
    0xFF00ACC1, // 6 cyan
    0xFFE0E0E0, // 7 white
  ];

  /// 8 bright counterparts, indices 8–15. Matches SGR 90–97.
  static const List<int> bright = [
    0xFF616161, // 8  bright black (dark gray)
    0xFFEF5350, // 9  bright red
    0xFF66BB6A, // 10 bright green
    0xFFFFEE58, // 11 bright yellow
    0xFF42A5F5, // 12 bright blue
    0xFFEC407A, // 13 bright magenta
    0xFF26C6DA, // 14 bright cyan
    0xFFFFFFFF, // 15 bright white
  ];

  /// Default terminal foreground (light gray on dark background,
  /// or whatever the theme wants).
  static const int defaultFg = 0xFFE0E0E0;

  /// Default terminal background.
  static const int defaultBg = 0xFF000000;

  /// Resolve an SGR color parameter to an ARGB int. `param` is
  /// either a small int (0..15 for standard + bright) or a 24-bit
  /// RGB value computed by the parser. The sentinel [defaultColor]
  /// is returned as 0 and the caller treats it as "use default".
  static int resolveStandard(int param) {
    if (param < 0) return 0; // treat as default
    if (param < 8) return standard[param];
    if (param < 16) return bright[param - 8];
    return 0;
  }

  /// Compute the 256-color palette index for SGR 38;5;n or 48;5;n.
  /// Returns an ARGB int. The 256-color palette is the standard
  /// xterm one: indices 0..15 are the standard + bright, 16..231
  /// are a 6×6×6 RGB cube, 232..255 are a grayscale ramp.
  static int resolve256(int param) {
    if (param < 0 || param > 255) return 0;
    if (param < 16) return resolveStandard(param);
    if (param < 232) {
      final i = param - 16;
      final r = (i ~/ 36) % 6;
      final g = (i ~/ 6) % 6;
      final b = i % 6;
      // xterm 256-color cube uses 0/95/135/175/215/255.
      int level(int v) {
        if (v == 0) return 0;
        return 55 + v * 40;
      }

      return (0xFF << 24) | (level(r) << 16) | (level(g) << 8) | level(b);
    }
    // Grayscale ramp 232..255 — 24 steps from 8 to 238.
    final v = 8 + (param - 232) * 10;
    return (0xFF << 24) | (v << 16) | (v << 8) | v;
  }
}
