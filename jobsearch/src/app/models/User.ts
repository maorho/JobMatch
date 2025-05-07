import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, 
  fullname:{ type: String, required: true },
  recruiter:{type:Boolean},
  company:{type:String},
  phone: {type: String,required: true},
  resume: {type: String,required: true},
  currentJob: {type: String,default: '',},
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
