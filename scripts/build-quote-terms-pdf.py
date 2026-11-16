"""Generate versioned public PDF and identical server email attachment. Requires reportlab."""
import base64, json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4

root=Path(__file__).resolve().parents[1]
data=json.loads((root/'src/content/quote-service-terms-2026-11-16.json').read_text())
filename=f'secure-cleaning-quote-terms-{data["version"]}.pdf'
path=root/'public/documents'/filename
body=ParagraphStyle('Body',fontName='Helvetica',fontSize=10,leading=14,spaceAfter=8,textColor=HexColor('#334155'))
heading=ParagraphStyle('Heading',parent=body,fontName='Helvetica-Bold',fontSize=12,leading=16,spaceBefore=12,spaceAfter=7,keepWithNext=True,textColor=HexColor('#0f766e'))
title=ParagraphStyle('Title',parent=heading,fontSize=24,leading=28)
story=[Paragraph('SECURE CLEANING',heading),Paragraph(escape(data['title']),title),Paragraph('Version 16 November 2026 | Quote validity: 30 days',body),Spacer(1,8)]
for i,s in enumerate(data['sections'],1):
 story.append(Paragraph(f'{i}. {escape(s["heading"])}',heading))
 story.extend(Paragraph(escape(p),body) for p in s['paragraphs'])
def footer(canvas,doc):
 canvas.saveState();canvas.setFont('Helvetica',8);canvas.setFillColor(HexColor('#64748b'))
 canvas.drawString(44,28,'Secure Cleaning | Quote & Service Terms | '+data['version'])
 canvas.drawRightString(A4[0]-44,28,f'Page {doc.page}');canvas.restoreState()
SimpleDocTemplate(str(path),pagesize=A4,rightMargin=44,leftMargin=44,topMargin=34,bottomMargin=48,title='Secure Cleaning - Quote & Service Terms',author='Secure Cleaning',invariant=1).build(story,onFirstPage=footer,onLaterPages=footer)
(root/'src/content/quote-service-terms-pdf.json').write_text(json.dumps({'filename':filename,'content':base64.b64encode(path.read_bytes()).decode()})+'\n')
print(path)
