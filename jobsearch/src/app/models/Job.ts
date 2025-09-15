import mongoose from 'mongoose';
import Candidates from './Candidates';

const JobSchema = new mongoose.Schema({
  job: {
    type: String,
    required: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref:"Company",
  },
  type: {
    type: String,
    enum: ['On Site', 'Hybrid', 'Remote'],
    required: true,
  },
  city: {
    type: String,
    required: true, 
  },
  country: {
    type: String,
    required: true, 
  },
  link: {
    type: String,
    default: null,
  },
  outsidesource: {
    type: Boolean,
    default: false,
  },
  description: {
    type: String,
    default: '',
  },
  qualifications: {
    type: String,
    default: '',
  },
  publisher:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User",
  }
}, { timestamps: true });

JobSchema.pre("findOneAndDelete", async function (next) {
  const job = await this.model.findOne(this.getQuery());
  if (job) {
    await Candidates.deleteMany({ jobId: job._id });
  }
  next();
});
export default mongoose.models.Job || mongoose.model('Job', JobSchema);