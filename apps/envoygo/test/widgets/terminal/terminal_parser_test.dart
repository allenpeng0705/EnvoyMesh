import 'dart:typed_data';

import 'package:envoygo/widgets/terminal/terminal_parser.dart';
import 'package:flutter_test/flutter_test.dart';

/// Mock [TerminalTarget] that records every call. Used to assert
/// what the parser dispatches for a given input byte stream.
class _Recorder implements TerminalTarget {
  final List<String> calls = [];

  @override
  void putChar(String ch) => calls.add('putChar($ch)');

  @override
  void cursorUp(int n) => calls.add('cursorUp($n)');

  @override
  void cursorDown(int n) => calls.add('cursorDown($n)');

  @override
  void cursorForward(int n) => calls.add('cursorForward($n)');

  @override
  void cursorBack(int n) => calls.add('cursorBack($n)');

  @override
  void cursorPosition(int row, int col) =>
      calls.add('cursorPosition($row, $col)');

  @override
  void saveCursor() => calls.add('saveCursor');

  @override
  void restoreCursor() => calls.add('restoreCursor');

  @override
  void eraseInDisplay(int mode) => calls.add('eraseInDisplay($mode)');

  @override
  void eraseInLine(int mode) => calls.add('eraseInLine($mode)');

  @override
  void insertLines(int n) => calls.add('insertLines($n)');

  @override
  void deleteLines(int n) => calls.add('deleteLines($n)');

  @override
  void insertCharacters(int n) => calls.add('insertCharacters($n)');

  @override
  void deleteCharacters(int n) => calls.add('deleteCharacters($n)');

  @override
  void eraseCharacters(int n) => calls.add('eraseCharacters($n)');

  @override
  void repeatPrevChar(int n) => calls.add('repeatPrevChar($n)');

  @override
  void setScrollRegion(int top, int bottom) =>
      calls.add('setScrollRegion($top, $bottom)');

  @override
  void setSgr(int param) => calls.add('setSgr($param)');

  @override
  void resetSgr() => calls.add('resetSgr');

  @override
  void setWindowTitle(String title) => calls.add('setWindowTitle($title)');

  @override
  void setDecMode(int mode, bool enabled) =>
      calls.add('setDecMode($mode, $enabled)');

  @override
  void carriageReturn() => calls.add('carriageReturn');

  @override
  void lineFeed() => calls.add('lineFeed');

  @override
  void backspace() => calls.add('backspace');

  @override
  void horizontalTab() => calls.add('horizontalTab');

  @override
  void bell() => calls.add('bell');

  @override
  void reportStatus(int type) => calls.add('reportStatus($type)');
}

Uint8List _bytes(List<int> ints) => Uint8List.fromList(ints);

/// String → byte sequence helper.
Uint8List _str(String s) => Uint8List.fromList(s.codeUnits);

