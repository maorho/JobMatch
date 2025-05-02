import mongoose from 'mongoose';

const JobSchema = new mongoose.Schema({
  job: { type: String, required: true },
  company: { type: String, required: true },
  type: { type: String, required: true },  
  location: { type: String, required: true}, 
  link:{ type: String, required: true },
  outsidesource:{ type: String }
});

export default mongoose.models.User || mongoose.model('Job', JobSchema);
