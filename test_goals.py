import sys
from weasyprint import HTML
import time
import signal
import re

def handler(signum, frame):
    print("\nTIMEOUT Reached! The rendering took too long.")
    sys.exit(1)

signal.signal(signal.SIGALRM, handler)
signal.alarm(30)

with open('modules/yearly_goals.html', 'r') as f:
    full_file = f.read()

# Simulate clean_static stripping
if '<body' in full_file:
    if 'class="spread-container"' in full_file:
        content = full_file.split('class="spread-container">')[1]
    elif '<body>' in full_file:
        content = full_file.split('<body>')[1]
    if '</body>' in content:
        content = content.split('</body>')[0]
else:
    content = full_file

# Note: We are NOT extracting styles because build_agenda doesn't! 
# This tests exactly what build_agenda does for this file.

full_html = f"""
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Test Yearly Goals</title>
    <link rel="stylesheet" href="css/global.css">
    <link rel="stylesheet" href="css/layout.css">
    <style>
        .page {{ page-break-after: always; break-after: always; }}
    </style>
</head>
<body class="spread-container">
    {content}
</body>
</html>
"""

print("Starting render of yearly_goals.html...")
start = time.time()
HTML(string=full_html, base_url='.').write_pdf('test_goals.pdf')
end = time.time()
print(f"DONE in {end - start:.2f} seconds.")
