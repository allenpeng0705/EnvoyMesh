/// WeChat Moments–style relative time (meaningful, not full datetime).
String formatMomentsTime(String iso, {DateTime? now}) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return iso;
  final n = now ?? DateTime.now();
  final diff = n.difference(d);
  if (diff.isNegative) return 'Just now';
  if (diff.inSeconds < 60) return 'Just now';
  if (diff.inMinutes < 60) {
    final m = diff.inMinutes;
    return m == 1 ? '1 minute ago' : '$m minutes ago';
  }

  final dayStartNow = DateTime(n.year, n.month, n.day);
  final dayStartThen = DateTime(d.year, d.month, d.day);
  final dayDiff = dayStartNow.difference(dayStartThen).inDays;

  if (dayDiff == 0) {
    final h = diff.inHours.clamp(1, 23);
    return h == 1 ? '1 hour ago' : '$h hours ago';
  }
  if (dayDiff == 1) {
    final hm =
        '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    return 'Yesterday $hm';
  }
  if (dayDiff >= 2 && dayDiff < 7) {
    return dayDiff == 1 ? '1 day ago' : '$dayDiff days ago';
  }
  if (d.year == n.year) {
    return _monthDay(d);
  }
  return '${_monthDay(d)}, ${d.year}';
}

String _monthDay(DateTime d) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${months[d.month - 1]} ${d.day}';
}
