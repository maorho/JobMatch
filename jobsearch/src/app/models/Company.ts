import mongoose from "mongoose";

const CompanySchema = new mongoose.Schema({
  companyName: {
    type: String,
    unique: true,
    required: true,
  },
}, { timestamps: true });

export default mongoose.models.Company || mongoose.model("Company", CompanySchema);
