import sys
from weasyprint import HTML
import time
import signal
import re

def handler(signum, frame):
    print("\nTIMEOUT Reached! The rendering took too long, likely infinite loop.")
    sys.exit(1)

signal.signal(signal.SIGALRM, handler)
signal.alarm(30) # 30 seconds timeout

with open('modules/yearly_view.html', 'r') as f:
    full_file = f.read()

# Extract styles
style_match = re.search(r'<style>(.*?)</style>', full_file, re.DOTALL)
styles = style_match.group(1) if style_match else ""

# Extract body content
if '<body' in full_file:
    if 'class="spread-container"' in full_file:
        content = full_file.split('class="spread-container">')[1]
    elif '<body>' in full_file:
        content = full_file.split('<body>')[1]
    if '</body>' in content:
        content = content.split('</body>')[0]
else:
    content = full_file # Fallback

full_html = f"""
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Test Yearly View With Styles</title>
    <link rel="stylesheet" href="css/global.css">
    <link rel="stylesheet" href="css/layout.css">
    <style>
        .page {{ page-break-after: always; break-after: always; }}
        /* Injected Styles from module */
        {styles}
    </style>
</head>
<body class="spread-container">
    {content}
</body>
</html>
"""

print("Starting render of yearly_view.html WITH STYLES...")
start = time.time()
HTML(string=full_html, base_url='.').write_pdf('test_output_styled.pdf')
end = time.time()
print(f"DONE in {end - start:.2f} seconds.")
