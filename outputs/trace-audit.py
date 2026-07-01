"""Trace the audit against the pre-fix runtime."""
import re, subprocess

# Step 1: How the audit finds runtime calls
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location('audit', 'outputs/audit-missing-args-v2.py')
mod = module_from_spec(spec)

# The functions are defined inside if __name__ block? Let me just inline them.
from pathlib import Path

# Manually re-implement find_runtime_calls + parse_required_params + check.
import sys
sys.path.insert(0, 'outputs')

# Load the audit module's globals
audit_src = Path('outputs/audit-missing-args-v2.py').read_text()
exec(audit_src)

# Now check task.feedback specifically
rt_path = Path('outputs/pre-fix-tf.ts')
calls = find_runtime_calls(rt_path)
print(f"calls in pre-fix-tf.ts: {calls}")
print()

helper = 'handleInboundTaskFeedback'
src = find_helper_source(helper)
print(f"helper source: {src}")
required = parse_required_params(src, helper)
print(f"required: {required}")
print()

# Compare
for helper_name, args in calls:
    missing = [r for r in required if r not in args]
    print(f"  {helper_name}: missing={missing}")