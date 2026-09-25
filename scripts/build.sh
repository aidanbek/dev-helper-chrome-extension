#!/usr/bin/env bash
# Сборка zip для загрузки в Chrome Web Store: dist/dev-helper-<version>.zip
set -euo pipefail

cd "$(dirname "$0")/.."

# Что попадает в пакет — всё остальное (README, store/, scripts/, .idea) остаётся снаружи
FILES=(manifest.json background.js common features options icons)

python3 - "${FILES[@]}" <<'PY'
import json, os, sys, zipfile

with open('manifest.json', encoding='utf-8') as f:
    manifest = json.load(f)

version = manifest['version']
name = 'dev-helper-' + version + '.zip'
os.makedirs('dist', exist_ok=True)
out = os.path.join('dist', name)

# Все файлы, на которые ссылается манифест, должны существовать
refs = [manifest['background']['service_worker'], manifest['options_ui']['page']]
refs += manifest['icons'].values()
refs += manifest['action']['default_icon'].values()
for cs in manifest.get('content_scripts', []):
    refs += cs.get('js', []) + cs.get('css', [])
missing = [r for r in refs if not os.path.isfile(r)]
if missing:
    sys.exit('нет файлов из manifest.json: ' + ', '.join(missing))

paths = []
for entry in sys.argv[1:]:
    if os.path.isdir(entry):
        for root, _, files in os.walk(entry):
            paths += [os.path.join(root, f) for f in files]
    else:
        paths.append(entry)

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(paths):
        z.write(p)

print(out, '—', len(paths), 'файлов')
PY
