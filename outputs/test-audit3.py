"""Run the audit against the pre-fix task.feedback runtime."""
import subprocess, shutil, os

# Temporarily replace the runtime file with the pre-fix version.
src = '/Users/shileipeng/Documents/mygithub/EnvoyMesh/apps/node/src/cli-mesh-inbound-task-feedback.ts'
backup = src + '.bak'
shutil.copyfile(src, backup)
shutil.copyfile('outputs/pre-fix-tf.ts', src)

try:
    r = subprocess.run(['python3', 'outputs/audit-missing-args-v2.py'],
                       capture_output=True, text=True)
    print('AUDIT OUTPUT:')
    print(r.stdout)
    print(r.stderr)
finally:
    # Restore the runtime file
    shutil.copyfile(backup, src)
    os.remove(backup)
print('RESTORED')