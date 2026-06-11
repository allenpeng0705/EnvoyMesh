import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'cell.dart';
import 'terminal_parser.dart';

/// A minimal xterm-subset terminal emulator. Owns a 2D cell grid,
/// a main and alternate screen buffer, a scrollback, an
/// ANSI/CSI/OSC parser, and renders the visible window via
/// `CustomPaint`.
///
/// Use [write] to feed PTY output bytes, [resize] to inform the
/// emulator of a new grid size, [getSelection] to read the
/// current selection as plain text, and [clear] to reset the
/// visible grid.
class TerminalView extends StatefulWidget {
  /// Initial number of columns. The home PTY defaults to 80; the
  /// screen will resize this on first layout.
  final int initialCols;

  /// Initial number of rows. The home PTY defaults to 24; the
  /// screen will resize this on first layout.
  final int initialRows;

  /// Maximum number of lines kept in the scrollback. Older lines
  /// are dropped when the cap is exceeded. Default 10 000.
  final int scrollbackLimit;

  /// Font size for cell rendering. Default 14 — comfortably readable
  /// on a phone at 2x device pixel ratio.
  final double fontSize;

  /// Optional callback fired when the visible window's y-displacement
  /// changes (i.e. the user has scrolled into the scrollback). The
  /// screen can use this to show a "Jump to bottom" button.
  final void Function(int yDisplacement)? onScrollbackOffsetChanged;

  /// Optional callback fired when the selection changes (start,
  /// extend, or clear). The screen can use this to enable / disable
  /// a "Copy" button.
  final void Function(bool hasSelection)? onSelectionChanged;

  /// Optional callback fired when the window title changes (OSC 0
  /// / 1 / 2). The screen can use this to update the AppBar.
  final void Function(String title)? onTitleChanged;

  const TerminalView({
    super.key,
    this.initialCols = 80,
    this.initialRows = 24,
    this.scrollbackLimit = 10000,
    this.fontSize = 14,
    this.onScrollbackOffsetChanged,
    this.onSelectionChanged,
    this.onTitleChanged,
  });

  @override
  State<TerminalView> createState() => _TerminalViewState();
}

