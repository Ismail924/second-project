"""Enable optional iOS cloud screens in the internal TestFlight build only.

Public configuration only. Signing keys stay in GitHub/Supabase secret storage.
The source default remains disabled until real-device verification is complete.
"""
from pathlib import Path

config = Path(__file__).resolve().parents[2] / 'app/src/main/assets/backend-config.js'
source = config.read_text()
old = 'window.RIVAYA_BACKEND={enabled:false,appleEnabled:false,'
if source.count(old) != 1:
    raise SystemExit('Unexpected cloud config; refusing to alter this build')
if "url:'https://uerhkthubarwrikjtxul.supabase.co'" not in source:
    raise SystemExit('Unexpected Supabase project')
config.write_text(source.replace(old, 'window.RIVAYA_BACKEND={enabled:window.RIVAYA_IOS===true,appleEnabled:true,preview:true,'))
print('Optional iOS Apple/cloud screens enabled for the internal test build.')
