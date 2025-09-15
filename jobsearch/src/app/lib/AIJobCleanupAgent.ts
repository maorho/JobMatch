import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import OpenAI from "openai";
import * as cheerio from "cheerio";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class AIJobCleanupAgent {
  async run() {
    console.log("🚀 Starting job cleanup...");
    await connectToDatabase();

    const jobs = await ExternalJobs.find();
    let deletedCount = 0;
    let checkedCount = 0;
    let errors: string[] = [];

    for (const job of jobs) {
      const url = job.finalUrl || job.url;
      checkedCount++;

      try {
        const active = await this.isJobActiveAI(url);

        if (!active) {
          await ExternalJobs.deleteOne({ _id: job._id });
          deletedCount++;
          console.log(`🗑️ Deleted job ${job._id} (${url})`);
        } else {
          console.log(`✅ Job still active: ${job._id} (${url})`);
        }
      } catch (err: any) {
        errors.push(`❌ ${url}: ${err.message}`);
        console.error(`⚠️ Error checking ${url}`, err);
      }
    }

    const report = {
      total: jobs.length,
      checked: checkedCount,
      deleted: deletedCount,
      remaining: jobs.length - deletedCount,
      errors,
    };

    console.log("📊 Cleanup report:", report);
    console.log("✅ Cleanup finished.");

    return report;
  }

  async isJobActiveAI(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0 (JobCleanupBot/1.0)" },
      });

      if (!res.ok) {
        console.warn(`⚠️ ${url} returned HTTP ${res.status}`);
        return false;
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      const textContent = $("body").text().replace(/\s+/g, " ").trim();

      if (!textContent || textContent.length < 100) {
        console.warn(`⚠️ ${url} has too little content, skipping AI check`);
        return false;
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a classifier that determines if a job posting is still open or closed.",
          },
          {
            role: "user",
            content: `Here is the text from a job posting page:\n\n${textContent}\n\nIs this job still accepting applications? Reply with only 'true' if open or 'false' if closed.`,
          },
        ],
      });

      const answer = completion.choices[0].message?.content?.toLowerCase().trim();

      if (answer !== "true" && answer !== "false") {
        console.warn(`⚠️ Unexpected AI answer for ${url}: ${answer}`);
        return false;
      }

      return answer === "true";
    } catch (err) {
      console.warn(`⚠️ Failed to check job: ${url}`, err);
      return false;
    }
  }
}
