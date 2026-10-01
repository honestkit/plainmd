#!/usr/bin/env python3
"""Package ext/ into plainmd-<version>.zip for the Chrome Web Store."""
import json, pathlib, zipfile
root = pathlib.Path(__file__).parent; ext = root / 'ext'
v = json.loads((ext / 'manifest.json').read_text())['version']
out = root / f'plainmd-{v}.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(ext.rglob('*')):
        if f.is_file() and not f.name.endswith('.map'): z.write(f, f.relative_to(ext))
print(out, out.stat().st_size)
