import 'dart:convert';
import 'dart:typed_data';

/// Mutator interface that the parser calls into. Implemented by
/// [TerminalView] (in `terminal_view.dart`) to keep the parser
/// pure — no widget dependencies, fully unit-testable against a
/// mock target.
abstract class TerminalTarget {
  /// Print a single character at the current cursor position. The
  /// parser does NOT handle UTF-8 decoding — it calls this with
  /// complete Unicode code points (after [TerminalParser.write]
  /// has reassembled any multi-byte sequences that spanned frames).
  void putChar(String ch);

  /// Move cursor up by [n] rows. Stops at the top scroll margin.
  void cursorUp(int n);

  /// Move cursor down by [n] rows. Stops at the bottom scroll margin.
  void cursorDown(int n);

  /// Move cursor forward by [n] columns. Stops at the right margin.
  void cursorForward(int n);

  /// Move cursor back by [n] columns. Stops at the left margin.
  void cursorBack(int n);

  /// Move cursor to row [row] (1-based) and column [col] (1-based).
  void cursorPosition(int row, int col);

  /// Save the current cursor position + SGR attributes.
  void saveCursor();

  /// Restore the most recently saved cursor position + SGR.
  void restoreCursor();

  /// Erase in display. [mode]: 0 = below cursor (inclusive), 1 = above
  /// cursor (inclusive), 2 = entire visible screen, 3 = entire
  /// scrollback + visible.
  void eraseInDisplay(int mode);

  /// Erase in line. [mode]: 0 = right of cursor (inclusive), 1 = left
  /// of cursor (inclusive), 2 = entire line.
  void eraseInLine(int mode);

  /// Insert [n] blank lines at the cursor row, scrolling the rest
  /// down within the scroll region.
  void insertLines(int n);

  /// Delete [n] lines at the cursor row, scrolling the rest up
  /// within the scroll region.
  void deleteLines(int n);

  /// Insert [n] blank cells at the cursor column, shifting the
  /// rest of the row right.
  void insertCharacters(int n);

  /// Delete [n] cells at the cursor column, shifting the rest of
  /// the row left.
  void deleteCharacters(int n);

  /// Erase [n] cells starting at the cursor column, replacing them
  /// with blanks (preserving the current SGR attributes). Used by
  /// progress bars and partial-line overwrites.
  void eraseCharacters(int n);

  /// Repeat the last printed character [n] times. Used by progress
  /// bars that emit `CSI 5 b` to repeat the bar character.
  void repeatPrevChar(int n);

  /// Set scrolling region: rows [top]..[bottom] (1-based, inclusive).
  void setScrollRegion(int top, int bottom);

  /// Set a single SGR attribute. The parser calls this once per
  /// sub-parameter; the target accumulates the current style.
  void setSgr(int param);

  /// Set the current SGR to the defaults. Equivalent to SGR 0.
  void resetSgr();

  /// Set the window title. The TUI app uses OSC 0/1/2 for this.
  void setWindowTitle(String title);

  /// DEC private mode set. [mode] is the numeric mode (e.g. 25 for
  /// cursor visibility, 1049 for alt-screen). [enabled] is whether
  /// the mode is being turned on (`h`) or off (`l`).
  void setDecMode(int mode, bool enabled);

  /// Carriage return: move cursor to column 1 of the current row.
  void carriageReturn();

  /// Line feed: move cursor down one row; scroll if at bottom of
  /// the scroll region. Also conventionally returns the cursor to
  /// column 1 (LNM mode) — we implement the LNM=0 behavior (just
  /// down) which is what most modern TUIs use.
  void lineFeed();

  /// Backspace: move cursor left one column.
  void backspace();

  /// Horizontal tab: move cursor to the next tab stop. We
  /// approximate with "next multiple of 8" since most PTYs default
  /// to 8-space tabs.
  void horizontalTab();

  /// Bell: ignored (the TUI may want visual feedback, but for v1
  /// we just drop it).
  void bell();

  /// Report device status. The parser calls this when the host
  /// sends DSR (Device Status Report, CSI Ps n) or DA1/DA2
  /// (CSI c). [type] is the report type:
  /// - 0 = DA1 / DA2 response (terminal identifies itself)
  /// - 5 = operating status (we respond "ready")
  /// - 6 = DSR cursor position (respond with current position)
  /// The response bytes are sent back via the PTY stdin so the
  /// host TUI receives them as input on its end.
  void reportStatus(int type);
}

