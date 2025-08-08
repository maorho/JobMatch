import mongoose from "mongoose";

const ExternalJobSchema = new mongoose.Schema({
    job:{
        type: String,
        required: true,
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
        unique:true,
    },
    finalUrl:{
        type: String,
        required: true,
    },
    description:{
        type: String,
        default:'',
    },
    skills:{
        type: [String],
        required: true,
    },
    seniority:{
        type: [String],
        required: true,
    }
},{timestamps:true});

export default mongoose.models.ExternalJobs || mongoose.model('ExternalJobs',ExternalJobSchema);
