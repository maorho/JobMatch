import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { NextRequest, NextResponse } from "next/server";




export async function POST(req: NextRequest) {
    await connectToDatabase();
    const { recruiterId,status } = await req.json();

    const user = await User.findById(recruiterId);
    if (!user) {
        return new NextResponse("Recruiter not found", { status: 404 });
    }

    user.approved = (status === 'approve')? true : false;
    await user.save();

    return NextResponse.json({ msg: "Recruiter status changed successfully", status: 200 });
}