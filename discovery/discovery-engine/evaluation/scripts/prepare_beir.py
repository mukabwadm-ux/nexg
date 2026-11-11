"""Download only the pre-registered public BEIR smoke sets. No NEXG data leaves this host.

Standard library only. Archives are hash checked against the pinned official README;
only three explicitly named members are materialized, never arbitrary ZIP paths.
"""
from pathlib import Path
from urllib.request import Request, urlopen
import hashlib
import json
import re
import uuid
import zipfile
import io
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[2]
target = root / 'artifacts/evaluation' / ('beir-inputs-' + str(uuid.uuid4()))
target.mkdir(parents=True)

def get(url, maximum=64 * 1024 * 1024):
    request = Request(url, headers={'User-Agent': 'NexG-local-evaluation/1', 'Accept': 'application/json,text/plain,*/*'})
    with urlopen(request, timeout=30) as response:
        body = response.read(maximum + 1)
        if len(body) > maximum or not response.url.startswith('https://'):
            raise ValueError('Public input exceeded bound or insecure redirect')
        return body

try:
    commit = json.loads(get('https://api.github.com/repos/beir-cellar/beir/commits/main', 1024 * 1024))['sha']
    if not re.fullmatch('[a-f0-9]{40}', commit):
        raise ValueError('Invalid official repository revision')
    readme_url = f'https://raw.githubusercontent.com/beir-cellar/beir/{commit}/README.md'
    readme = get(readme_url, 1024 * 1024)
    (target / 'beir-readme.md').write_bytes(readme)
    entries = []
    for name in ('scifact', 'nfcorpus', 'arguana'):
        rows = [line for line in readme.decode('utf-8').splitlines() if re.search(r'\|\s*`*' + name + r'`*\s*\|', line)]
        hashes = re.findall(r'\b[a-f0-9]{32}\b', '\n'.join(rows))
        if len(set(hashes)) != 1:
            raise ValueError('Missing unambiguous official archive MD5: ' + name)
        metadata_url = f'https://huggingface.co/api/datasets/BeIR/{name}'
        metadata = json.loads(get(metadata_url, 2 * 1024 * 1024))
        license_value = metadata.get('cardData', {}).get('license')
        if isinstance(license_value, list):
            license_value = ','.join(license_value)
        if not isinstance(license_value, str) or not license_value:
            raise ValueError('Missing dataset license metadata: ' + name)
        url = f'https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/{name}.zip'
        archive = get(url)
        if hashlib.md5(archive).hexdigest() != hashes[0]:
            raise ValueError('Official archive MD5 mismatch: ' + name)
        directory = target / name
        directory.mkdir()
        (directory / 'archive.zip').write_bytes(archive)
        files = {}
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            for member in ('corpus.jsonl', 'queries.jsonl', 'qrels/test.tsv'):
                info = zipped.getinfo(f'{name}/{member}')
                if info.file_size > 128 * 1024 * 1024:
                    raise ValueError('Uncompressed public input exceeded bound')
                body = zipped.read(info)
                path = directory / member
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(body)
                files[member] = {'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)}
        entries.append({'name': name, 'archiveUrl': url, 'archiveMd5': hashes[0], 'archiveSha256': hashlib.sha256(archive).hexdigest(),
                        'files': files, 'license': license_value, 'licenseSource': metadata_url, 'datasetCardRevision': metadata.get('sha')})
        print(json.dumps({'prepared': name, 'archiveBytes': len(archive), 'license': license_value}), flush=True)
    manifest = {'schemaVersion': '1', 'preparedAt': datetime.now(timezone.utc).isoformat(), 'beirRevision': commit,
                'readmeSource': readme_url, 'readmeSha256': hashlib.sha256(readme).hexdigest(), 'datasets': entries,
                'scope': 'Internal public-research lexical smoke only. No NEXG data upload or marketplace inventory.'}
    (target / 'prepared.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'result': 'PREPARED', 'manifest': str(target / 'prepared.json')}), flush=True)
except Exception as error:
    (target / 'preparation-failure.json').write_text(json.dumps({'result': 'UNAVAILABLE', 'errorType': type(error).__name__, 'reason': str(error)[:256]}), encoding='utf-8')
    raise
