// 📁 File: /app/api/chat/download-resume/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function POST(req: NextRequest) {
  try {
    const { structuredResume } = await req.json();

    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 12;
    const headingSize = 15;
    const titleSize = 13;
    const lineHeight = fontSize + 4;
    const marginX = 50;
    const marginBottom = 50;

    let page = pdfDoc.addPage();
    let y = page.getHeight() - 60;

    const ensureSpace = (linesNeeded = 1) => {
      if (y - linesNeeded * lineHeight < marginBottom) {
        page = pdfDoc.addPage();
        y = page.getHeight() - 60;
      }
    };

    for (const section of structuredResume) {
      ensureSpace();
      page.drawText(section.heading, {
        x: marginX,
        y,
        font: bold,
        size: headingSize,
        color: rgb(0, 0, 0),
      });
      y -= 25;

      for (const item of section.items) {
        if (item.title) {
          ensureSpace();
          page.drawText(item.title, {
            x: marginX,
            y,
            font: bold,
            size: titleSize,
            color: rgb(0, 0, 0),
          });
          y -= lineHeight;
        }

        for (const line of item.lines) {
          ensureSpace();
          const words = line.split(/(\s+)/);
          let x = marginX;

          for (const word of words) {
            const cleanWord = word.replace(/[\*\[\]\(\)\-]/g, "").trim();
            const isTech = [
              "JavaScript", "TypeScript", "Python", "SQL", "Node.js", "React", "Next.js",
              "Git", "Postman", "Unity", "REST", "MongoDB", "MySQL", "API"
            ].some(tech => cleanWord.toLowerCase() === tech.toLowerCase());

            const font = isTech ? bold : helvetica;
            const wordWidth = font.widthOfTextAtSize(word, fontSize);

            if (x + wordWidth > page.getWidth() - marginX) {
              y -= lineHeight;
              ensureSpace();
              x = marginX;
            }

            page.drawText(word, { x, y, font, size: fontSize });
            x += wordWidth;
          }
          y -= lineHeight;
        }
        y -= 10;
      }
      y -= 10;
    }

    const pdfBytes = await pdfDoc.save();
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=Improved_Resume.pdf",
      },
    });
  } catch (error) {
    console.error("❌ Error generating PDF:", error);
    return NextResponse.json({ error: "Failed to generate PDF", details: String(error) }, { status: 500 });
  }
}