class _TerminalViewState extends State<TerminalView>
    implements TerminalTarget {
  // -- Grid model --

  /// Number of columns. Updated by [resize].
  late int _cols;

  /// Number of rows. Updated by [resize].
  late int _rows;

  /// The main screen buffer. A list of `_rows` lists, each containing
  /// `_cols` [Cell]s. Mutable — the parser mutates cells in place
  /// for performance.
  late List<List<Cell>> _mainGrid;

  /// The alternate screen buffer. Allocated lazily on first use;
  /// null until the TUI enters alternate mode.
  List<List<Cell>>? _altGrid;

  /// The currently-active grid (either main or alternate).
  List<List<Cell>> get _grid => _altGrid ?? _mainGrid;

  /// Cursor position (0-based). The parser uses 1-based; we convert
  /// at the boundary in [_targetPosition].
  int _cursorRow = 0;
  int _cursorCol = 0;

  /// Whether the cursor is currently visible. Toggled by DEC 25.
  bool _cursorVisible = true;

  /// Current SGR state. Defaults are "no styling" (use palette
  /// defaults).
  int _fg = CellPalette.defaultColor;
  int _bg = CellPalette.defaultColor;
  bool _bold = false;
  bool _underline = false;
  bool _reverse = false;

  /// Saved cursor + SGR (for save / restore). Single-level — the
  /// parser doesn't support nested saves, and neither do most
  /// real-world TUIs.
  int? _savedRow;
  int? _savedCol;
  int? _savedFg;
  int? _savedBg;
  bool? _savedBold;
  bool? _savedUnderline;
  bool? _savedReverse;

  /// Scroll region: top and bottom (0-based, inclusive). Defaults
  /// to the full grid. TUI apps use this to constrain scrolling to
  /// a sub-region (e.g. status lines at the bottom).
  int _scrollTop = 0;
  int _scrollBottom = 0; // computed from _rows - 1

  /// Whether auto-wrap is enabled. DEC 7 toggles this. Most modern
  /// TUIs expect it on (default true).
  bool _autoWrap = true;

  // -- Scrollback --

  /// Historical lines that have scrolled off the top of the main
  /// grid. Each entry is a list of [_cols] cells.
  final List<List<Cell>> _scrollback = [];

  /// Y-displacement: how many lines the visible window is shifted
  /// up into the scrollback. 0 = at the bottom (live view).
  int _yDisplacement = 0;

  // -- Alternate screen bookkeeping --

  /// When entering the alternate screen, we save the main grid
  /// here so we can restore it on exit. The scrollback and cursor
  /// state are also part of the saved snapshot.
  List<List<Cell>>? _savedMainGrid;
  int? _savedMainScrollTop;
  int? _savedMainScrollBottom;
  final List<List<Cell>> _savedScrollback = [];
  int? _savedYDisplacement;

  // -- Selection --

  /// Selection anchor (the cell where the long-press started), in
  /// grid coordinates. `null` when no selection is active.
  int? _selAnchorRow;
  int? _selAnchorCol;

  /// Selection active end (where the finger is currently). The
  /// visible selection is the normalized rectangle between
  /// anchor and active.
  int? _selActiveRow;
  int? _selActiveCol;

  // -- Parser --

  late TerminalParser _parser;

  @override
  void initState() {
    super.initState();
    _cols = widget.initialCols;
    _rows = widget.initialRows;
    _scrollBottom = _rows - 1;
    _mainGrid = _newGrid(_cols, _rows);
    _parser = TerminalParser(this);
  }

  /// Build a fresh grid of blank cells. The outer list is
  /// growable so the emulator can insert/remove rows when the
  /// TUI inserts/deletes lines or scrolls.
  List<List<Cell>> _newGrid(int cols, int rows) {
    return List.generate(
      rows,
      (_) => List<Cell>.filled(cols, Cell.empty),
    );
  }

  // -- Public API --

  /// Feed a chunk of PTY output bytes.
  void write(Uint8List bytes) {
    _parser.write(bytes);
    if (mounted) {
      // Coalesce frequent repaints — schedule a single setState
      // for the next frame. If we're already inside a frame, the
      // next call will coalesce.
      WidgetsBinding.instance.scheduleFrame();
    }
  }

  /// Inform the emulator of a new grid size. The cursor is clamped
  /// to fit; the main grid is extended or truncated as needed;
  /// the scrollback rows keep their content.
  void resize(int cols, int rows) {
    if (cols == _cols && rows == _rows) return;
    final newGrid = _newGrid(cols, rows);
    final keepRows = _grid.length < rows ? _grid.length : rows;
    final keepCols = _cols < cols ? _cols : cols;
    for (var r = 0; r < keepRows; r++) {
      for (var c = 0; c < keepCols; c++) {
        newGrid[r][c] = _grid[r][c];
      }
    }
    if (_altGrid != null) {
      _altGrid = newGrid;
    } else {
      _mainGrid = newGrid;
    }
    _cols = cols;
    _rows = rows;
    _scrollBottom = rows - 1;
    _scrollTop = _scrollTop.clamp(0, _scrollBottom);
    if (_cursorRow >= rows) _cursorRow = rows - 1;
    if (_cursorRow < 0) _cursorRow = 0;
    if (_cursorCol >= cols) _cursorCol = cols - 1;
    if (_cursorCol < 0) _cursorCol = 0;
    _selAnchorRow = null;
    _selAnchorCol = null;
    _selActiveRow = null;
    _selActiveCol = null;
    _yDisplacement = 0;
    _notifyScrollbackOffset();
    if (mounted) setState(() {});
  }

  /// Reset the main grid (visible + scrollback). Does NOT touch
  /// the alternate buffer (the TUI may still own it). Used when
  /// the home replays a new scrollback after a reconnect — we
  /// want to clear the stale visible state.
  void clear() {
    _mainGrid = _newGrid(_cols, _rows);
    _scrollback.clear();
    _cursorRow = 0;
    _cursorCol = 0;
    _resetSgr();
    _selAnchorRow = null;
    _selAnchorCol = null;
    _selActiveRow = null;
    _selActiveCol = null;
    _yDisplacement = 0;
    _notifyScrollbackOffset();
    if (mounted) setState(() {});
  }

  /// Return the currently selected text as plain text (cells joined
  /// by `\n`, with trailing whitespace preserved per line). Returns
  /// `null` when no selection is active.
  String? getSelection() {
    final aRow = _selAnchorRow;
    final aCol = _selAnchorCol;
    final eRow = _selActiveRow;
    final eCol = _selActiveCol;
    if (aRow == null || aCol == null || eRow == null || eCol == null) {
      return null;
    }
    final (top, left, bottom, right) = _normalizeSelection(
      aRow,
      aCol,
      eRow,
      eCol,
    );
    final buf = StringBuffer();
    for (var r = top; r <= bottom; r++) {
      final cols = _grid[r];
      final startCol = r == top ? left : 0;
      final endCol = r == bottom ? right : _cols - 1;
      for (var c = startCol; c <= endCol; c++) {
        final cell = cols[c];
        buf.write(cell.char.isEmpty ? ' ' : cell.char);
      }
      if (r < bottom) buf.write('\n');
    }
    return buf.toString();
  }

  /// True if there's an active selection. Used by the input bar
  /// to enable / disable the Copy button.
  bool get hasSelection =>
      _selAnchorRow != null &&
      _selActiveRow != null &&
      _selAnchorRow != _selActiveRow ||
      (_selAnchorRow == _selActiveRow &&
          _selAnchorCol != _selActiveCol &&
          _selAnchorCol != null &&
          _selActiveCol != null);

  /// Scroll up by [n] lines (into the scrollback). No-op if there
  /// is no scrollback. Used by touch gestures.
  void scrollUp(int n) {
    final max = _scrollback.length;
    if (max == 0) return;
    final newDisp = (_yDisplacement + n).clamp(0, max);
    if (newDisp != _yDisplacement) {
      _yDisplacement = newDisp;
      _notifyScrollbackOffset();
      if (mounted) setState(() {});
    }
  }

  /// Scroll down by [n] lines (toward the live view). No-op if
  /// already at the bottom.
  void scrollDown(int n) {
    if (_yDisplacement == 0) return;
    final newDisp = (_yDisplacement - n).clamp(0, _scrollback.length);
    if (newDisp != _yDisplacement) {
      _yDisplacement = newDisp;
      _notifyScrollbackOffset();
      if (mounted) setState(() {});
    }
  }

  /// Snap to the live view (y-displacement = 0).
  void jumpToBottom() {
    if (_yDisplacement == 0) return;
    _yDisplacement = 0;
    _notifyScrollbackOffset();
    if (mounted) setState(() {});
  }

  // -- Gesture handlers (called from the GestureDetector) --

  void onLongPressStart(Offset localPosition, Size widgetSize) {
    final cellW = widgetSize.width / _cols;
    final cellH = widgetSize.height / _rows;
    final col = (localPosition.dx / cellW).floor().clamp(0, _cols - 1);
    final row = (localPosition.dy / cellH).floor().clamp(0, _rows - 1);
    setState(() {
      _selAnchorRow = row;
      _selAnchorCol = col;
      _selActiveRow = row;
      _selActiveCol = col;
    });
    _notifySelectionChanged();
  }

  void onLongPressMoveUpdate(Offset localPosition, Size widgetSize) {
    if (_selAnchorRow == null) return;
    final cellW = widgetSize.width / _cols;
    final cellH = widgetSize.height / _rows;
    final col = (localPosition.dx / cellW).floor().clamp(0, _cols - 1);
    final row = (localPosition.dy / cellH).floor().clamp(0, _rows - 1);
    if (row == _selActiveRow && col == _selActiveCol) return;
    setState(() {
      _selActiveRow = row;
      _selActiveCol = col;
    });
    _notifySelectionChanged();
  }

  void onLongPressEnd() {
    // Keep the selection; user copies via the button.
  }

  void onTapUp(Offset localPosition, Size widgetSize) {
    // Single tap clears the selection (no drag).
    if (_selAnchorRow != null) {
      setState(() {
        _selAnchorRow = null;
        _selAnchorCol = null;
        _selActiveRow = null;
        _selActiveCol = null;
      });
      _notifySelectionChanged();
    }
  }

  // -- Internal helpers --

  void _notifyScrollbackOffset() {
    widget.onScrollbackOffsetChanged?.call(_yDisplacement);
  }

  void _notifySelectionChanged() {
    widget.onSelectionChanged?.call(hasSelection);
  }

  /// Convert a 1-based parser coordinate to a 0-based internal
  /// coordinate, clamping to the visible grid.
  int _toInternalRow(int parserRow) {
    final r = parserRow - 1;
    if (r < 0) return 0;
    if (r >= _rows) return _rows - 1;
    return r;
  }

  int _toInternalCol(int parserCol) {
    final c = parserCol - 1;
    if (c < 0) return 0;
    if (c >= _cols) return _cols - 1;
    return c;
  }

  // -- TerminalTarget implementation --

  @override
  void putChar(String ch) {
    // Determine display width. For v1 we treat all non-ASCII
    // characters as narrow. CJK / wide detection would use
    // character ranges; a future enhancement.
    final isWide = ch.runes.isNotEmpty &&
        (ch.runes.first >= 0x1100 &&
            (ch.runes.first <= 0x115F || // Hangul Jamo
                ch.runes.first == 0x2329 ||
                ch.runes.first == 0x232A ||
                (ch.runes.first >= 0x2E80 && ch.runes.first <= 0x303E) || // CJK Radicals etc.
                (ch.runes.first >= 0x3041 && ch.runes.first <= 0x33FF) || // Hiragana, Katakana, etc.
                (ch.runes.first >= 0x3400 && ch.runes.first <= 0x4DBF) || // CJK Ext A
                (ch.runes.first >= 0x4E00 && ch.runes.first <= 0x9FFF) || // CJK Unified
                (ch.runes.first >= 0xA000 && ch.runes.first <= 0xA4CF) || // Yi
                (ch.runes.first >= 0xAC00 && ch.runes.first <= 0xD7A3) || // Hangul
                (ch.runes.first >= 0xF900 && ch.runes.first <= 0xFAFF) || // CJK Compat
                (ch.runes.first >= 0xFE30 && ch.runes.first <= 0xFE4F) || // CJK Compat Forms
                (ch.runes.first >= 0xFF00 && ch.runes.first <= 0xFF60) || // Fullwidth
                (ch.runes.first >= 0xFFE0 && ch.runes.first <= 0xFFE6)));

    if (_cursorCol >= _cols) {
      // Wrap to next line.
      if (_autoWrap) {
        _cursorCol = 0;
        _cursorRow++;
        if (_cursorRow > _scrollBottom) {
          _scrollUpOne();
          _cursorRow = _scrollBottom;
        }
      } else {
        _cursorCol = _cols - 1;
      }
    }
    if (isWide && _cursorCol + 1 >= _cols) {
      // No room for the second column — fall back to placing it
      // as narrow and skip the continuation. (Real terminals
      // would still wrap; v1 accepts the visual loss.)
      _grid[_cursorRow][_cursorCol] = _makeCell(ch, false);
      _cursorCol++;
      return;
    }
    _grid[_cursorRow][_cursorCol] = _makeCell(ch, isWide);
    _cursorCol++;
    if (isWide) {
      // Place a continuation cell.
      if (_cursorCol < _cols) {
        _grid[_cursorRow][_cursorCol] = _makeCell('', false);
        _cursorCol++;
      }
    }
  }

  Cell _makeCell(String ch, bool wide) {
    return Cell(
      char: ch,
      fg: _fg,
      bg: _bg,
      bold: _bold,
      underline: _underline,
      reverse: _reverse,
      wide: wide,
    );
  }

  @override
  void cursorUp(int n) {
    if (n <= 0) return;
    _cursorRow = (_cursorRow - n).clamp(_scrollTop, _scrollBottom);
  }

  @override
  void cursorDown(int n) {
    if (n <= 0) return;
    final newRow = _cursorRow + n;
    if (newRow > _scrollBottom) {
      // Scroll up the difference within the scroll region.
      final diff = newRow - _scrollBottom;
      for (var i = 0; i < diff; i++) {
        _scrollUpOne();
      }
      _cursorRow = _scrollBottom;
    } else {
      _cursorRow = newRow;
    }
  }

  @override
  void cursorForward(int n) {
    if (n <= 0) return;
    _cursorCol = (_cursorCol + n).clamp(0, _cols - 1);
  }

  @override
  void cursorBack(int n) {
    if (n <= 0) return;
    _cursorCol = (_cursorCol - n).clamp(0, _cols - 1);
  }

  @override
  void cursorPosition(int row, int col) {
    // row: 1-based, col: 1-based. col == 0 means "preserve column"
    // (for CNL / CPL); we treat it as column 0.
    final newRow = _toInternalRow(row);
    final newCol = col == 0 ? _cursorCol : _toInternalCol(col);
    _cursorRow = newRow.clamp(_scrollTop, _scrollBottom);
    _cursorCol = newCol.clamp(0, _cols - 1);
  }

  @override
  void saveCursor() {
    _savedRow = _cursorRow;
    _savedCol = _cursorCol;
    _savedFg = _fg;
    _savedBg = _bg;
    _savedBold = _bold;
    _savedUnderline = _underline;
    _savedReverse = _reverse;
  }

  @override
  void restoreCursor() {
    if (_savedRow != null) _cursorRow = _savedRow!;
    if (_savedCol != null) _cursorCol = _savedCol!;
    if (_savedFg != null) _fg = _savedFg!;
    if (_savedBg != null) _bg = _savedBg!;
    if (_savedBold != null) _bold = _savedBold!;
    if (_savedUnderline != null) _underline = _savedUnderline!;
    if (_savedReverse != null) _reverse = _savedReverse!;
  }

  @override
  void eraseInDisplay(int mode) {
    final blank = _makeCell(' ', false);
    switch (mode) {
      case 0: // Below cursor (inclusive of cursor line)
        for (var c = _cursorCol; c < _cols; c++) {
          _grid[_cursorRow][c] = blank;
        }
        for (var r = _cursorRow + 1; r < _rows; r++) {
          for (var c = 0; c < _cols; c++) {
            _grid[r][c] = blank;
          }
        }
      case 1: // Above cursor
        for (var r = 0; r < _cursorRow; r++) {
          for (var c = 0; c < _cols; c++) {
            _grid[r][c] = blank;
          }
        }
        for (var c = 0; c <= _cursorCol; c++) {
          _grid[_cursorRow][c] = blank;
        }
      case 2: // Entire visible
        for (var r = 0; r < _rows; r++) {
          for (var c = 0; c < _cols; c++) {
            _grid[r][c] = blank;
          }
        }
      case 3: // Scrollback + visible
        _scrollback.clear();
        for (var r = 0; r < _rows; r++) {
          for (var c = 0; c < _cols; c++) {
            _grid[r][c] = blank;
          }
        }
    }
  }

  @override
  void eraseInLine(int mode) {
    final blank = _makeCell(' ', false);
    switch (mode) {
      case 0: // Right of cursor (inclusive)
        for (var c = _cursorCol; c < _cols; c++) {
          _grid[_cursorRow][c] = blank;
        }
      case 1: // Left of cursor (inclusive)
        for (var c = 0; c <= _cursorCol; c++) {
          _grid[_cursorRow][c] = blank;
        }
      case 2: // Entire line
        for (var c = 0; c < _cols; c++) {
          _grid[_cursorRow][c] = blank;
        }
    }
  }

  @override
  void insertLines(int n) {
    if (_cursorRow < _scrollTop || _cursorRow > _scrollBottom) return;
    for (var i = 0; i < n; i++) {
      // Shift rows from _cursorRow to _scrollBottom-1 down by 1.
      final removed = _grid.removeAt(_scrollBottom);
      _scrollback.add(removed);
      if (_scrollback.length > widget.scrollbackLimit) {
        _scrollback.removeAt(0);
      }
      _grid.insert(_cursorRow, _newRow(_cols));
    }
  }

  @override
  void deleteLines(int n) {
    if (_cursorRow < _scrollTop || _cursorRow > _scrollBottom) return;
    for (var i = 0; i < n; i++) {
      if (_cursorRow >= _grid.length) break;
      _grid.removeAt(_cursorRow);
      _grid.insert(_scrollBottom, _newRow(_cols));
    }
  }

  @override
  void insertCharacters(int n) {
    final row = _grid[_cursorRow];
    // Shift cells from _cursorCol to _cols-n-1 right by n. The
    // leftmost n cells in the row become blank.
    final blank = _makeCell(' ', false);
    for (var c = _cols - 1; c >= _cursorCol + n; c--) {
      row[c] = row[c - n];
    }
    for (var c = _cursorCol; c < _cursorCol + n && c < _cols; c++) {
      row[c] = blank;
    }
  }

  @override
  void deleteCharacters(int n) {
    final row = _grid[_cursorRow];
    for (var c = _cursorCol; c + n < _cols; c++) {
      row[c] = row[c + n];
    }
    final blank = _makeCell(' ', false);
    for (var c = _cols - n; c < _cols; c++) {
      if (c >= 0) row[c] = blank;
    }
  }

  @override
  void setScrollRegion(int top, int bottom) {
    if (bottom == 0) {
      // Reset to full screen.
      _scrollTop = 0;
      _scrollBottom = _rows - 1;
    } else {
      _scrollTop = _toInternalRow(top).clamp(0, _rows - 1);
      _scrollBottom = _toInternalRow(bottom).clamp(_scrollTop, _rows - 1);
    }
    // CUP semantics: cursor moves to home position when DECSTBM is set.
    _cursorRow = _scrollTop;
    _cursorCol = 0;
  }

  @override
  void setSgr(int param) {
    switch (param) {
      case 0:
        _resetSgr();
      case 1:
        _bold = true;
      case 4:
        _underline = true;
      case 7:
        _reverse = true;
      case 22:
        _bold = false;
      case 24:
        _underline = false;
      case 27:
        _reverse = false;
      case 30:
      case 31:
      case 32:
      case 33:
      case 34:
      case 35:
      case 36:
      case 37:
        _fg = CellPalette.resolveStandard(param - 30);
      case 38:
        // 38;5;n or 38;2;r;g;b — handled by the next 1–5 params.
        // We buffer the "38" and consume the rest in a follow-up
        // call. For v1 we keep a small queue.
        _pendingSgr256Fg = true;
      case 39:
        _fg = CellPalette.defaultColor;
      case 40:
      case 41:
      case 42:
      case 43:
      case 44:
      case 45:
      case 46:
      case 47:
        _bg = CellPalette.resolveStandard(param - 40);
      case 48:
        _pendingSgr256Bg = true;
      case 49:
        _bg = CellPalette.defaultColor;
      case 90:
      case 91:
      case 92:
      case 93:
      case 94:
      case 95:
      case 96:
      case 97:
        _fg = CellPalette.resolveStandard(param - 90 + 8);
      case 100:
      case 101:
      case 102:
      case 103:
      case 104:
      case 105:
      case 106:
      case 107:
        _bg = CellPalette.resolveStandard(param - 100 + 8);
      default:
        // 256-color and truecolor sequences are handled via
        // _pendingSgr256Fg / _pendingSgr256Bg.
        if (_pendingSgr256Fg || _pendingSgr256Bg) {
          _consumeExtendedColor(param);
        }
    }
  }

  bool _pendingSgr256Fg = false;
  bool _pendingSgr256Bg = false;
  int _extColorMode = 0; // 0 = waiting for 5 (256-color) or 2 (truecolor)
  int _extColorParamCount = 0;
  int _extColorR = 0;
  int _extColorG = 0;
  int _extColorB = 0;
  int _extColor256 = 0;

  void _consumeExtendedColor(int param) {
    if (!_pendingSgr256Fg && !_pendingSgr256Bg) return;
    if (_extColorMode == 0) {
      // Expecting 5 (256-color) or 2 (truecolor).
      if (param == 5) {
        _extColorMode = 5;
        _extColorParamCount = 0;
        return;
      } else if (param == 2) {
        _extColorMode = 2;
        _extColorParamCount = 0;
        return;
      } else {
        // Invalid — abort.
        _pendingSgr256Fg = false;
        _pendingSgr256Bg = false;
        return;
      }
    } else if (_extColorMode == 5) {
      // 256-color: 1 param (the palette index).
      _extColor256 = param;
      _finishExtendedColor();
      return;
    } else if (_extColorMode == 2) {
      // Truecolor: 3 params (R, G, B).
      _extColorParamCount++;
      if (_extColorParamCount == 1) {
        _extColorR = param;
      } else if (_extColorParamCount == 2) {
        _extColorG = param;
      } else if (_extColorParamCount == 3) {
        _extColorB = param;
        _finishExtendedColor();
      }
    }
  }

  void _finishExtendedColor() {
    final color = _extColorMode == 5
        ? CellPalette.resolve256(_extColor256)
        : (0xFF << 24) |
            ((_extColorR & 0xFF) << 16) |
            ((_extColorG & 0xFF) << 8) |
            (_extColorB & 0xFF);
    if (_pendingSgr256Fg) {
      _fg = color;
    } else if (_pendingSgr256Bg) {
      _bg = color;
    }
    _pendingSgr256Fg = false;
    _pendingSgr256Bg = false;
    _extColorMode = 0;
    _extColorParamCount = 0;
  }

  @override
  void resetSgr() {
    _resetSgr();
  }

  void _resetSgr() {
    _fg = CellPalette.defaultColor;
    _bg = CellPalette.defaultColor;
    _bold = false;
    _underline = false;
    _reverse = false;
    _pendingSgr256Fg = false;
    _pendingSgr256Bg = false;
    _extColorMode = 0;
  }

  @override
  void setWindowTitle(String title) {
    widget.onTitleChanged?.call(title);
  }

  @override
  void setDecMode(int mode, bool enabled) {
    switch (mode) {
      case 25:
        _cursorVisible = enabled;
      case 7:
        _autoWrap = enabled;
      case 1049:
        if (enabled) {
          // Save main grid, switch to alternate.
          _savedMainGrid = _mainGrid;
          _savedMainScrollTop = _scrollTop;
          _savedMainScrollBottom = _scrollBottom;
          _savedScrollback
            ..clear()
            ..addAll(_scrollback);
          _savedYDisplacement = _yDisplacement;
          _altGrid ??= _newGrid(_cols, _rows);
          for (var r = 0; r < _rows; r++) {
            for (var c = 0; c < _cols; c++) {
              _altGrid![r][c] = Cell.empty;
            }
          }
          _scrollTop = 0;
          _scrollBottom = _rows - 1;
          _cursorRow = 0;
          _cursorCol = 0;
          _resetSgr();
        } else {
          // Restore main grid.
          if (_savedMainGrid != null) {
            _mainGrid = _savedMainGrid!;
            _scrollTop = _savedMainScrollTop!;
            _scrollBottom = _savedMainScrollBottom!;
            _scrollback
              ..clear()
              ..addAll(_savedScrollback);
            _yDisplacement = _savedYDisplacement ?? 0;
            _savedMainGrid = null;
            _altGrid = null;
            _cursorRow = 0;
            _cursorCol = 0;
            _resetSgr();
            _notifyScrollbackOffset();
          }
        }
      case 1000:
      case 1002:
      case 1003:
      case 1006:
        // Mouse mode — set a flag, no synthesis in v1. We
        // deliberately don't track the flag because we don't act
        // on it. If we add mouse synthesis later, store the
        // mode here.
        return;
    }
  }

  @override
  void carriageReturn() {
    _cursorCol = 0;
  }

  @override
  void lineFeed() {
    if (_cursorRow == _scrollBottom) {
      _scrollUpOne();
    } else if (_cursorRow < _scrollBottom) {
      _cursorRow++;
    }
  }

  @override
  void backspace() {
    if (_cursorCol > 0) {
      _cursorCol--;
    }
  }

  @override
  void horizontalTab() {
    // Standard 8-column tab stops. Find the next stop after the
    // current column.
    final next = ((_cursorCol ~/ 8) + 1) * 8;
    _cursorCol = next.clamp(0, _cols - 1);
  }

  @override
  void bell() {
    // Drop. v1: no visual feedback. Future: vibrate or flash the
    // screen.
  }

  /// Scroll the visible grid up by one line, moving the top line
  /// into the scrollback. Constrained to the scroll region.
  void _scrollUpOne() {
    final topRow = _grid.removeAt(_scrollTop);
    _scrollback.add(topRow);
    if (_scrollback.length > widget.scrollbackLimit) {
      _scrollback.removeAt(0);
    }
    _grid.insert(_scrollBottom, _newRow(_cols));
  }

  List<Cell> _newRow(int cols) => List.filled(cols, Cell.empty);

  // -- Selection --

  (int, int, int, int) _normalizeSelection(int r1, int c1, int r2, int c2) {
    int top, left, bottom, right;
    if (r1 < r2) {
      top = r1;
      left = c1;
      bottom = r2;
      right = c2;
    } else if (r1 > r2) {
      top = r2;
      left = c2;
      bottom = r1;
      right = c1;
    } else {
      top = r1;
      bottom = r1;
      if (c1 <= c2) {
        left = c1;
        right = c2;
      } else {
        left = c2;
        right = c1;
      }
    }
    return (top, left, bottom, right);
  }

  /// Resolve a screen (row, col) into the cell that should be
  /// rendered there. Accounts for the scrollback displacement.
  Cell? _cellAt(int row, int col) {
    if (col < 0 || col >= _cols) return null;
    if (_yDisplacement == 0) {
      if (row < 0 || row >= _rows) return null;
      return _grid[row][col];
    }
    // yDisplacement > 0: the visible rows are indices
    // [-(yDisplacement) .. -1] of the scrollback, plus the live
    // grid rows [0 .. _rows - 1 - yDisplacement].
    final startHist = -_yDisplacement;
    if (row >= startHist && row < 0) {
      // In the scrollback.
      final histIdx = _scrollback.length + row;
      if (histIdx < 0 || histIdx >= _scrollback.length) return null;
      return _scrollback[histIdx][col];
    }
    final liveRow = row;
    if (liveRow < 0 || liveRow >= _rows) return null;
    return _grid[liveRow][col];
  }

  // -- Build --

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    // Measure cell size from the fontSize + a typical character.
    final cellSize = _measureCellSize();
    final width = _cols * cellSize.width;
    final height = _rows * cellSize.height;
    return GestureDetector(
      onLongPressStart: (d) => onLongPressStart(d.localPosition, Size(width, height)),
      onLongPressMoveUpdate: (d) =>
          onLongPressMoveUpdate(d.localPosition, Size(width, height)),
      onLongPressEnd: (_) => onLongPressEnd(),
      onTapUp: (d) => onTapUp(d.localPosition, Size(width, height)),
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: width,
        height: height,
        child: MediaQuery(
          data: mediaQuery.copyWith(textScaler: TextScaler.noScaling),
          child: CustomPaint(
            painter: _TerminalPainter(
              cols: _cols,
              rows: _rows,
              cellSize: cellSize,
              grid: _grid,
              scrollback: _scrollback,
              yDisplacement: _yDisplacement,
              selection:
                  _selAnchorRow != null && _selActiveRow != null
                      ? _normalizeSelection(
                          _selAnchorRow!,
                          _selAnchorCol!,
                          _selActiveRow!,
                          _selActiveCol!,
                        )
                      : null,
              cursorRow: _cursorRow,
              cursorCol: _cursorCol,
              cursorVisible: _cursorVisible,
              fontSize: widget.fontSize,
              cellAt: _cellAt,
            ),
            size: Size(width, height),
          ),
        ),
      ),
    );
  }

  _CellSize _measureCellSize() {
    // Use a TextPainter with a known character to measure
    // monospace cell size. Cached in widget.
    return _CellSize(
      width: widget.fontSize * 0.6,
      height: widget.fontSize * 1.2,
    );
  }
}