void main() {
  group('TerminalParser', () {
    test('passes plain ASCII through as putChar', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('hello'));
      expect(r.calls, ['putChar(h)', 'putChar(e)', 'putChar(l)', 'putChar(l)', 'putChar(o)']);
    });

    test('handles CR / LF / BS / TAB control characters', () {
      final r = _Recorder();
      TerminalParser(r).write(_bytes([0x08, 0x09, 0x0A, 0x0D]));
      expect(r.calls, ['backspace', 'horizontalTab', 'lineFeed', 'carriageReturn']);
    });

    test('ignores NUL and BEL (except for bell callback)', () {
      final r = _Recorder();
      TerminalParser(r).write(_bytes([0x00, 0x07]));
      expect(r.calls, ['bell']);
    });

    test('a printable character in ground state triggers only putChar '
        '(no fallthrough into _handleEscape)', () {
      // REGRESSION: previously the parser's `_write` switch on
      // `_State.ground` was missing a `break;` (or `return;`),
      // causing fall-through into the `_State.escape` case. That
      // meant every printable character also ran `_handleEscape`
      // on the same byte, which dispatched the entire cascade of
      // ESC handlers (saveCursor, restoreCursor, cursorDown,
      // cursorUp, CR+LF, clearScrollback+Visible, resetSgr,
      // cursorPosition(1,1), state=ground). The user saw every
      // printable character followed by the screen being cleared
      // and the cursor jumping to (1, 1) — a catastrophic
      // failure for any TUI.
      final r = _Recorder();
      TerminalParser(r).write(_bytes([0x41])); // 'A'
      expect(r.calls, ['putChar(A)'],
          reason: 'A single printable byte should produce exactly '
              'one putChar call and nothing else. The previous '
              'missing-`return` bug caused the parser to fall '
              'through into _handleEscape and dispatch every '
              'other ESC case as a side effect.');
    });

    test('ESC [ (CSI) dispatches only CSI, no saveCursor/clearScreen '
        'side effects', () {
      // REGRESSION: previously the parser's `_handleEscape`
      // switch was missing `return;` after every case, causing
      // fall-through. `ESC [` would dispatch not just the CSI
      // handler but ALSO saveCursor, restoreCursor, IND, RI,
      // NEL, RIS (with eraseInDisplay(3) and resetSgr and
      // cursorPosition(1,1)) — all because of the fall-through.
      // The user saw every CSI clear the entire screen.
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[5A')); // CSI 5 A
      expect(r.calls, ['cursorUp(5)'],
          reason: 'CSI A should produce exactly one cursorUp call. '
              'The previous missing-`return` bug also dispatched '
              'every other ESC case as a side effect.');
    });

    test('ESC c (RIS) clears screen + resets SGR + homes cursor, '
        'and nothing else', () {
      // RIS is supposed to do: eraseInDisplay(3) (clear
      // scrollback + visible), resetSgr, cursorPosition(1, 1).
      // Nothing else. The previous missing-`return` bug
      // dispatched all of the above PLUS saveCursor, restoreCursor,
      // cursorDown, cursorUp, CR, LF as side effects.
      final r = _Recorder();
      TerminalParser(r).write(_bytes([0x1B, 0x63])); // ESC c
      expect(r.calls,
          ['eraseInDisplay(3)', 'resetSgr', 'cursorPosition(1, 1)'],
          reason: 'RIS should produce exactly the three calls above '
              'and nothing else. Each call is recorded in order.');
    });

    test('CSI J (erase display) does ONLY an erase — no side effects',
        () {
      // REGRESSION: previously, _dispatchCsi was missing
      // `return;` after every case. CSI 2J would dispatch
      // eraseInDisplay(2) AND then fall through into cases B,
      // C, D, E, F, G, H (all calling cursorPosition with
      // default values), K (eraseLine), L (insertLines), M
      // (deleteLines), P (deleteCharacters), @ (insertCharacters),
      // S/T (cursorDown/cursorUp), and finally r (setScrollRegion).
      // This is why the TUI's content appeared only in a small
      // area at the top — every CSI sequence moved the cursor
      // to (1, 1) via the fall-through H case.
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[2J')); // CSI 2J
      expect(r.calls, ['eraseInDisplay(2)'],
          reason: 'CSI 2J should produce exactly one call. The '
              'fall-through bug made it dispatch every other CSI '
              'handler in the same switch.');
    });

    test('CSI H (cursor position) does ONLY a cursor move — no side '
        'effects', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[10;20H'));
      expect(r.calls, ['cursorPosition(10, 20)'],
          reason: 'CSI H should only move the cursor. The previous '
              'fall-through bug made it also call eraseInDisplay, '
              'eraseInLine, insertLines, deleteLines, etc.');
    });

    test('CSI r (DECSTBM, set scroll region) does ONLY a scroll region '
        'set — no side effects', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[5;25r'));
      expect(r.calls, ['setScrollRegion(5, 25)'],
          reason: 'CSI r should only set the scroll region. The '
              'previous fall-through bug made it also dispatch every '
              'other CSI handler.');
    });

    test('CSI ?1049h (enter alt screen) does ONLY that — no side effects',
        () {
      // Alt-screen entry is the most common cause of TUI
      // content appearing in the wrong place. The previous
      // fall-through bug made DEC private mode h/l also call
      // setDecMode for every other private mode number, and
      // the setDecMode loop in _dispatchCsi iterates over
      // `params`. Wait — the private mode block has a
      // `return;` so the fall-through is contained to the
      // `for (final mode in params)` loop, which is correct.
      // So this test verifies the private-mode path is clean.
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[?1049h'));
      expect(r.calls, ['setDecMode(1049, true)'],
          reason: 'CSI ?1049h should only call setDecMode(1049, '
              'true). The private-mode path is gated by a '
              '`return;` so it is clean.');
    });

    test('CSI A moves cursor up', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[5A'));
      expect(r.calls, ['cursorUp(5)']);
    });

    test('CSI A with default param moves up 1', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[A'));
      expect(r.calls, ['cursorUp(1)']);
    });

    test('CSI B / C / D — cursorDown / Forward / Back', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[2B\x1B[3C\x1B[4D'));
      expect(r.calls, [
        'cursorDown(2)',
        'cursorForward(3)',
        'cursorBack(4)',
      ]);
    });

    test('CSI H positions cursor (1-based)', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[10;20H'));
      expect(r.calls, ['cursorPosition(10, 20)']);
    });

    test('CSI H with no params = home', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[H'));
      expect(r.calls, ['cursorPosition(1, 1)']);
    });

    test('CSI J erases display', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[2J'));
      expect(r.calls, ['eraseInDisplay(2)']);
    });

    test('CSI K erases line', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[K'));
      expect(r.calls, ['eraseInLine(0)']);
    });

    test('CSI L inserts lines, M deletes lines', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[3L\x1B[2M'));
      expect(r.calls, ['insertLines(3)', 'deleteLines(2)']);
    });

    test('CSI @ inserts characters, P deletes characters', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[@\x1B[5P'));
      expect(r.calls, ['insertCharacters(1)', 'deleteCharacters(5)']);
    });

    test('CSI X (ECH) erases n cells without shifting the row', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[7X'));
      expect(r.calls, ['eraseCharacters(7)']);
    });

    test('CSI X with default param erases 1 cell', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[X'));
      expect(r.calls, ['eraseCharacters(1)']);
    });

    test('CSI b (REP) repeats the last character n times', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[5b'));
      expect(r.calls, ['repeatPrevChar(5)']);
    });

    test('CSI b with default param repeats 1 time', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[b'));
      expect(r.calls, ['repeatPrevChar(1)']);
    });

    test('CSI r sets scroll region', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[5;15r'));
      expect(r.calls, ['setScrollRegion(5, 15)']);
    });

    test('CSI 6 n (DSR cursor position report) calls reportStatus', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[6n'));
      expect(r.calls, ['reportStatus(6)']);
    });

    test('CSI n with no params (= empty) calls reportStatus(0) — DA1', () {
      // CSI n (no params) = DA1 (Primary Device Attributes).
      // Type 0 means "ready, no faults". The cursor position
      // report (type 6) requires an explicit CSI 6 n.
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[n'));
      expect(r.calls, ['reportStatus(0)']);
    });

    test('CSI c (DA1) calls reportStatus(0)', () {
      // CSI c (primary DA1) = report VT100 identity.
      // The host replies with ESC [ ? 1 ; 0 c (VT100 with STP).
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[c'));
      expect(r.calls, ['reportStatus(0)']);
    });

    test('CSI m resets SGR with no params', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[m'));
      expect(r.calls, ['resetSgr']);
    });

    test('CSI m with explicit 0 also resets SGR', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[0m'));
      expect(r.calls, ['resetSgr']);
    });

    test('CSI m dispatches per-parameter SGR', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[1;31m'));
      expect(r.calls, ['setSgr(1)', 'setSgr(31)']);
    });

    test('DEC private mode ?25h / ?25l', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[?25h\x1B[?25l'));
      expect(r.calls, [
        'setDecMode(25, true)',
        'setDecMode(25, false)',
      ]);
    });

    test('DEC private mode ?1049h enters alt-screen, ?1049l exits', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[?1049h\x1B[?1049l'));
      expect(r.calls, [
        'setDecMode(1049, true)',
        'setDecMode(1049, false)',
      ]);
    });

    test('ESC 7 / ESC 8 save and restore cursor', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B7\x1B8'));
      expect(r.calls, ['saveCursor', 'restoreCursor']);
    });

    test('OSC 0 sets window title (terminated by BEL)', () {
      final r = _Recorder();
      // OSC 0 ; title BEL
      TerminalParser(r).write(_bytes([
        0x1B, 0x5D, 0x30, 0x3B, 0x68, 0x65, 0x6C, 0x6C, 0x6F, 0x07,
      ]));
      expect(r.calls, ['setWindowTitle(hello)']);
    });

    test('OSC 2 sets window title (terminated by ST = ESC \\)', () {
      final r = _Recorder();
      TerminalParser(r).write(_bytes([
        0x1B, 0x5D, 0x32, 0x3B,
        0x66, 0x6F, 0x6F, // "foo"
        0x1B, 0x5C,
      ]));
      expect(r.calls, ['setWindowTitle(foo)']);
    });

    test('DCS tmux passthrough re-parses inner CSI sequences', () {
      // tmux wraps escape sequences in DCS: ESC P tmux ; <data> ESC \
      // The inner <data> uses doubled ESC for literal ESC bytes.
      // Here: DCS tmux ; ESC ESC [ 6 n ESC \  →  CSI 6 n (DSR)
      // The doubled ESC ESC becomes a single ESC, so we get
      // ESC [ 6 n which is a DSR cursor position report.
      final r = _Recorder();
      TerminalParser(r).write(_bytes([
        0x1B, 0x50, // ESC P — start DCS
        0x74, 0x6D, 0x75, 0x78, 0x3B, 0x20, // "tmux; "
        0x1B, 0x1B, 0x5B, 0x36, 0x6E, // doubled ESC + CSI 6n
        0x1B, 0x5C, // ESC \ — ST terminator
      ]));
      // The inner ESC ESC [ 6 n becomes ESC [ 6 n = DSR reportStatus(6)
      expect(r.calls, ['reportStatus(6)']);
    });

    test('Multi-byte UTF-8 is reassembled across chunks', () {
      final r = _Recorder();
      final p = TerminalParser(r);
      // é is 0xC3 0xA9 in UTF-8. Feed it split across two writes.
      p.write(_bytes([0xC3]));
      p.write(_bytes([0xA9]));
      expect(r.calls, ['putChar(é)']);
    });

    test('Stray continuation byte is dropped', () {
      final r = _Recorder();
      TerminalParser(r).write(_bytes([0xA9, 0x41]));
      // The 0xA9 is dropped (orphan continuation). Then 'A' emits.
      expect(r.calls, ['putChar(A)']);
    });

    test('Incomplete UTF-8 at end of chunk is held for next write', () {
      final r = _Recorder();
      final p = TerminalParser(r);
      p.write(_bytes([0xE2, 0x82])); // first 2 bytes of €
      // No putChar yet.
      expect(r.calls, isEmpty);
      p.write(_bytes([0xAC])); // last byte
      expect(r.calls, ['putChar(€)']);
    });

    test('CRISPR cross-frame: SGR then text across two writes', () {
      final r = _Recorder();
      final p = TerminalParser(r);
      p.write(_str('\x1B[31m')); // red
      p.write(_str('hi'));
      expect(r.calls, ['setSgr(31)', 'putChar(h)', 'putChar(i)']);
    });

    test('ESC c = full reset', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1Bc'));
      expect(r.calls, [
        'eraseInDisplay(3)',
        'resetSgr',
        'cursorPosition(1, 1)',
      ]);
    });

    test('SGR 256-color (38;5;42) is dispatched in order', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[38;5;42m'));
      // The parser dispatches each SGR param as setSgr; the
      // TerminalView's target implementation interprets the
      // 38/38;5/38;2 sequences. The parser's job is to deliver
      // the params in order.
      expect(r.calls.length, 3);
      expect(r.calls[0], 'setSgr(38)');
      expect(r.calls[1], 'setSgr(5)');
      expect(r.calls[2], 'setSgr(42)');
    });

    test('SGR truecolor (38;2;255;128;0)', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[38;2;255;128;0m'));
      expect(r.calls, [
        'setSgr(38)',
        'setSgr(2)',
        'setSgr(255)',
        'setSgr(128)',
        'setSgr(0)',
      ]);
    });

    test('SGR 256-color colon form (38:5:42)', () {
      // Modern TUIs emit colon-separated SGR params.
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[38:5:42m'));
      // Same 3 params as semicolon form.
      expect(r.calls.length, 3);
      expect(r.calls[0], 'setSgr(38)');
      expect(r.calls[1], 'setSgr(5)');
      expect(r.calls[2], 'setSgr(42)');
    });

    test('SGR truecolor colon form (38:2:255:128:0)', () {
      // Modern TUIs emit colon-separated truecolor: 38:2:R:G:B
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[38:2:255:128:0m'));
      expect(r.calls, [
        'setSgr(38)',
        'setSgr(2)',
        'setSgr(255)',
        'setSgr(128)',
        'setSgr(0)',
      ]);
    });
  });
}
