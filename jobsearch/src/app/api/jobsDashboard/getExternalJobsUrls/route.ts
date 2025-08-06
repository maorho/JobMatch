import { connectToDatabase } from "@/app/lib/db";
import FinalUrls from "@/app/models/FinalUrls";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    try{
        await connectToDatabase();
        console.log("Start fetching URL's...");
        const final_urls = await FinalUrls.find({}, { url: 1, finalUrl: 1, _id: 0 }).limit(50);
        if(!final_urls){
            return NextResponse.json({msg:`url not found`},{status:404});
        }
        return NextResponse.json(final_urls);
    }
    catch(err){
        console.error("❌ Error fetching jobs:", err);
            return NextResponse.json(
              { message: "Failed to fetch jobs" },
              { status: 500 }
        );
    }
}