/// Holds the rendered cell size (width, height) in logical pixels.
class _CellSize {
  final double width;
  final double height;
  const _CellSize({required this.width, required this.height});
}

/// The `CustomPainter` that draws the visible terminal grid.
class _TerminalPainter extends CustomPainter {
  final int cols;
  final int rows;
  final _CellSize cellSize;
  final List<List<Cell>> grid;
  final List<List<Cell>> scrollback;
  final int yDisplacement;
  final (int, int, int, int)? selection;
  final int cursorRow;
  final int cursorCol;
  final bool cursorVisible;
  final double fontSize;
  final Cell? Function(int row, int col) cellAt;

  _TerminalPainter({
    required this.cols,
    required this.rows,
    required this.cellSize,
    required this.grid,
    required this.scrollback,
    required this.yDisplacement,
    required this.selection,
    required this.cursorRow,
    required this.cursorCol,
    required this.cursorVisible,
    required this.fontSize,
    required this.cellAt,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // Background.
    final bgPaint = Paint()..color = const Color(CellPalette.defaultBg);
    canvas.drawRect(Offset.zero & size, bgPaint);

    // Default text style. We use a monospace font and let Flutter
    // resolve it; the device may pick Menlo / Roboto Mono / etc.
    final baseStyle = TextStyle(
      fontFamily: 'monospace',
      fontFamilyFallback: const ['Menlo', 'Roboto Mono', 'Courier New'],
      fontSize: fontSize,
      height: 1.0,
      color: const Color(CellPalette.defaultFg),
    );

    // Paint each cell.
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        final cell = cellAt(r, c);
        if (cell == null || cell.char.isEmpty) continue;
        // Skip continuation cells of wide characters.
        if (c > 0) {
          final prev = cellAt(r, c - 1);
          if (prev != null && prev.wide) continue;
        }
        _paintCell(canvas, r, c, cell, baseStyle);
      }
    }

