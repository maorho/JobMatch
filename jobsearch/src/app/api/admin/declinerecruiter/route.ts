import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { NextRequest, NextResponse } from "next/server";




export async function POST(req: NextRequest) {
    await connectToDatabase();
    const { recruiterId } = await req.json();

    const user = await User.findById(recruiterId);
    if (!user) {
        return new NextResponse("Recruiter not found", { status: 404 });
    }

    user.approved = false;
    await user.save();

    return NextResponse.json({ msg: "Recruiter declined successfully", status: 200 });
}
    