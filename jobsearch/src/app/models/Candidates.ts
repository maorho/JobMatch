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

// One application per (person, posting): the apply routes turn the 11000 into a
// 409. Production needs src/scripts/dedupe-candidates.ts before this index can
// build. The jobId index serves "who applied to this posting" and the feed's
// applied-ids lookup (covered: candidateId + jobId only).
CandidateSchema.index({ candidateId: 1, jobId: 1 }, { unique: true });
CandidateSchema.index({ jobId: 1 });

export default mongoose.models.Candidate || mongoose.model('Candidate', CandidateSchema);
