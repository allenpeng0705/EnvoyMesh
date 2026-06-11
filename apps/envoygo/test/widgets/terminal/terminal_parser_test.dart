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
      calls.add('cursorPosition($row,$col)');

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
  void setScrollRegion(int top, int bottom) =>
      calls.add('setScrollRegion($top,$bottom)');

  @override
  void setSgr(int param) => calls.add('setSgr($param)');

  @override
  void resetSgr() => calls.add('resetSgr');

  @override
  void setWindowTitle(String title) => calls.add('setWindowTitle($title)');

  @override
  void setDecMode(int mode, bool enabled) =>
      calls.add('setDecMode($mode,${enabled ? 'on' : 'off'})');

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
      expect(r.calls, ['cursorPosition(10,20)']);
    });

    test('CSI H with no params = home', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[H'));
      expect(r.calls, ['cursorPosition(1,1)']);
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

    test('CSI r sets scroll region', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[5;15r'));
      expect(r.calls, ['setScrollRegion(5,15)']);
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
        'setDecMode(25,on)',
        'setDecMode(25,off)',
      ]);
    });

    test('DEC private mode ?1049h enters alt-screen, ?1049l exits', () {
      final r = _Recorder();
      TerminalParser(r).write(_str('\x1B[?1049h\x1B[?1049l'));
      expect(r.calls, [
        'setDecMode(1049,on)',
        'setDecMode(1049,off)',
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
        'cursorPosition(1,1)',
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
  });
}