/// State-machine parser that consumes a raw byte stream from a PTY
/// and emits calls to a [TerminalTarget].
///
/// The parser is responsible for:
///
/// 1. **UTF-8 reassembly** across frame boundaries (a 4-byte
///    sequence may span two `write` calls).
/// 2. **ANSI state machine**: ground → escape → CSI entry / OSC
///    string / etc., per the classic xterm VT100 spec.
/// 3. **Dispatch**: turn parsed CSI / OSC / SGR sequences into
///    [TerminalTarget] calls.
///
/// The parser is **stateless** across `write` calls except for the
/// in-flight escape sequence and the UTF-8 pending buffer.
class TerminalParser {
  final TerminalTarget _target;

  /// The xterm state machine is small but precise. We model it as
  /// a single enum. Transitions are described in vt100.net / xterm
  /// docs but the gist is:
  ///
  /// - `ground`: normal text input. `\x1B` (ESC) transitions to
  ///   `escape`.
  /// - `escape`: just saw ESC. A `[` transitions to `csiEntry`,
  ///   a `]` transitions to `oscString`, a variety of other chars
  ///   handle the short ESC sequences (e.g. `c` / `D` for full
  ///   reset, `M` for reverse line feed, `7`/`8` for save/restore
  ///   cursor). Anything else returns to `ground` (with the char
  ///   being interpreted as a control code if relevant — e.g. ESC
  ///   followed by `(B` is the SCS sequence to switch to USASCII
  ///   which we silently ignore).
  _State _state = _State.ground;

  /// Accumulator for CSI parameters. We collect digits and `;` as
  /// strings, then parse them at the dispatch byte.
  final _params = <String>[];

  /// Current parameter string being built (e.g. "1" then "0" form
  /// "10"). Reset to "" at the start of each parameter group.
  String _currentParam = '';

  /// Private-mode flag. CSI ? h/l sets DEC private modes; the
  /// `?` is a prefix that we strip and remember.
  bool _privateMode = false;

  /// OSC accumulator (everything between ESC ] and the terminator
  /// BEL or ST). We collect it as a list of byte values and decode
  /// it as UTF-8 at the terminator.
  final _oscBuf = <int>[];

  /// DCS accumulator (everything between ESC P and the terminator
  /// ST or BEL). We collect raw bytes to handle tmux passthrough.
  final _dcsBuf = <int>[];

  /// UTF-8 pending buffer: when a multi-byte sequence spans a
  /// chunk boundary, we hold the leading bytes here until the
  /// next chunk completes the sequence.
  final _utf8Pending = <int>[];

  TerminalParser(this._target);

  /// Feed a chunk of bytes from the PTY. The parser will reassemble
  /// partial UTF-8 / partial escape sequences across calls.
  void write(Uint8List bytes) {
    for (final byte in bytes) {
      _step(byte);
    }
    // If the chunk ended mid-UTF-8, the incomplete bytes are in
    // _utf8Pending. They'll be flushed at the start of the next
    // `write` call. We do NOT flush them here — a partial UTF-8
    // sequence at chunk end is by definition incomplete.
  }

