import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

interface StructuredResume {
  header?: {
    name?: string;
    title?: string;
    contact?: string[];
  };
  summary?: string;
  skills?: string[];
  experience?: {
    company?: string;
    role?: string;
    period?: string;
    bullets?: string[];
  }[];
  projects?: {
    name?: string;
    description?: string[];
  }[];
  education?: {
    school?: string;
    degree?: string;
    period?: string;
  }[];
  certifications?: string[];
  tools?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const { structuredResume }: { structuredResume: StructuredResume } =
      await req.json();

    if (!structuredResume) {
      return NextResponse.json(
        { error: "Missing structured resume" },
        { status: 400 }
      );
    }

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageSize: [number, number] = [595, 842]; // A4
    let page = pdfDoc.addPage(pageSize);

    const marginX = 50;
    const maxWidth = pageSize[0] - marginX * 2;
    let y = 800;

    const ensureSpace = (lineHeight: number) => {
      if (y - lineHeight < 50) {
        page = pdfDoc.addPage(pageSize);
        y = 800;
      }
    };

    const drawLine = (
      text: string,
      {
        size = 11,
        gap = 16,
        bold = false,
      }: { size?: number; gap?: number; bold?: boolean } = {}
    ) => {
      if (!text || !text.trim()) return;
      ensureSpace(gap);
      page.drawText(text, {
        x: marginX,
        y,
        size,
        font: bold ? fontBold : font,
      });
      y -= gap;
    };

    const drawWrapped = (
      text: string,
      {
        size = 11,
        gap = 16,
        bold = false,
      }: { size?: number; gap?: number; bold?: boolean } = {}
    ) => {
      if (!text || !text.trim()) return;

      const words = text.split(/\s+/);
      let line = "";

      for (const word of words) {
        const testLine = line ? line + " " + word : word;
        const width = (bold ? fontBold : font).widthOfTextAtSize(
          testLine,
          size
        );

        if (width > maxWidth) {
          ensureSpace(gap);
          page.drawText(line, {
            x: marginX,
            y,
            size,
            font: bold ? fontBold : font,
          });
          y -= gap;
          line = word;
        } else {
          line = testLine;
        }
      }

      if (line) {
        ensureSpace(gap);
        page.drawText(line, {
          x: marginX,
          y,
          size,
          font: bold ? fontBold : font,
        });
        y -= gap;
      }
    };

    const drawSectionTitle = (title: string) => {
      if (!title) return;
      drawLine(title.toUpperCase(), { size: 12, bold: true, gap: 20 });
      ensureSpace(10);
      page.drawLine({
        start: { x: marginX, y: y + 6 },
        end: { x: marginX + 150, y: y + 6 },
        thickness: 1,
        color: rgb(0.35, 0.35, 0.35),
      });
      y -= 14;
    };

    // -------- HEADER --------
    if (structuredResume.header) {
      const { name, title, contact } = structuredResume.header;

      if (name) {
        drawLine(name, { size: 22, bold: true, gap: 26 });
      }
      if (title) {
        drawLine(title, { size: 14, gap: 20 });
      }
      if (contact?.length) {
        drawWrapped(contact.join(" • "), { size: 10, gap: 22 });
      }
      y -= 8;
    }

    // -------- SUMMARY --------
    if (structuredResume.summary) {
      drawSectionTitle("Summary");
      drawWrapped(structuredResume.summary, { size: 11, gap: 16 });
      y -= 6;
    }

    // -------- SKILLS --------
    if (structuredResume.skills?.length) {
      drawSectionTitle("Skills");

      const skills = structuredResume.skills;
      const half = Math.ceil(skills.length / 2);
      const row1 = skills.slice(0, half).join(" • ");
      const row2 = skills.slice(half).join(" • ");

      drawWrapped(row1, { size: 11, gap: 14 });
      if (row2) drawWrapped(row2, { size: 11, gap: 16 });

      y -= 6;
    }

    // -------- EXPERIENCE --------
    if (structuredResume.experience?.length) {
      drawSectionTitle("Professional Experience");

      for (const job of structuredResume.experience) {
        const headerLine = `${job.role ?? ""}${
          job.company ? " – " + job.company : ""
        }${job.period ? " (" + job.period + ")" : ""}`;

        if (headerLine.trim()) {
          drawWrapped(headerLine, { size: 11, bold: true, gap: 18 });
        }

        if (job.bullets?.length) {
          for (const b of job.bullets) {
            drawWrapped(`• ${b}`, { size: 11, gap: 14 });
          }
        }
        y -= 6;
      }
    }

    // -------- PROJECTS --------
    if (structuredResume.projects?.length) {
      drawSectionTitle("Projects");

      for (const proj of structuredResume.projects) {
        if (proj.name) {
          drawWrapped(proj.name, { size: 11, bold: true, gap: 18 });
        }
        if (proj.description?.length) {
          for (const d of proj.description) {
            drawWrapped(`• ${d}`, { size: 11, gap: 14 });
          }
        }
        y -= 6;
      }
    }

    // -------- EDUCATION --------
    if (structuredResume.education?.length) {
      drawSectionTitle("Education");

      for (const edu of structuredResume.education) {
        const line = `${edu.degree ?? ""}${
          edu.school ? " – " + edu.school : ""
        }${edu.period ? " (" + edu.period + ")" : ""}`;
        if (line.trim()) {
          drawWrapped(line, { size: 11, gap: 18 });
        }
      }
      y -= 6;
    }

    // -------- CERTIFICATIONS --------
    if (structuredResume.certifications?.length) {
      drawSectionTitle("Certifications");

      for (const c of structuredResume.certifications) {
        drawWrapped(`• ${c}`, { size: 11, gap: 14 });
      }
      y -= 6;
    }

    // -------- TOOLS --------
    if (structuredResume.tools?.length) {
      drawSectionTitle("Tools & Technologies");
      drawWrapped(structuredResume.tools.join(" • "), {
        size: 11,
        gap: 16,
      });
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=Resume-Improved.pdf",
      },
    });
  } catch (err: unknown) {
    console.error("❌ download-resume error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: (err as Error).message },
      { status: 500 }
    );
  }
}
