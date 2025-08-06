import mongoose from "mongoose";

const FinalUrlSchema = new mongoose.Schema({
    url:{type:String,required: true,unique:true},
    finalUrl:{type:String,required: true},
    lastFetched:{type:Date,required: true,},
    status:{type: String,
    enum: ['Expierd', 'OK'],
    required: true,}
},{ timestamps: true });

export default mongoose.models.FinalUrls || mongoose.model('FinalUrls', FinalUrlSchema);