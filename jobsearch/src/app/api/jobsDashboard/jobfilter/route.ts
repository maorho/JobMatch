import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import ExternalJobs from "@/app/models/ExternalJobs";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();

    const {
      searchTerm = "",
      company = [],
      city = [],
      country = [],
    } = body;

    // 🔍 הכנת regex יעיל לחיפוש
    const regex = new RegExp(searchTerm, "i");

    // =============== פנימיות ==================
    const internalFilter: any = {
      $and: [
        searchTerm
          ? {
              $or: [
                { job: regex },
                { description: regex },
                { city: regex },
                { country: regex },
              ],
            }
          : {},

        company.length > 0 ? { company: { $in: company } } : {},
        city.length > 0 ? { city: { $in: city } } : {},
        country.length > 0 ? { country: { $in: country } } : {},
      ],
    };

    const internalJobs = await Job.find(internalFilter)
      .populate("company")
      .lean();

    // התאמת מבנה אחיד
    const internalMapped = internalJobs.map((job) => ({
      source: "internal",
      job: job.job,
      company: job.company?.companyName || "",
      type: job.type,
      city: job.city,
      country: job.country,
      description: job.description,
      link: job.link,
      _id: job._id,
      raw: job,
    }));

    // =============== חיצוניות ==================
    const externalFilter: any = {
      $and: [
        searchTerm
          ? {
              $or: [
                { job: regex },
                { description: regex },
                { city: regex },
                { country: regex },
                { company: regex },
              ],
            }
          : {},

        company.length > 0 ? { company: { $in: company } } : {},
        city.length > 0 ? { city: { $in: city } } : {},
        country.length > 0 ? { country: { $in: country } } : {},
      ],
    };

    const externalJobs = await ExternalJobs.find(externalFilter).lean();

    const externalMapped = externalJobs.map((job) => ({
      source: "external",
      job: job.job,
      company: job.company,
      type: job.type || "-",
      city: job.city,
      country: job.country,
      description: job.description,
      link: job.finalUrl,
      _id: job._id,
      raw: job,
    }));

    // ❗ מאחד פנימי + חיצוני
    const results = [...internalMapped, ...externalMapped];

    return NextResponse.json(
      {
        total: results.length,
        jobs: results,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("❌ Error searching jobs:", err);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}
