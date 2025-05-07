import mongoose from 'mongoose';

const JobSchema = new mongoose.Schema({
  job: {
    type: String,
    required: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref:"Company",
    required: true,
  },
  type: {
    type: String,
    enum: ['On Site', 'Hybrid', 'Remote'],
    required: true,
  },
  location: {
    type: String,
    required: true, // עיר
  },
  country: {
    type: String,
    required: true, // עיר
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
    required:true,
  }
}, { timestamps: true });

export default mongoose.models.Job || mongoose.model('Job', JobSchema);
