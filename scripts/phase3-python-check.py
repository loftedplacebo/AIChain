"""Check JavaScript-produced alpha presentations with the Python SDK."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'sdk' / 'python'))
from avr_presentation import derive_presentation, validate_presentation

files = sorted((Path(sys.argv[1]) / 'presentations').glob('*.json'))
assert len(files) == 2, 'Expected proved and unproved presentations'
results = []
for file in files:
    presentation = json.loads(file.read_text())
    validate_presentation(presentation)
    results.append(derive_presentation(presentation))
print(json.dumps(results))
