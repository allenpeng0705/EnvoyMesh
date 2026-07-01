import re
text = open('apps/node/src/reputation-inbound.ts').read()
m = re.search(r'(?:async\s+)?function\s+handleInboundTaskFeedback\(\s*input:\s*\{([^}]+)\}\s*\)', text)
print('match:', bool(m))
if m:
    print('body:', m.group(1)[:200])
print()
# Also check what the audit's helper signature parser returns.
src = text
helper = 'handleInboundTaskFeedback'
m = re.search(rf"(?:async\s+)?function\s+{re.escape(helper)}\(\s*input:\s*\{{([^}}]+)\}}\s*\)", src)
print('match2:', bool(m))
if m:
    print('body2:', m.group(1)[:200])