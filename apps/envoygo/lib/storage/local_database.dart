import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// SQLite-backed local database for cached contacts, threads, messages,
/// nodes, and chat rooms.
class LocalDatabase {
  static LocalDatabase? _instance;

  factory LocalDatabase() {
    _instance ??= LocalDatabase._();
    return _instance!;
  }

  LocalDatabase._();

  /// Test-only factory that returns a fresh, non-singleton instance.
  /// Use from widget/unit tests to avoid cross-test pollution of the
  /// singleton's database handle.
  @visibleForTesting
  factory LocalDatabase.test() = LocalDatabase._;

  Database? _db;
  bool _initialized = false;

  /// Initialize the database and create tables.
  Future<void> initialize() async {
    if (_initialized) return;
    final dbPath = p.join(await getDatabasesPath(), 'envoygo.db');
    _db = await openDatabase(
      dbPath,
      version: 3,
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await db.execute('ALTER TABLE nodes ADD COLUMN public_host TEXT');
          await db.execute('ALTER TABLE nodes ADD COLUMN public_port INTEGER DEFAULT 3030');
        }
        if (oldVersion < 3) {
          await db.execute('ALTER TABLE nodes ADD COLUMN bootstrap_peers TEXT');
        }
      },
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE nodes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            home_peer_id TEXT NOT NULL,
            lan_ip TEXT,
            ws_port INTEGER DEFAULT 3030,
            relay_ws_url TEXT,
            paired_at TEXT NOT NULL,
            last_connected_at TEXT,
            public_host TEXT,
            public_port INTEGER DEFAULT 3030,
            bootstrap_peers TEXT
          )
        ''');
        await db.execute('''
          CREATE TABLE contacts (
            owner_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            display_name TEXT,
            bond_level TEXT,
            avatar_url TEXT,
            last_seen TEXT,
            PRIMARY KEY (owner_id, node_id)
          )
        ''');
        await db.execute('''
          CREATE TABLE chat_threads (
            id TEXT PRIMARY KEY,
            node_id TEXT NOT NULL,
            type TEXT NOT NULL,
            display_name TEXT NOT NULL,
            contact_owner_id TEXT,
            chat_room_id TEXT,
            agent_type TEXT,
            last_message_text TEXT,
            last_message_at TEXT,
            unread_count INTEGER DEFAULT 0
          )
        ''');
        await db.execute('''
          CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            sender_owner_id TEXT,
            sender_display_name TEXT,
            text TEXT,
            created_at TEXT,
            is_outbound INTEGER DEFAULT 0
          )
        ''');
        await db.execute('''
          CREATE TABLE chat_rooms (
            id TEXT PRIMARY KEY,
            node_id TEXT NOT NULL,
            name TEXT NOT NULL,
            member_count INTEGER DEFAULT 0,
            last_message_text TEXT,
            last_message_at TEXT
          )
        ''');
      },
    );
    _initialized = true;
  }

  Database get _ensureDb {
    if (_db == null) throw StateError('LocalDatabase not initialized');
    return _db!;
  }

  // -- Node operations --

  Future<void> upsertNode(Map<String, dynamic> node) async {
    // Serialize bootstrap_peers to JSON so sqflite can store it as TEXT.
    final row = Map<String, dynamic>.from(node);
    final peers = row['bootstrap_peers'];
    if (peers is List) {
      row['bootstrap_peers'] = jsonEncode(peers);
    }
    await _ensureDb.insert(
      'nodes',
      row,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<Map<String, dynamic>?> getNode(String nodeId) async {
    final results = await _ensureDb.query(
      'nodes',
      where: 'id = ?',
      whereArgs: [nodeId],
    );
    return results.isNotEmpty ? results.first : null;
  }

  Future<List<Map<String, dynamic>>> listNodes() async {
    return _ensureDb.query('nodes', orderBy: 'last_connected_at DESC');
  }

  Future<void> deleteNode(String nodeId) async {
    await _ensureDb.delete('nodes', where: 'id = ?', whereArgs: [nodeId]);
    // Cascade: remove contacts, threads, messages for this node.
    await _ensureDb.delete(
      'contacts',
      where: 'node_id = ?',
      whereArgs: [nodeId],
    );
    await _ensureDb.delete(
      'chat_threads',
      where: 'node_id = ?',
      whereArgs: [nodeId],
    );
    await _ensureDb.delete(
      'messages',
      where: 'thread_id IN (SELECT id FROM chat_threads WHERE node_id = ?)',
      whereArgs: [nodeId],
    );
    await _ensureDb.delete(
      'chat_rooms',
      where: 'node_id = ?',
      whereArgs: [nodeId],
    );
  }

  Future<void> updateNodeLastConnected(String nodeId) async {
    await _ensureDb.update(
      'nodes',
      {'last_connected_at': DateTime.now().toIso8601String()},
      where: 'id = ?',
      whereArgs: [nodeId],
    );
  }

  // -- Contact operations --

  Future<void> upsertContacts(
      String nodeId, List<Map<String, dynamic>> contacts) async {
    final batch = _ensureDb.batch();
    for (final c in contacts) {
      batch.insert(
        'contacts',
        {...c, 'node_id': nodeId},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<List<Map<String, dynamic>>> getContacts(String nodeId) async {
    return _ensureDb.query(
      'contacts',
      where: 'node_id = ?',
      whereArgs: [nodeId],
    );
  }

  Future<void> deleteContact(String nodeId, String ownerId) async {
    await _ensureDb.delete(
      'contacts',
      where: 'node_id = ? AND owner_id = ?',
      whereArgs: [nodeId, ownerId],
    );
  }

  // -- Thread operations --

  Future<void> upsertThread(Map<String, dynamic> thread) async {
    await _ensureDb.insert(
      'chat_threads',
      thread,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> getThreads(String nodeId) async {
    return _ensureDb.query(
      'chat_threads',
      where: 'node_id = ?',
      whereArgs: [nodeId],
      // Stable insertion order — threads don't jump around when a new
      // message arrives. Users expect their chat list to stay put.
      orderBy: 'id ASC',
    );
  }

  Future<void> deleteThread(String threadId) async {
    await _ensureDb.delete('chat_threads', where: 'id = ?', whereArgs: [threadId]);
    await _ensureDb.delete('messages', where: 'thread_id = ?', whereArgs: [threadId]);
  }

  Future<void> deleteMessage(String msgId) async {
    await _ensureDb.delete('messages', where: 'id = ?', whereArgs: [msgId]);
  }

  Future<void> deleteMessagesForThread(String threadId) async {
    await _ensureDb.delete('messages', where: 'thread_id = ?', whereArgs: [threadId]);
  }

  // -- Message operations --

  /// Columns accepted by the `messages` table. Extra keys (e.g. attachments
  /// List) must be stripped — sqflite throws on unknown columns / nested types,
  /// which crashed ChatDetailScreen when opening a contact thread with history.
  static const _messageColumns = {
    'id',
    'thread_id',
    'sender_owner_id',
    'sender_display_name',
    'text',
    'created_at',
    'is_outbound',
  };

  Map<String, dynamic> _messageRow(Map<String, dynamic> message) {
    final row = <String, dynamic>{};
    for (final key in _messageColumns) {
      if (message.containsKey(key)) row[key] = message[key];
    }
    return row;
  }

  /// Replace a temp (optimistic) message with the server version.
  Future<void> replaceMessage(String tempId, Map<String, dynamic> msg) async {
    await _ensureDb.update(
      'messages',
      _messageRow(msg),
      where: 'id = ?',
      whereArgs: [tempId],
    );
  }

  Future<void> insertMessage(Map<String, dynamic> message) async {
    await _ensureDb.insert(
      'messages',
      _messageRow(message),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> getMessages(String threadId,
      {int limit = 50, String? before}) async {
    String? whereClause;
    List<Object?>? whereArgs;
    if (before != null) {
      whereClause = 'thread_id = ? AND created_at < ?';
      whereArgs = [threadId, before];
    } else {
      whereClause = 'thread_id = ?';
      whereArgs = [threadId];
    }
    return _ensureDb.query(
      'messages',
      where: whereClause,
      whereArgs: whereArgs,
      orderBy: 'created_at DESC',
      limit: limit,
    );
  }

  // -- Room operations --

  Future<void> upsertRooms(
      String nodeId, List<Map<String, dynamic>> rooms) async {
    final batch = _ensureDb.batch();
    for (final r in rooms) {
      batch.insert(
        'chat_rooms',
        {...r, 'node_id': nodeId},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<List<Map<String, dynamic>>> getRooms(String nodeId) async {
    return _ensureDb.query(
      'chat_rooms',
      where: 'node_id = ?',
      whereArgs: [nodeId],
      orderBy: 'last_message_at DESC',
    );
  }

  /// Close the database.
  Future<void> close() async {
    await _db?.close();
    _db = null;
    _initialized = false;
  }
}