  /// Internal: process a single byte through the state machine.
  void _step(int byte) {
    // First, handle any pending UTF-8 sequence. If _utf8Pending is
    // non-empty, this byte is the continuation of a multi-byte
    // sequence. (For ASCII / control bytes in the 0x00..0x7F range
    // inside a UTF-8 sequence, the decoder is supposed to treat
    // them as invalid; we reset.)
    if (_utf8Pending.isNotEmpty) {
      if (byte >= 0x80 && byte < 0xC0) {
        _utf8Pending.add(byte);
        if (_isCompleteUtf8(_utf8Pending)) {
          _emitUtf8();
        }
        return;
      } else {
        // Invalid: drop the pending sequence and re-process the
        // byte from the start of the state machine. The decoder
        // will handle it as either a control char (0x00..0x1F) or
        // a fresh character.
        _utf8Pending.clear();
        // Fall through.
      }
    }

    // If we're not mid-UTF-8, decide between "start a new UTF-8
    // sequence" (byte >= 0x80) and "regular state machine" (byte
    // < 0x80).
    if (byte >= 0x80) {
      if (byte < 0xC0) {
        // Stray continuation byte. Drop.
        return;
      }
      _utf8Pending.add(byte);
      return;
    }

    // byte is in 0x00..0x7F. Handle control characters first, then
    // dispatch to the state machine.
    if (byte < 0x20 || byte == 0x7F) {
      _handleControl(byte);
      return;
    }

    // Printable ASCII (0x20..0x7E).
    switch (_state) {
      case _State.ground:
        _target.putChar(String.fromCharCode(byte));
        return;
      case _State.escape:
        _handleEscape(byte);
        return;
      case _State.csiEntry:
        _handleCsi(byte);
        return;
      case _State.oscString:
        _oscBuf.add(byte);
        return;
      case _State.oscEsc:
        // After ESC inside OSC, we expect \ (ST) to terminate. If
        // we get any other byte, abort the OSC.
        if (byte == 0x5C /* \ */) {
          _endOsc();
          _state = _State.ground;
        } else {
          _state = _State.ground;
          _oscBuf.clear();
        }
        return;
      case _State.dcsString:
        // 0x9C = C1 ST (8-bit ST, terminates DCS directly).
        // BEL (0x07) also terminates directly.
        // ESC (0x1B) transitions to dcsEsc to watch for \.
        if (byte == 0x9C || byte == 0x07) {
          _endDcs();
          _state = _State.ground;
        } else if (byte == 0x1B) {
          _state = _State.dcsEsc;
        } else {
          _dcsBuf.add(byte);
        }
        return;
      case _State.dcsEsc:
        // After ESC inside DCS, we expect \ (ST) to terminate. ESC itself is
        // literal data (tmux uses doubled ESC 0x1B 0x1B to encode a
        // single 0x1B byte in the payload).
        if (byte == 0x5C /* \ */) {
          _endDcs();
          _state = _State.ground;
        } else if (byte == 0x1B) {
          // Another ESC: this is the second byte of a doubled-ESC sequence.
          // Accumulate it (it represents a literal 0x1B) and stay in dcsEsc.
          _dcsBuf.add(byte);
        } else {
          // Any other byte after ESC: tmux doesn't use these, but guard
          // against malformed data. Add to buffer and return to dcsString.
          _dcsBuf.add(byte);
          _state = _State.dcsString;
        }
        return;
    }
  }

  /// Emit a complete UTF-8 sequence as a single character.
  void _emitUtf8() {
    try {
      final ch = utf8.decode(_utf8Pending);
      // utf8.decode may produce more than one code point if the
      // input has multiple sequences. We expect exactly one
      // complete sequence here (the pending buffer was filled by
      // a single multi-byte run), so [ch] is one grapheme. If
      // somehow it's longer, emit each code point separately.
      for (final r in ch.runes) {
        if (_state == _State.ground) {
          _target.putChar(String.fromCharCode(r));
        }
        // If we're not in ground, the bytes were inside an escape
        // sequence (shouldn't normally happen but be defensive).
        // Drop them.
      }
    } catch (_) {
      // Malformed UTF-8 — drop.
    }
    _utf8Pending.clear();
  }

  /// True if the pending buffer contains a complete UTF-8 sequence
  /// (i.e. the leading byte's expected length matches).
  bool _isCompleteUtf8(List<int> bytes) {
    if (bytes.isEmpty) return false;
    final lead = bytes[0];
    int expected;
    if (lead < 0xC0) {
      expected = 1; // shouldn't happen — we filter those
    } else if (lead < 0xE0) {
      expected = 2;
    } else if (lead < 0xF0) {
      expected = 3;
    } else if (lead < 0xF8) {
      expected = 4;
    } else {
      return true; // invalid lead, let the decoder fail and clear
    }
    return bytes.length >= expected;
  }

