import mongoose from "mongoose";    

const AddJobsScheme = new mongoose.Schema({
    candidateId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      status: {
        type: String,
        enum: ['Rejected', 'HR Phone Interview', 'Technical Interview', 'Accepted','Final Interview','Recived an Offer','Submitted Resume'],
        default: 'Submitted Resume',
      },
      jobTitle:{
        type:String,
        required:true,
      },
      company:{
        type:String,
        required:true,
      },
      jobType:{
        type:String,
        emun:["Hybrid","Remote","On Site"],
        required:true,
      },
      location:{
        type:String,
        required:true,
      },
      link:{
        type:String,
        required:true,
      },
},{ timestamps: true });

export default mongoose.models.AddedJobs || mongoose.model('AddedJobs', AddJobsScheme);
