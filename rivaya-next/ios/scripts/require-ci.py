"""Only upload a commit whose iOS compile and UI smoke workflow passed."""
import json, os, urllib.request
repo, sha = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA']
request = urllib.request.Request(
    f'https://api.github.com/repos/{repo}/actions/workflows/ios-preview.yml/runs?head_sha={sha}',
    headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'})
with urllib.request.urlopen(request, timeout=30) as response:
    runs = json.load(response)['workflow_runs']
matching = sorted((r for r in runs if r['head_sha'] == sha), key=lambda r: r['id'], reverse=True)
if not matching or matching[0]['conclusion'] != 'success':
    raise SystemExit('Wait for the iOS compile and simulator smoke workflow on this exact commit to pass, then rerun upload.')
print('Exact commit iOS release checks passed.')