  /// Handle a C0 control character (0x00..0x1F) or DEL (0x7F).
  void _handleControl(int byte) {
    switch (_state) {
      case _State.ground:
        switch (byte) {
          case 0x00: // NUL — ignore
            return;
          case 0x07: // BEL — bell
            _target.bell();
            return;
          case 0x08: // BS — backspace
            _target.backspace();
            return;
          case 0x09: // HT — tab
            _target.horizontalTab();
            return;
          case 0x0A: // LF — line feed
            _target.lineFeed();
            return;
          case 0x0B: // VT — vertical tab; same effect as LF
            _target.lineFeed();
            return;
          case 0x0C: // FF — form feed; same effect as LF
            _target.lineFeed();
            return;
          case 0x0D: // CR — carriage return
            _target.carriageReturn();
            return;
          case 0x1B: // ESC — enter escape state
            _state = _State.escape;
            return;
          default:
            // Other C0 chars (SO/SI for character set switching,
            // etc.) — ignore for our minimal subset.
            return;
        }
      case _State.escape:
        switch (byte) {
          case 0x1B: // ESC ESC — treat the first as a no-op ST
            return;
          case 0x5B: // [ — CSI introducer
            _resetCsi();
            _state = _State.csiEntry;
            return;
          default:
            // Other non-printable bytes in escape state are an
            // error — return to ground.
            _state = _State.ground;
        }
      case _State.csiEntry:
        switch (byte) {
          case 0x1B: // ESC inside CSI — start a new sequence
            _resetCsi();
            _state = _State.escape;
            return;
          default:
            // Other control chars inside CSI are also an error.
            _resetCsi();
            _state = _State.ground;
        }
      case _State.oscString:
        switch (byte) {
          case 0x07: // BEL — terminator
            _endOsc();
            _state = _State.ground;
            return;
          case 0x1B: // ESC — expect \ as ST terminator
            _state = _State.oscEsc;
            return;
          default:
            // Other C0 control chars inside OSC — silently ignore.
            // Real TTYs can emit stray control bytes in OSC strings.
            return;
        }
      case _State.oscEsc:
        if (byte == 0x5C /* \ */) {
          _endOsc();
        } else {
          // Abort: OSC was malformed.
          _oscBuf.clear();
        }
        _state = _State.ground;
        return;
      case _State.dcsString:
        // C0 bytes inside a DCS are valid payload — accumulate.
        // Only ESC (0x1B) and BEL (0x07) are special.
        if (byte == 0x1B) {
          _state = _State.dcsEsc;
        } else if (byte == 0x07) {
          _endDcs();
          _state = _State.ground;
        } else {
          _dcsBuf.add(byte);
        }
        return;
      case _State.dcsEsc:
        // After ESC inside DCS, only \ (ST) terminates. ESC itself is
        // literal data (tmux uses doubled ESC 0x1B 0x1B to encode a
        // single 0x1B byte in the payload).
        if (byte == 0x5C /* \ */) {
          _endDcs();
          _state = _State.ground;
        } else if (byte == 0x1B) {
          // ESC inside dcsEsc → this is the first byte of another ESC
          // sequence. Stay in dcsEsc and wait for the next byte to
          // decide (it might be another ESC, or [ for CSI, etc.).
          _dcsBuf.add(byte);
        } else {
          // Any other byte: tmux doesn't use these, but guard against
          // malformed data. Add to buffer and return to dcsString.
          _dcsBuf.add(byte);
          _state = _State.dcsString;
        }
    }
  }

  /// Handle the byte after ESC.
  void _handleEscape(int byte) {
    switch (byte) {
      case 0x5B: // [ — start CSI
        _resetCsi();
        _state = _State.csiEntry;
        return;
      case 0x5D: // ] — start OSC
        _oscBuf.clear();
        _state = _State.oscString;
        return;
      case 0x37: // 7 — save cursor
        _target.saveCursor();
        _state = _State.ground;
        return;
      case 0x38: // 8 — restore cursor
        _target.restoreCursor();
        _state = _State.ground;
        return;
      case 0x44: // D — IND (index / reverse line feed)
        _target.cursorDown(1);
        _state = _State.ground;
        return;
      case 0x4D: // M — RI (reverse index)
        _target.cursorUp(1);
        _state = _State.ground;
        return;
      case 0x45: // E — NEL (next line)
        _target.carriageReturn();
        _target.lineFeed();
        _state = _State.ground;
        return;
      case 0x63: // c — RIS (full reset)
        // Best-effort: send a clear screen + home + reset SGR.
        // The target exposes eraseInDisplay(3) for "clear scrollback
        // + visible" and resetSgr for the style reset.
        _target.eraseInDisplay(3);
        _target.resetSgr();
        _target.cursorPosition(1, 1);
        _state = _State.ground;
        return;
      case 0x50: // P — start DCS (Device Control String)
        _dcsBuf.clear();
        _state = _State.dcsString;
        return;
      default:
        // Unknown ESC sequence — return to ground.
        _state = _State.ground;
        return;
    }
  }

