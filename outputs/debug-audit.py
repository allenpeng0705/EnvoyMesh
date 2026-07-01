"""Debug: show what the audit finds for handleInboundTaskFeedback."""
import sys
sys.path.insert(0, 'outputs')
import importlib.util
spec = importlib.util.spec_from_file_location("audit_missing_args", "outputs/audit-missing-args.py")
mod = importlib.util.module_from_spec(spec)

# Manually invoke the relevant functions with prints
import re, subprocess
from pathlib import Path

helper = 'handleInboundTaskFeedback'
src = mod.find_helper_source(helper)
print(f"helper source: {src}")
required = mod.parse_required_params(src, helper)
print(f"required: {required}")

rt = Path('apps/node/src/cli-mesh-inbound-task-feedback.ts')
calls = mod.find_runtime_calls(rt)
print(f"calls in {rt.name}: {calls}")

# Check: are the required params in the args?
if required:
    for helper_name, args in calls:
        if helper_name == helper:
            missing = [r for r in required if r not in args]
            print(f"missing: {missing}")