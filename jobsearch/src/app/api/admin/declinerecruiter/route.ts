import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/authGuard";

export async function POST(req: NextRequest) {
    if (!(await requireAdmin(req)))
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    