  /// Handle a byte inside a CSI sequence (after ESC [).
  void _handleCsi(int byte) {
    if (byte >= 0x30 && byte <= 0x3F) {
      // Parameter bytes: digits, ;, >, ?, =
      if (byte == 0x3B /* ; */) {
        _params.add(_currentParam);
        _currentParam = '';
      } else if (byte == 0x3F /* ? */) {
        _privateMode = true;
      } else if (byte == 0x3A /* : */) {
        // Colon is a sub-param separator in modern CSI (e.g. SGR
        // 38:2:100:150:200 for truecolor). Treat it like ; —
        // flush the current param and start a fresh one.
        if (_currentParam.isNotEmpty) {
          _params.add(_currentParam);
        }
        _currentParam = '';
      } else if (byte >= 0x30 && byte <= 0x39) {
        _currentParam += String.fromCharCode(byte);
      }
      // 0x3C (<), 0x3D (=), 0x3E (>), 0x40-0x46 (intermediate
      // bytes) — ignore for our minimal subset.
    } else if (byte >= 0x40 && byte <= 0x7E) {
      // Final byte — dispatch.
      _params.add(_currentParam);
      _dispatchCsi(byte);
      _resetCsi();
      _state = _State.ground;
    } else if (byte == 0x1B) {
      // ESC inside CSI — abort and start a new sequence.
      _resetCsi();
      _state = _State.escape;
    } else {
      // Other bytes (intermediates) — ignore for our minimal subset.
    }
  }

