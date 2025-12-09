import mongoose from 'mongoose';

const CandidateSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['Rejected', 'HR Phone Interview', 'Technical Interview', 'Accepted','Final Interview','Recived an Offer','Submitted Resume'],
    default: 'Submitted Resume',
  },
  jobModel: {
    type: String,
    enum: ['Job', 'ExternalJobs','AddedJobs'],
    required: true,
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'jobModel', 
    required: true,
  },
  candidateId:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  recruiterid:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }
}, { timestamps: true });

export default mongoose.models.Candidate || mongoose.model('Candidate', CandidateSchema);