    // Paint the selection overlay.
    if (selection != null) {
      final (top, left, bottom, right) = selection!;
      final selPaint = Paint()..color = const Color(0x40808080);
      for (var r = top; r <= bottom; r++) {
        final c1 = r == top ? left : 0;
        final c2 = r == bottom ? right : cols - 1;
        final rect = Rect.fromLTWH(
          c1 * cellSize.width,
          r * cellSize.height,
          (c2 - c1 + 1) * cellSize.width,
          cellSize.height,
        );
        canvas.drawRect(rect, selPaint);
      }
    }

    // Paint the cursor.
    if (cursorVisible && yDisplacement == 0) {
      final cursorRect = Rect.fromLTWH(
        cursorCol * cellSize.width,
        cursorRow * cellSize.height,
        cellSize.width,
        cellSize.height,
      );
      final cursorPaint = Paint()..color = const Color(0xFFE0E0E0);
      canvas.drawRect(cursorRect, cursorPaint);
    }
  }

  void _paintCell(Canvas canvas, int row, int col, Cell cell, TextStyle base) {
    final fgColor = cell.fg == 0 || cell.fg == CellPalette.defaultColor
        ? const Color(CellPalette.defaultFg)
        : Color(cell.fg);
    final bgColor = cell.bg == 0 || cell.bg == CellPalette.defaultColor
        ? null
        : Color(cell.bg);
    final reversed = cell.reverse;
    final effectiveFg = reversed && bgColor != null ? bgColor : fgColor;
    final effectiveBg = reversed && bgColor != null ? fgColor : bgColor;

    if (effectiveBg != null) {
      final bgPaint = Paint()..color = effectiveBg;
      canvas.drawRect(
        Rect.fromLTWH(
          col * cellSize.width,
          row * cellSize.height,
          cellSize.width,
          cellSize.height,
        ),
        bgPaint,
      );
    }

    final span = TextSpan(
      text: cell.char,
      style: base.copyWith(
        color: effectiveFg,
        fontWeight: cell.bold ? FontWeight.bold : FontWeight.normal,
        decoration: cell.underline ? TextDecoration.underline : TextDecoration.none,
      ),
    );
    final tp = TextPainter(
      text: span,
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.left,
    );
    tp.layout(maxWidth: cellSize.width);
    tp.paint(
      canvas,
      Offset(col * cellSize.width, row * cellSize.height),
    );
  }

  @override
  bool shouldRepaint(covariant _TerminalPainter old) {
    return old.cols != cols ||
        old.rows != rows ||
        old.yDisplacement != yDisplacement ||
        old.cursorRow != cursorRow ||
        old.cursorCol != cursorCol ||
        old.cursorVisible != cursorVisible ||
        old.grid != grid ||
        old.scrollback != scrollback ||
        old.selection != selection;
  }
}