  /// Parse the accumulated params and dispatch to the target.
  void _dispatchCsi(int finalByte) {
    // Convert params to int list, defaulting missing params to 0.
    final params = <int>[];
    for (final p in _params) {
      if (p.isEmpty) {
        params.add(0);
      } else {
        final n = int.tryParse(p);
        params.add(n ?? 0);
      }
    }
    // Drop a trailing 0 if the sequence had no params at all
    // (e.g. CSI H with no params means "home").
    if (params.isEmpty) params.add(0);

    if (_privateMode) {
      // DEC private mode set/reset.
      // We support the common ones; unknown modes are silently
      // ignored. The bool is true for `h` (set), false for `l`
      // (reset).
      final enabled = finalByte == 0x68 /* h */;
      for (final mode in params) {
        _target.setDecMode(mode, enabled);
      }
      return;
    }

    switch (finalByte) {
      case 0x41: // A — CUU
        _target.cursorUp(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x42: // B — CUD
        _target.cursorDown(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x43: // C — CUF
        _target.cursorForward(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x44: // D — CUB
        _target.cursorBack(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x45: // E — CNL
        _target.cursorPosition(_clampRow(params.isEmpty ? 1 : params[0]), 1);
        return;
      case 0x46: // F — CPL
        _target.cursorPosition(_clampRow(params.isEmpty ? 1 : params[0]), 1);
        return;
      case 0x47: // G — CHA
        _target.cursorPosition(0, params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x48: // H / 0x66 f — CUP
        final r = params.isEmpty || params[0] == 0 ? 1 : params[0];
        final c = params.length < 2 || params[1] == 0 ? 1 : params[1];
        _target.cursorPosition(r, c);
        return;
      case 0x4A: // J — ED
        _target.eraseInDisplay(params.isEmpty ? 0 : params[0]);
        return;
      case 0x4B: // K — EL
        _target.eraseInLine(params.isEmpty ? 0 : params[0]);
        return;
      case 0x4C: // L — IL
        _target.insertLines(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x4D: // M — DL
        _target.deleteLines(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x50: // P — DCH
        _target.deleteCharacters(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x40: // @ — ICH
        _target.insertCharacters(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x58: // X — ECH (erase character)
        _target.eraseCharacters(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x53: // S — SU
        _target.cursorDown(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x54: // T — SD
        _target.cursorUp(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x62: // b — REP (repeat previous character)
        _target.repeatPrevChar(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]));
        return;
      case 0x64: // d — VPA
        _target.cursorPosition(params.isEmpty ? 1 : (params[0] == 0 ? 1 : params[0]), 0);
        return;
      case 0x6D: // m — SGR
        if (params.isEmpty || (params.length == 1 && params[0] == 0)) {
          _target.resetSgr();
        } else {
          for (final p in params) {
            _target.setSgr(p);
          }
        }
        return;
      case 0x63: // c — DA1 / DA2 (Primary / Secondary Device Attributes)
        _target.reportStatus(0);
        return;
      case 0x6E: // n — DSR (Device Status Report)
        _target.reportStatus(params.isEmpty ? 6 : params[0]);
        return;
      case 0x72: // r — DECSTBM (set scroll region)
        final top = params.isEmpty || params[0] == 0 ? 1 : params[0];
        final bottom = params.length < 2 || params[1] == 0 ? 0 : params[1];
        _target.setScrollRegion(top, bottom);
        return;
      case 0x68: // h — SM (set mode)
      case 0x6C: // l — RM (reset mode)
        // Non-private mode set/reset. We don't have any of these
        // to support (DECANM, KAM, IRM, SRM, LNM). Ignore.
        return;
      default:
        // Unknown CSI — ignore. (Real-world TUIs use a few
        // private sequences we don't support, like DA1 / DA2
        // responses. We just drop them.)
        return;
    }
  }

  /// Clamp a 1-based row number to a sensible value. The target
  /// will do the final clamping against the actual grid size.
  int _clampRow(int r) => r < 1 ? 1 : r;

  /// Reset the CSI parameter accumulators.
  void _resetCsi() {
    _params.clear();
    _currentParam = '';
    _privateMode = false;
  }

  /// End the current OSC sequence and dispatch to the target.
  void _endOsc() {
    // OSC payloads are of the form "code ; text". We only
    // implement OSC 0 / 1 / 2 (set window title), which use code
    // 0/1/2. Other OSC codes (4 = palette, 52 = clipboard) are
    // ignored.
    if (_oscBuf.isEmpty) return;
    // Find the first ; to split the code from the text.
    int sepIdx = -1;
    for (var i = 0; i < _oscBuf.length; i++) {
      if (_oscBuf[i] == 0x3B) {
        sepIdx = i;
        break;
      }
    }
    if (sepIdx <= 0) {
      _oscBuf.clear();
      return;
    }
    final codeBytes = _oscBuf.sublist(0, sepIdx);
    final textBytes = _oscBuf.sublist(sepIdx + 1);
    int? code;
    try {
      code = int.parse(utf8.decode(codeBytes));
    } catch (_) {
      _oscBuf.clear();
      return;
    }
    if (code == 0 || code == 1 || code == 2) {
      try {
        _target.setWindowTitle(utf8.decode(textBytes));
      } catch (_) {
        // Ignore malformed UTF-8 in title.
      }
    }
    _oscBuf.clear();
  }

  /// End the current DCS sequence and dispatch. tmux uses DCS passthrough
  /// (ESC P ... ESC \) to tunnel inner escape sequences through the PTY
  /// to the terminal. The payload format is `tmux ; <escaped-data>`.
  /// We detect this and re-parse the inner data after un-escaping
  /// doubled 0x1B and 0x5C bytes.
  void _endDcs() {
    if (_dcsBuf.isEmpty) return;
    // Transition to ground BEFORE processing the payload. This is critical
    // when _endDcs is called from within _step (e.g., from the dcsEsc
    // case): if we don't reset, the recursive write() call below would
    // process the unescaped bytes starting in dcsEsc state, and the
    // first byte (often 0x1B from the doubled-ESC encoding) would be
    // buffered as DCS data instead of starting an escape sequence.
    _state = _State.ground;
    // Check for tmux passthrough signature: "tmux ; " (7 bytes)
    const tmuxSig = [0x74, 0x6D, 0x75, 0x78, 0x3B, 0x20]; // "tmux; "
    if (_dcsBuf.length > 6 &&
        _dcsBuf[0] == tmuxSig[0] &&
        _dcsBuf[1] == tmuxSig[1] &&
        _dcsBuf[2] == tmuxSig[2] &&
        _dcsBuf[3] == tmuxSig[3] &&
        _dcsBuf[4] == tmuxSig[4] &&
        _dcsBuf[5] == tmuxSig[5]) {
      // Extract the data after "tmux; " (bytes 6 onward).
      final data = _dcsBuf.sublist(6);
      // Un-escape: 0x1B 0x1B → 0x1B, 0x5C 0x5C → 0x5C.
      final unescaped = <int>[];
      for (var i = 0; i < data.length; i++) {
        if ((data[i] == 0x1B || data[i] == 0x5C) &&
            i + 1 < data.length &&
            data[i + 1] == data[i]) {
          unescaped.add(data[i]);
          i++; // skip the second copy
        } else {
          unescaped.add(data[i]);
        }
      }
      // Re-parse the unescaped inner sequences as fresh bytes.
      if (unescaped.isNotEmpty) {
        write(Uint8List.fromList(unescaped));
      }
    }
    _dcsBuf.clear();
  }
}

/// Parser state machine states.
enum _State {
  ground,
  escape,
  csiEntry,
  oscString,
  oscEsc,
  dcsString,
  dcsEsc,
}
