import sys
from weasyprint import HTML
import time
import signal

# Set a timeout to avoid freezing the agent/system infinitely
def handler(signum, frame):
    print("\nTIMEOUT Reached! The rendering took too long, likely infinite loop.")
    sys.exit(1)

signal.signal(signal.SIGALRM, handler) # Register handler
signal.alarm(20)

with open('modules/yearly_view.html', 'r') as f:
    content = f.read()

# Strip <html><body> if present (clean_static logic)
if '<body' in content:
    if 'class="spread-container"' in content:
        content = content.split('class="spread-container">')[1]
    elif '<body>' in content:
        content = content.split('<body>')[1]
if '</body>' in content:
    content = content.split('</body>')[0]

full_html = f"""
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Test Yearly View</title>
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

print("Starting render of yearly_view.html...")
start = time.time()
HTML(string=full_html, base_url='.').write_pdf('test_output.pdf')
end = time.time()
print(f"DONE in {end - start:.2f} seconds.")
