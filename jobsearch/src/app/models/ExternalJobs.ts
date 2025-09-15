import mongoose from "mongoose";

const ExternalJobSchema = new mongoose.Schema({
    job:{
        type: String,
        required: true,
    },
    company_description:{
        type: String,
        default:'',
    },
    company:{
        type: String,
        required: true,
    },
    city:{
        type: String,
        required: false,
    },
    country:{
        type: String,
        required: true,
    },
    url:{
        type: String,
        required: true,
    },
    finalUrl:{
        type: String,
        required: true,
        unique:true,
    },
    description:{
        type: String,
        default:'',
    },
    skills:{
        type: [String],
        required: true,
    },
    prefered_qualifications:{
        type: [String]
    },
    seniority:{
        type: [String],
        required: true,
    }
},{timestamps:true});

export default mongoose.models.ExternalJobs || mongoose.model('ExternalJobs',ExternalJobSchema);
