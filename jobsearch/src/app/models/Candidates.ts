import mongoose from 'mongoose';

const CandidateSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['Rejected', 'HR Phone Interview', 'Technical Interview', 'Accepted','Final Interview','Recived an Offer','Submitted Resume'],
    default: 'Submitted Resume',
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
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
    required: true,
  }
}, { timestamps: true });

export default mongoose.models.Candidate || mongoose.model('Candidate', CandidateSchema);
