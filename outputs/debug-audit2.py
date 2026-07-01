"""Self-contained debug: trace what the audit script does."""
import re, subprocess
from pathlib import Path

helper = 'handleInboundTaskFeedback'

# Step 1: find source
r = subprocess.run(
    ["grep", "-rn", "--include=*.ts",
     f"function {helper}(\\|export.*function {helper}(\\|export async function {helper}(",
     "apps/node/src"],
    capture_output=True, text=True,
)
print(f"grep output:\n{r.stdout}")
if r.stdout:
    for line in r.stdout.splitlines():
        if ".test.ts" in line:
            continue
        src = line.split(":")[0]
        print(f"using src: {src}")
        break

text = Path(src).read_text()
m = re.search(
    rf"(?:async\s+)?function\s+{re.escape(helper)}\(\s*input:\s*\{{([^}}]+)\}}\s*\)",
    text,
)
if not m:
    print("regex didn't match!")
else:
    body = m.group(1).strip()
    print(f"body: {body!r}")

# Step 2: parse params
items = [s.strip() for s in body.split(",")]
print(f"items: {items}")
params = []
for item in items:
    nm = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)", item)
    if nm:
        params.append(nm.group(1))
print(f"params: {params}")