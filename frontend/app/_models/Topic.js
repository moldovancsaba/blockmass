import mongoose from "mongoose";

const TopicSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // uuid v4 string
    title: { type: String, required: true },
    description: { type: String, default: "" },
    createdBy: { type: String, default: "system" },
  },
  { timestamps: true }
);

export default mongoose.models.Topic || mongoose.model("Topic", TopicSchema);
