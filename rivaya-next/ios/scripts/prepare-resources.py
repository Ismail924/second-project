"""Decode the existing RIVAYA icon for Xcode; no third-party dependencies."""
import base64
from pathlib import Path
root = Path(__file__).resolve().parents[1]
icon = root / 'Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png'
icon.write_bytes(base64.b64decode(icon.with_suffix('.png.base64').read_text(), validate=False))
